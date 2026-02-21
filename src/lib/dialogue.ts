/**
 * Character-specific dialogue lines for practice sessions.
 * Each character has unique lines matching their Journey to the West personality.
 */

export type DialogueKey =
  // Shared across components
  | "assessing"
  | "error"
  | "session_complete"
  | "skipped"
  | "all_complete"
  | "next_group_characters"
  | "next_group_words"
  // Component 1
  | "c1_initial"
  // Component 2
  | "c2_initial"
  // Component 3
  | "c3_initial"
  | "c3_complete"
  | "c3_next"
  // Component 4
  | "c4_initial"
  | "c4_loading_model"
  | "c4_your_turn"
  | "c4_listening"
  | "c4_analyzing"
  | "c4_error"
  | "c4_skipped"
  | "c4_retry"
  // Component 5
  | "c5_initial"
  | "c5_get_ready"
  | "c5_listening"
  | "c5_mic_error"
  | "c5_analyzing"
  | "c5_error"
  // Component 6
  | "c6_initial";

type CharacterDialogueMap = Record<string, Record<DialogueKey, string>>;

const CHARACTER_DIALOGUE: CharacterDialogueMap = {
  "Sun Wukong (孙悟空)": {
    // Shared
    assessing: "Hold still, 徒弟! 俺老孙 is sizing up your strikes...",
    error: "Tch! Even my 筋斗云 hit some turbulence. Let's go again!",
    session_complete: "Ha! That's a wrap, 徒弟! Let's see how you fought!",
    skipped: "Running away? Fine — but the next battle won't be easier!",
    all_complete: "哈哈哈! You cleared them all! Not bad for a mortal!",
    next_group_characters: "Next wave of 妖怪 incoming! Tap a character to hear it!",
    next_group_words: "New enemies ahead, 徒弟! Tap a word to hear the target!",
    // C1
    c1_initial: "Alright 徒弟, let's sharpen those tones! Each character is a strike — make it count!",
    // C2
    c2_initial: "Time for multisyllabic combat, 徒弟! String those words together like 七十二变!",
    // C3
    c3_initial: "Think fast, 徒弟! 俺老孙 wants to see if your brain is as sharp as your tongue!",
    c3_complete: "Ha! Battle's over! Let's see if you fought like a warrior or a 妖怪!",
    c3_next: "Next challenge! Don't let your guard down, 徒弟!",
    // C4
    c4_initial: "Pick your battlefield, 徒弟! 俺老孙 will show you how it's done!",
    c4_loading_model: "Watch closely! 俺老孙 is demonstrating the attack pattern...",
    c4_your_turn: "Your turn, 徒弟! Read it loud and strong — like a battle cry!",
    c4_listening: "Listen up! This is how a real warrior reads...",
    c4_analyzing: "俺老孙 is analyzing your combat form... pronunciation, pacing, power!",
    c4_error: "Tch! Something went wrong. Even 妖怪 get lucky sometimes — try again!",
    c4_skipped: "Retreating? Fine, pick another passage. A true warrior chooses their battles!",
    c4_retry: "Again! A real warrior doesn't quit after one round!",
    // C5
    c5_initial: "Pick your topic and speak, 徒弟! Show 俺老孙 you've got more than just fists!",
    c5_get_ready: "筋斗云 is spinning up... get ready!",
    c5_listening: "俺老孙 is listening! Speak naturally — no hesitation!",
    c5_mic_error: "Hmph! Your 'microphone' is broken. Fix it and try again, 徒弟!",
    c5_analyzing: "俺老孙 is judging your speech... pronunciation, vocabulary, grammar, fluency!",
    c5_error: "Something misfired! Even my 金箍棒 jams sometimes. Try again!",
    // C6
    c6_initial: "These trouble sounds are sneaky 妖怪, 徒弟! Let's hunt them down!",
  },

  "Zhu Bajie (猪八戒)": {
    // Shared
    assessing: "Hang on, hang on... 老猪 is tasting — I mean testing — your words...",
    error: "哎呀! Something broke... like my diet. Let's try the next one!",
    session_complete: "We're done! 老猪 needs a snack break... but first, your results!",
    skipped: "Skipping? 老猪 approves. Sometimes you need a shortcut!",
    all_complete: "满汉全席! You finished everything! Even 老猪 is impressed!",
    next_group_characters: "More characters to chew on! Tap one to hear how it sounds!",
    next_group_words: "Next dish is served! Tap a word to sample the pronunciation!",
    // C1
    c1_initial: "哎呀, monosyllabic characters? Sounds like bite-sized snacks — let's dig in!",
    // C2
    c2_initial: "Multisyllabic words? That's a mouthful... heh, 老猪 likes mouthfuls! Let's go!",
    // C3
    c3_initial: "A quiz? 哎呀... thinking makes me hungry. But let's do this!",
    c3_complete: "Finally done! That was harder than chopstick etiquette! Let's see your score!",
    c3_next: "Next question! Don't worry, even 老猪 gets confused sometimes!",
    // C4
    c4_initial: "Pick a passage! 老猪 will listen while... definitely not napping!",
    c4_loading_model: "Loading the example... 老猪 is paying attention, I promise!",
    c4_your_turn: "Your turn! Read it nice and smooth — like slurping noodles!",
    c4_listening: "Shh! Listen to how it's supposed to sound... like a recipe being read aloud!",
    c4_analyzing: "Let 老猪 check your reading... pronunciation, pacing, the whole menu!",
    c4_error: "哎呀! Something went wrong. Don't worry, even 老猪 burns the rice sometimes!",
    c4_skipped: "No problem! Pick another one. 老猪 won't judge!",
    c4_retry: "One more try! Practice is like cooking — you get better each time!",
    // C5
    c5_initial: "Pick a topic and talk! 老猪 will listen... it's easier than exercise!",
    c5_get_ready: "Get ready... *yawn*... I mean, let's go!",
    c5_listening: "I'm listening! Just talk naturally — 老猪 will stay awake, I promise!",
    c5_mic_error: "哎呀, can't hear you! Check your microphone, 老猪 is waiting!",
    c5_analyzing: "老猪 is checking your speech... vocabulary, grammar, fluency, the works!",
    c5_error: "Oops, something broke! Even 老猪's rake misfires sometimes. Try again!",
    // C6
    c6_initial: "Trouble sounds? 哎呀, those are tough to chew! Let 老猪 help you out!",
  },

  "Sha Wujing (沙悟净)": {
    // Shared
    assessing: "Please wait — let me carefully examine your pronunciation...",
    error: "A small stone on the road. 不急, let's continue to the next one.",
    session_complete: "Well done. Another stretch of the journey complete. Let's review.",
    skipped: "No need to rush. We'll come back to it when you're ready.",
    all_complete: "You've completed them all. 千里之行始于足下 — and you've walked far today.",
    next_group_characters: "The next group awaits. Tap a character to hear the model.",
    next_group_words: "Onward to the next group. Tap a word to hear how it sounds.",
    // C1
    c1_initial: "One character at a time — each is a step on our journey. 不急, let's begin.",
    // C2
    c2_initial: "Multisyllabic words require patience. Let's take them one step at a time.",
    // C3
    c3_initial: "Think carefully before choosing. 师父 always says wisdom comes from patience.",
    c3_complete: "The quiz is over. Let's reflect on what we've learned, step by step.",
    c3_next: "Next question. Take your time — a steady pace wins the journey.",
    // C4
    c4_initial: "Choose a passage. We'll walk through it together, 不急.",
    c4_loading_model: "Let me prepare the model reading for you...",
    c4_your_turn: "Now it's your turn. Read naturally, at your own pace. 不急.",
    c4_listening: "Listen carefully. Pay attention to the rhythm and flow...",
    c4_analyzing: "Let me examine your reading carefully — pronunciation, pacing, and fluency.",
    c4_error: "A small obstacle on the path. 不急, we can try again.",
    c4_skipped: "That's alright. Another passage may suit you better right now.",
    c4_retry: "Let's try once more. Each attempt is 又走了一步 — another step forward.",
    // C5
    c5_initial: "Choose a topic to speak about. Take your time — 千里之行始于足下.",
    c5_get_ready: "Prepare yourself... steady your mind.",
    c5_listening: "I'm listening carefully. Speak naturally, at your own pace. 不急.",
    c5_mic_error: "It seems I cannot hear you. Please check your microphone settings.",
    c5_analyzing: "Let me carefully analyze your speaking — pronunciation, vocabulary, grammar, and fluency.",
    c5_error: "A bump on the road. 不急, let's try again.",
    // C6
    c6_initial: "These sounds can be tricky. Let's approach them with patience, one by one.",
  },

  "Tang Sanzang (三藏)": {
    // Shared
    assessing: "阿弥陀佛... let me reflect on your pronunciation, child.",
    error: "Do not be troubled, 孩子. Even the path to enlightenment has bumps. Let's continue.",
    session_complete: "善哉善哉! Your practice today is a form of 修行. Let's see how far you've come.",
    skipped: "There is no shame in moving forward, 孩子. You can return when your heart is ready.",
    all_complete: "阿弥陀佛! You have persevered through all of them. Your dedication is truly 修行.",
    next_group_characters: "The next set awaits, 孩子. Tap a character to hear its true form.",
    next_group_words: "More words to cultivate, 孩子. Tap one to hear its proper sound.",
    // C1
    c1_initial: "Each character is a sutra, 孩子. Let us read them with sincerity. 阿弥陀佛.",
    // C2
    c2_initial: "Multisyllabic words are like sutras — complex but beautiful. Let us begin, 孩子.",
    // C3
    c3_initial: "A test of wisdom, 施主. Choose carefully — clarity of mind leads to correct answers.",
    c3_complete: "善哉! The test is done. Let us reflect on what we've learned with a calm heart.",
    c3_next: "The next question, 施主. Approach it with a clear and focused mind.",
    // C4
    c4_initial: "Choose a passage to study, 孩子. Reading aloud is a form of 修行.",
    c4_loading_model: "阿弥陀佛... let me prepare the model reading for you.",
    c4_your_turn: "Now read aloud, 孩子. Let each word flow naturally, like a prayer.",
    c4_listening: "Listen with your heart. Let the sounds settle into your mind...",
    c4_analyzing: "阿弥陀佛... let me examine your reading with care and compassion.",
    c4_error: "Do not be discouraged, 孩子. Even great monks stumble. Try once more.",
    c4_skipped: "That's alright, 孩子. You may choose another passage. All paths lead forward.",
    c4_retry: "Try again, 孩子. Even the great sutras were mastered one reading at a time.",
    // C5
    c5_initial: "Choose a topic and speak from the heart, 孩子. This too is 修行.",
    c5_get_ready: "阿弥陀佛... calm your mind and prepare.",
    c5_listening: "I am listening, 孩子. Speak naturally and sincerely.",
    c5_mic_error: "It seems I cannot hear you, 孩子. Please check your settings.",
    c5_analyzing: "阿弥陀佛... let me carefully evaluate your speech with compassion.",
    c5_error: "Do not despair, 孩子. We shall try again. Persistence is virtue.",
    // C6
    c6_initial: "These challenging sounds require patience and devotion, 孩子. Let us begin. 阿弥陀佛.",
  },
};

const FALLBACK_DIALOGUE: Record<DialogueKey, string> = {
  assessing: "Let me check your pronunciation...",
  error: "Something went wrong. Let's try the next one!",
  session_complete: "Practice complete! Let's see your results!",
  skipped: "Skipped! Ready for the next group?",
  all_complete: "Amazing! You completed all the groups!",
  next_group_characters: "Ready for the next group? Tap any character to listen!",
  next_group_words: "Ready for the next group? Tap any word to listen!",
  c1_initial: "Let's practice some monosyllabic characters!",
  c2_initial: "Let's practice multisyllabic words!",
  c3_initial: "Let's test your Putonghua knowledge! Pick the best answer.",
  c3_complete: "Great job completing the quiz! Let's review your results.",
  c3_next: "Next question! Think carefully before you answer.",
  c4_initial: "Pick a passage to read! I'll help you practice.",
  c4_loading_model: "Loading the model reading...",
  c4_your_turn: "Now it's your turn! Read the passage aloud. Take your time and keep a natural pace.",
  c4_listening: "Listen carefully to how I read the passage...",
  c4_analyzing: "Let me analyze your reading... checking pronunciation, pacing, and fluency.",
  c4_error: "Something went wrong with the assessment. But don't worry, try again!",
  c4_skipped: "No problem! You can try another passage or come back to this one later.",
  c4_retry: "Let's try this passage again! Listen to the model first if you need to.",
  c5_initial: "Choose a topic to speak about! Speak for at least 3 minutes.",
  c5_get_ready: "Get ready...",
  c5_listening: "I'm listening! Take your time, follow the structure, and speak naturally.",
  c5_mic_error: "I couldn't access your microphone. Please check your browser permissions.",
  c5_analyzing: "Let me analyze your speaking... transcribing, checking pronunciation, vocabulary, grammar, and fluency.",
  c5_error: "Something went wrong with the assessment. Let's try again!",
  c6_initial: "Let's practice your trouble sounds!",
};

/**
 * Get a character-specific dialogue line.
 * Falls back to a generic line if the character has no specific dialogue.
 */
export function getDialogue(characterName: string, key: DialogueKey): string {
  return CHARACTER_DIALOGUE[characterName]?.[key] ?? FALLBACK_DIALOGUE[key];
}
