// src/lib/quest/story-text.ts
import type { StageNumber } from "./types";

interface StageStory {
  /** Opening text before the stage title */
  intro: string[];
  /** Text shown after victory (companion recruitment, etc.) */
  outro: string[];
}

export const STAGE_STORIES: Record<StageNumber, StageStory> = {
  1: {
    intro: [
      "Long ago, sacred scriptures brought from the West stabilized the world through the power of language. However, over centuries, people have grown careless \u2014 misusing tones, weakening pronunciation.",
      "From the broken sounds, monsters were born. The source of corruption comes from the West, where an unknown shadow figure disrupts the language.",
      "You are an ordinary traveler with a vow to defeat the figure that causes chaos, and you begin the Journey to the West.",
      "As you start your journey, you encounter a powerful entity: The Demon King of Turmoil. Your voice trembles, your syllables lack strength. You fall to your knees.",
      "The sky opens wide. A divine staff descends \u2014 once wielded by Sun Wukong himself. A celestial voice speaks: \"Clarity is strength. Speak correctly, and the world will answer.\"",
      "The divine staff glows golden as it binds to you. It can only be wielded when you correctly pronounce the Chinese characters.",
    ],
    outro: [
      "You seal the Demon King of Turmoil by speaking in clarity. The celestial being grants you a map of the Western Palace.",
      "You rise again, feeling more capable and energetic. Your journey to the West begins.",
    ],
  },
  2: {
    intro: [
      "An enormous river shifts and swirls, barring your path. The air is thick with the scent of rain and splashing water.",
      "Water spirits lurk inside the violent river, distorting and bending your pitch, weakening your will to fight back.",
      "You see a small woman drowning before your eyes \u2014 fighting to escape the violent river pulling her down.",
    ],
    outro: [
      "With every truth spoken, the water spirits weaken and the river calms. You pull the woman from the calm water.",
      "She introduces herself as Samjang, a Buddhist monk destined to travel to the West. She will now accompany you on your journey.",
      "Sam Jang has joined your party!",
    ],
  },
  3: {
    intro: [
      "The air becomes thicker. A bright golden landscape stretches before you \u2014 the Desert of Illusion.",
      "The sun dries your throat. You feel immense pressure, yet see nothing but a wasteland filled with weapons of fallen adventurers.",
      "A pale bone demon appears \u2014 the Lady of Bleached Bones. She disguises herself with misleading voices.",
    ],
    outro: [
      "Your perfect pronunciation breaks her illusion. Before she vanishes, she warns: \"The West will consume all sounds.\"",
      "You find a man crouching nearby. He introduces himself as Sha Wujing, a water sorcerer banished from heaven.",
      "Sha Wujing has joined your party!",
    ],
  },
  4: {
    intro: [
      "Night falls upon the landscape. You are met with a gigantic mountain, lit only by the moon guiding your path.",
      "An eerie howl echoes deep in the mountains. The wind rustles, hiding an unknown monster lurking in the woods.",
      "A Moonfang Wolf Demon rushes towards you \u2014 eyes clear like the moon, as if it knows everything about you.",
    ],
    outro: [
      "The fight between you and the demon echoes across the moonlit mountain.",
      "The staff pierces through the wolf's skin, eventually making it retreat to its hiding place. You continue onward.",
    ],
  },
  5: {
    intro: [
      "You trek down to ground level and enter a territory where everything is foggy. Bamboo sticks reach high into the sky.",
      "A loud rumble comes from deep in the ground, growing closer. A demonic entity with red eyes and brown skin appears.",
      "The Bull Demon King \u2014 once powerful, now corrupted by the distorted sound of the West. He rushes towards you.",
    ],
    outro: [
      "The bull's flame extinguishes, his strength depleted. He speaks in a deep voice: \"You are walking on your own shadow. Halt here or face the consequences.\"",
      "With victory in hand, you move on through the clearing mist.",
    ],
  },
  6: {
    intro: [
      "You finish walking through the misty bamboo forest. The sun greets you with golden light as the night ends.",
      "A vast open plain stretches before you \u2014 too peaceful to be true. The sky is pale and clear, birds chirping gently.",
      "From the sky, an entity floats down. It is not hostile. A deep voice shakes your body: \"You shall pass the Heavenly Principles trial and prove yourself worthy.\"",
      "The Heavenly Guardian has come to test whether you are suitable for the final trial before entering the Western Palace.",
    ],
    outro: [
      "The celestial being declares: \"You have proven yourself capable. May the divine staff guide your way till the end.\"",
      "A pigsy man lies on the grass nearby. He introduces himself as Zhu Baijie, a former heavenly commander banished for his laziness.",
      "Zhu Baijie has joined your party!",
      "At the end of the plain, you see the distant silhouette of the Western Palace.",
    ],
  },
  7: {
    intro: [
      "You step into the Western Palace. It's eerily quiet and eccentric \u2014 not what you expected.",
      "You unveil the truth: the final corruption is not an ordinary demon king, but a twisted shadow of Sun Wukong himself.",
      "This entity represents strength without clarity and voice without understanding. He feeds on your mispronunciation. He feeds on your fear.",
      "Every crackle in your tone strengthens him. The only way to defeat him is to gather all the knowledge you've learned from the beginning until now.",
    ],
    outro: [
      "The divine staff emits an unprecedented light, illuminating the entire palace. All twisted reflections dissolve.",
      "A celestial voice speaks, clear as spring water: \"Thank you. The power of language has finally been restored.\"",
      "The sacred scriptures are restored. The world is stabilized. You now own the divine staff and vow to protect the harmony of Chinese pronunciation forever.",
      "Congratulations \u2014 you have completed the Journey to the West!",
    ],
  },
};

/** Brief overall story summary shown on first entry */
export const QUEST_INTRO_TEXT = [
  "Long ago, sacred scriptures brought from the West stabilized the world through the power of language.",
  "But over centuries, people grew careless \u2014 misusing tones, weakening pronunciation. From the broken sounds, monsters were born.",
  "The source of corruption comes from the West, where an unknown shadow figure disrupts the language.",
  "You, an ordinary traveler, take up the divine staff of Sun Wukong and begin the Journey to the West.",
  "Clarity is strength. Speak correctly, and the world will answer.",
];
