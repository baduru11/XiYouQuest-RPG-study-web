import type { Metadata } from "next";
import Link from "next/link";

// Rendered per request so the proxy's CSP nonce reaches the inline scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Notice | XiYouQuest",
  description:
    "What personal data XiYouQuest collects, who can see it, where it is processed, and how to access or delete it.",
};

const LAST_UPDATED = "25 September 2026";

const PROCESSORS = [
  {
    service: "Microsoft Entra ID (HKUST tenants)",
    role: "Sign-in with your HKUST account",
    receives: "Your HKUST sign-in",
    location: "HKUST's Microsoft tenants",
  },
  {
    service: "Supabase",
    role: "Database and file storage",
    receives: "All account, practice, chat and learning records; avatar and scene images",
    location: "Mumbai, India (AWS ap-south-1)",
  },
  {
    service: "Vercel",
    role: "Hosts the website and its server code",
    receives: "Every request you make to XiYouQuest",
    location: "United States (primary processing), global edge network",
  },
  {
    service: "iFLYTEK Open Platform (SYNLAN Technology Pte. Ltd.)",
    role: "Speech recognition, pronunciation scoring, text-to-speech",
    receives: "Your voice recordings and the text being practised or spoken",
    location: "Singapore",
  },
  {
    service: "OpenRouter",
    role: "Routes AI requests to a model host",
    receives:
      "Practice results, chat messages and speech transcripts needed for feedback, study plans and companion replies",
    location: "United States",
  },
  {
    service: "AI model hosts chosen by OpenRouter",
    role: "Generate feedback, study plans, companion replies and scene images",
    receives: "The same request content as OpenRouter",
    location:
      "Hosts outside mainland China that retain no prompts and do not train on them (for example DeepInfra, Microsoft Azure, Google Vertex AI)",
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-4 py-10">
      <article className="mx-auto w-full max-w-3xl pixel-border bg-card p-6 sm:p-8 space-y-8 text-foreground">
        <header className="space-y-3">
          <h1 className="font-pixel text-base text-primary">XiYouQuest Privacy Notice</h1>
          <p className="text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
          <p
            role="note"
            className="border-2 border-amber-600/60 bg-amber-500/10 p-3 text-sm"
          >
            <strong>Draft for review.</strong> This notice is awaiting review by the
            responsible HKUST unit and the University Data Privacy Officer. It describes
            how the system works today; wording may change after that review.
          </p>
        </header>

        <section aria-labelledby="collect" className="space-y-3">
          <h2 id="collect" className="font-pixel text-sm">What we collect</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <strong>Your HKUST identity:</strong> name, HKUST email address and, if your
              account provides one, a profile picture, received from HKUST single sign-on.
            </li>
            <li>
              <strong>Your learning record:</strong> practice sessions and scores,
              pronunciation scores, mock-exam results with AI feedback, study plans,
              quest progress, experience points, streaks and achievements.
            </li>
            <li>
              <strong>Companion chats:</strong> your messages, transcripts of what you say,
              and the scores for them.
            </li>
            <li>
              <strong>Images:</strong> an avatar you upload, and scene images generated for
              your chats.
            </li>
            <li>
              <strong>Security and technical records:</strong> for each sign-in session,
              your IP address and browser; a security log of sign-ins, refused sign-ins,
              data exports, account deletions, avatar uploads and rate-limit refusals.
            </li>
          </ul>
          <p className="text-sm leading-relaxed">
            <strong>Voice recordings are not stored by XiYouQuest.</strong> They are sent to
            iFLYTEK for scoring and recognition and discarded by XiYouQuest afterwards.
          </p>
        </section>

        <section aria-labelledby="purpose" className="space-y-3">
          <h2 id="purpose" className="font-pixel text-sm">Why we use it</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>To run Putonghua (PSC) practice: scoring, feedback and study plans.</li>
            <li>To run the game and social features: levels, the leaderboard and friends.</li>
            <li>To keep the service secure: preventing abuse and investigating faults or incidents.</li>
          </ul>
          <p className="text-sm leading-relaxed">
            XiYouQuest is a practice tool. Its scores are not official PSC results and are
            not used for grading. We do not use your data for marketing or advertising.
          </p>
          <p className="text-sm leading-relaxed">
            Signing in with an HKUST account is required to use XiYouQuest. Microphone
            access is needed only for speaking and pronunciation exercises.
          </p>
        </section>

        <section aria-labelledby="visible" className="space-y-3">
          <h2 id="visible" className="font-pixel text-sm">What other students can see</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <strong>Any signed-in user</strong> can find you by name or friend code and
              see your display name, avatar, level and friend code. The global leaderboard
              shows the top 20 students by experience points, accuracy or streak, with
              their names and avatars.
            </li>
            <li>
              <strong>Your friends</strong> also see your total experience points, login
              streak, number of practice sessions, average practice score for each
              component, your achievements with their dates, and your chosen companion.
            </li>
            <li>
              <strong>Only you</strong> see your mock-exam results, chats and transcripts,
              study plans, detailed practice history and AI feedback.
            </li>
          </ul>
          <p className="text-sm leading-relaxed">
            Your display name starts as your name from HKUST sign-on and can be changed on
            your Profile page. There is currently no setting to hide yourself from search
            or the leaderboard; this is under review.
          </p>
        </section>

        <section aria-labelledby="where" className="space-y-3">
          <h2 id="where" className="font-pixel text-sm">Who processes it, and where</h2>
          <p className="text-sm leading-relaxed">
            These service providers process data on our behalf. All of them are outside
            Hong Kong, so using XiYouQuest transfers your data outside Hong Kong.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-border">
                  <th scope="col" className="py-2 pr-3 font-semibold">Service</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Role</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Receives</th>
                  <th scope="col" className="py-2 font-semibold">Location</th>
                </tr>
              </thead>
              <tbody>
                {PROCESSORS.map((row) => (
                  <tr key={row.service} className="border-b border-border align-top">
                    <th scope="row" className="py-2 pr-3 font-medium">{row.service}</th>
                    <td className="py-2 pr-3">{row.role}</td>
                    <td className="py-2 pr-3">{row.receives}</td>
                    <td className="py-2">{row.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="keep" className="space-y-3">
          <h2 id="keep" className="font-pixel text-sm">How long we keep it</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>Your learning record and chats are kept while your account exists.</li>
            <li>Security log entries are deleted after 180 days.</li>
            <li>A sign-in session ends after 8 hours without use.</li>
            <li>
              When you delete your account, your records and images are erased at once.
              Security log entries about the account remain until they expire.
            </li>
          </ul>
        </section>

        <section aria-labelledby="rights" className="space-y-3">
          <h2 id="rights" className="font-pixel text-sm">Your rights</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <strong>Access:</strong> download a copy of your data from{" "}
              <em>Profile, Your Data, Download</em>.
            </li>
            <li>
              <strong>Correction:</strong> change your display name on your Profile page. To
              correct anything else, contact the Data Privacy Officer.
            </li>
            <li>
              <strong>Deletion:</strong> delete your account from{" "}
              <em>Profile, Danger Zone, Delete Account</em>.
            </li>
          </ul>
        </section>

        <section aria-labelledby="contact" className="space-y-3">
          <h2 id="contact" className="font-pixel text-sm">Contact</h2>
          <p className="text-sm leading-relaxed">
            Questions about your personal data: the University Data Privacy Officer,{" "}
            <a className="underline underline-offset-2" href="mailto:ispdpo@ust.hk">ispdpo@ust.hk</a>.
            To report a security problem: HKUST ITSO,{" "}
            <a className="underline underline-offset-2" href="mailto:security@ust.hk">security@ust.hk</a>.
          </p>
        </section>

        <footer className="border-t-2 border-border pt-4 text-sm">
          <Link href="/login" className="underline underline-offset-2">Back to sign-in</Link>
        </footer>
      </article>
    </main>
  );
}
