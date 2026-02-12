 1. Create a GitHub repo and push this code
  2. Set up Supabase project at supabase.com:
    - Run supabase/migrations/001_initial_schema.sql in SQL Editor
    - Run supabase/migrations/002_seed_characters.sql in SQL Editor
    - Enable Email auth in Authentication settings
  3. Set up external services:
    - iFlytek ISE + TTS (get app_id, api_key, api_secret)
    - Gemini API key from Google AI Studio
    - Fish Audio or ElevenLabs account (create voice clones, get voice IDs, update the PLACEHOLDER_VOICE_IDs in seed data)
  4. Deploy to Vercel:
    - Connect GitHub repo
    - Set all environment variables from .env.local.example
  5. Add your character images to public/characters/meilin/ and public/characters/haoran/ (expression PNGs: neutral.png, happy.png, proud.png, etc.)