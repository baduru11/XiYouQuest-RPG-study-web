-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  total_xp INTEGER DEFAULT 0 NOT NULL,
  current_level INTEGER DEFAULT 1 NOT NULL,
  last_login_date DATE,
  login_streak INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- USER PROGRESS (per component)
-- ============================================
CREATE TABLE public.user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  component SMALLINT CHECK (component BETWEEN 1 AND 5) NOT NULL,
  questions_attempted INTEGER DEFAULT 0 NOT NULL,
  questions_correct INTEGER DEFAULT 0 NOT NULL,
  best_streak INTEGER DEFAULT 0 NOT NULL,
  total_practice_time_seconds INTEGER DEFAULT 0 NOT NULL,
  last_practiced_at TIMESTAMPTZ,
  UNIQUE(user_id, component)
);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- CHARACTERS
-- ============================================
CREATE TABLE public.characters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  personality_description TEXT NOT NULL,
  personality_prompt TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  unlock_cost_xp INTEGER DEFAULT 0 NOT NULL,
  is_default BOOLEAN DEFAULT false NOT NULL
);

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Characters are publicly readable"
  ON public.characters FOR SELECT
  USING (true);

-- ============================================
-- CHARACTER EXPRESSIONS
-- ============================================
CREATE TABLE public.character_expressions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE NOT NULL,
  expression_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  UNIQUE(character_id, expression_name)
);

ALTER TABLE public.character_expressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Expressions are publicly readable"
  ON public.character_expressions FOR SELECT
  USING (true);

-- ============================================
-- CHARACTER SKINS
-- ============================================
CREATE TABLE public.character_skins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE NOT NULL,
  skin_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  required_affection_level INTEGER DEFAULT 5 NOT NULL
);

ALTER TABLE public.character_skins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Skins are publicly readable"
  ON public.character_skins FOR SELECT
  USING (true);

-- ============================================
-- USER CHARACTERS (unlocks, affection, selection)
-- ============================================
CREATE TABLE public.user_characters (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  affection_xp INTEGER DEFAULT 0 NOT NULL,
  affection_level INTEGER DEFAULT 1 NOT NULL,
  active_skin_id UUID REFERENCES public.character_skins(id) ON DELETE SET NULL,
  is_selected BOOLEAN DEFAULT false NOT NULL,
  PRIMARY KEY (user_id, character_id)
);

ALTER TABLE public.user_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own characters"
  ON public.user_characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own characters"
  ON public.user_characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own characters"
  ON public.user_characters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_unlock_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_characters (user_id, character_id, is_selected)
  SELECT NEW.id, c.id, (ROW_NUMBER() OVER (ORDER BY c.name) = 1)
  FROM public.characters c
  WHERE c.is_default = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_unlock_defaults();

-- ============================================
-- PRACTICE SESSIONS
-- ============================================
CREATE TABLE public.practice_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  character_id UUID REFERENCES public.characters(id) NOT NULL,
  component SMALLINT CHECK (component BETWEEN 1 AND 5) NOT NULL,
  score REAL DEFAULT 0 NOT NULL,
  xp_earned INTEGER DEFAULT 0 NOT NULL,
  duration_seconds INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON public.practice_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.practice_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- PRACTICE DETAILS
-- ============================================
CREATE TABLE public.practice_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.practice_sessions(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  user_answer TEXT,
  is_correct BOOLEAN DEFAULT false NOT NULL,
  pronunciation_score REAL,
  feedback TEXT
);

ALTER TABLE public.practice_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own details"
  ON public.practice_details FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.practice_sessions ps
      WHERE ps.id = session_id AND ps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own details"
  ON public.practice_details FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.practice_sessions ps
      WHERE ps.id = session_id AND ps.user_id = auth.uid()
    )
  );

-- ============================================
-- QUESTION BANKS
-- ============================================
CREATE TABLE public.question_banks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  component SMALLINT CHECK (component BETWEEN 1 AND 5) NOT NULL,
  set_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  pinyin TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Question banks are publicly readable"
  ON public.question_banks FOR SELECT
  USING (true);
