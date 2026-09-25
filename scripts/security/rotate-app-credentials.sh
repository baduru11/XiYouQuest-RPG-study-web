#!/bin/zsh
# Rotate XiYouQuest's application credentials (owner actions OA-1 and OA-16).
#
# Run by an owner on a Mac with the Supabase CLI login (macOS keychain entry
# "Supabase CLI") and the Vercel CLI login for team `xyq`, from a clone linked
# to the Vercel project. It moves credential values between Supabase and
# Vercel through pipes and prints none of them:
#   1. copies Supabase's current `default` secret and publishable API keys into
#      Vercel as SUPABASE_SECRET_KEY and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#      (Production and Preview);
#   2. gives the database role better_auth_app a new random password, sent to
#      the database only as a SCRAM verifier, proves a verified-TLS login with
#      it through the pooler, and only then stores the connection string in
#      Vercel as BETTER_AUTH_DATABASE_URL (Production and Preview).
# Safe to run again: each run re-copies the keys and rotates the role password.
# New values take effect at the next production deployment.
set -euo pipefail

readonly REF="yfoifmqjhavxidomgids"
readonly POOLER_HOST="aws-1-ap-south-1.pooler.supabase.com"
readonly SCOPE="xyq"
readonly API="https://api.supabase.com/v1/projects/$REF"
readonly UA="User-Agent: curl/8.7.1"

repo="${0:A:h:h:h}"
cd "$repo"
work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT

step() { print -P "%F{cyan}==>%f $1"; }
ok() { print -P "    %F{green}ok%f $1"; }
fail() {
  print -P "    %F{red}stopped:%f $1" >&2
  [[ -s "$work/cli.err" ]] && tail -3 "$work/cli.err" >&2
  exit 1
}

command -v vercel >/dev/null || fail "the Vercel CLI is not installed"
[[ -f .vercel/project.json ]] || fail "this clone is not linked to the Vercel project (vercel link --scope $SCOPE)"
token="$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)" || fail "no Supabase CLI login in the keychain (supabase login)"

vercel_env() { # name target sensitivity; value on stdin
  vercel env add "$1" "$2" --scope "$SCOPE" "$3" --force --yes >/dev/null 2>"$work/cli.err" \
    || fail "could not set $1 for $2"
}

step "1/4 Read Supabase's current API keys"
keys="$(curl -sS --fail -H "Authorization: Bearer $token" -H "$UA" "$API/api-keys?reveal=true" 2>"$work/cli.err")" \
  || fail "could not read the API keys"
pick='import json,sys
kind=sys.argv[1]
print(next(k["api_key"] for k in json.load(sys.stdin) if k.get("type")==kind and k.get("name")=="default"))'
secret_key="$(print -r -- "$keys" | /usr/bin/python3 -c "$pick" secret)"
publishable_key="$(print -r -- "$keys" | /usr/bin/python3 -c "$pick" publishable)"
unset keys
[[ "$secret_key" == sb_secret_* ]] || fail "the default secret key has an unexpected format"
[[ "$publishable_key" == sb_publishable_* ]] || fail "the default publishable key has an unexpected format"
ok "secret and publishable keys found"

step "2/4 Store the keys in Vercel (Production and Preview)"
for target in production preview; do
  print -rn -- "$secret_key" | vercel_env SUPABASE_SECRET_KEY "$target" --sensitive
  print -rn -- "$publishable_key" | vercel_env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$target" --no-sensitive
done
unset secret_key publishable_key
ok "SUPABASE_SECRET_KEY and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY set"

step "3/4 Give the login system's database role a new password"
password="$(openssl rand -hex 32)"
verifier="$(print -rn -- "$password" | /usr/bin/python3 -c 'import base64,hashlib,hmac,os,sys
pw=sys.stdin.read().encode(); salt=os.urandom(16); it=4096
salted=hashlib.pbkdf2_hmac("sha256", pw, salt, it)
client=hmac.new(salted, b"Client Key", "sha256").digest()
stored=hashlib.sha256(client).digest()
server=hmac.new(salted, b"Server Key", "sha256").digest()
b=lambda x: base64.b64encode(x).decode()
print("SCRAM-SHA-256$%d:%s$%s:%s" % (it, b(salt), b(stored), b(server)))')"
print -r -- "ALTER ROLE better_auth_app WITH LOGIN PASSWORD '$verifier';" \
  | /usr/bin/python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' \
  | curl -sS --fail -X POST -H "Authorization: Bearer $token" -H "$UA" -H "Content-Type: application/json" \
      --data @- "$API/database/query" >/dev/null 2>"$work/cli.err" \
  || fail "could not set the role password"
unset verifier
url="postgresql://better_auth_app.$REF:$password@$POOLER_HOST:6543/postgres"
unset password

check='const { Client } = require("pg");
const fs = require("fs");
const ca = fs.readFileSync("src/lib/db-tls.ts", "utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0];
const connectionString = fs.readFileSync(0, "utf8");
(async () => {
  const client = new Client({ connectionString, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  await client.connect();
  const { rows } = await client.query("select current_user as who, (select count(*) from better_auth.jwks)::int as jwks");
  await client.end();
  if (rows[0].who !== "better_auth_app") throw new Error("connected as " + rows[0].who);
  console.log("    logged in as " + rows[0].who + " over verified TLS; auth tables readable");
})().catch((e) => { console.error("    login attempt failed: " + (e.code || "") + " " + String(e.message).slice(0, 80)); process.exit(1); });'
connected=0
for attempt in 1 2 3 4 5 6; do
  if print -rn -- "$url" | NODE_PATH="$repo/node_modules" node -e "$check"; then connected=1; break; fi
  sleep 10
done
[[ "$connected" == 1 ]] || fail "the new role could not log in; Vercel was not changed"
ok "new role verified"

step "4/4 Point Vercel's BETTER_AUTH_DATABASE_URL at the new role"
for target in production preview; do
  print -rn -- "$url" | vercel_env BETTER_AUTH_DATABASE_URL "$target" --sensitive
done
unset url token
ok "BETTER_AUTH_DATABASE_URL updated"

print -P "%F{green}Finished.%f Nothing above is a secret. Tell Claude it is done."
