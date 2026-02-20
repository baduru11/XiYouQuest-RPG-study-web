/** Local character image fallbacks when no DB expression images exist */
const CHARACTER_IMAGES: Record<string, string> = {
  "Sun Wukong (孙悟空)": "/img/main character/son wukong/오공 명함.webp",
  "Zhu Bajie (猪八戒)": "/img/main character/zhu bajie/저팔계 명함.webp",
  "Sha Wujing (沙悟净)": "/img/main character/sha wujing/사오정 명함.webp",
  "Tang Sanzang (三藏)": "/img/main character/sam jang/삼장 명함.webp",
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
