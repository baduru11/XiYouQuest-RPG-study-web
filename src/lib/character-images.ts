/** Local character image fallbacks when no DB expression images exist */
const CHARACTER_IMAGES: Record<string, string> = {
  Kaede: "/img/character/Kaede/kaede.png",
  "Hao Ran (浩然)": "/img/character/HaoRan/haoran.png",
  "Mei Lin (美琳)": "/img/character/MeiLin/meilin.png",
};

export function getCharacterImageFallback(
  characterName: string,
  expressions: Record<string, string>
): Record<string, string> {
  if (Object.keys(expressions).length > 0) return expressions;
  const fallback = CHARACTER_IMAGES[characterName];
  if (!fallback) return expressions;
  return { neutral: fallback };
}

export { CHARACTER_IMAGES };
