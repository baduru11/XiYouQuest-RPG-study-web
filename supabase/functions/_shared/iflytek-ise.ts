import { IFLYTEK_APP_ID } from "./env.ts";
import { buildIflytekWsUrl } from "./iflytek-auth.ts";

const ISE_HOST = "ise-api-sg.xf-yun.com";
const ISE_PATH = "/v2/ise";

const ISE_TIMEOUT_MS = 90_000;

export type IseCategory =
  | "read_syllable"
  | "read_word"
  | "read_sentence"
  | "read_chapter";

export interface PronunciationAssessmentResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  toneScore: number;
  words: Array<{
    word: string;
    accuracyScore: number;
    errorType: string;
    toneScore?: number;
    phoneError?: string;
  }>;
  sentences?: Array<{
    content: string;
    score: number;
  }>;
}

// ---------- Buffer helpers ----------

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------- XML helpers ----------

function getAttr(elementStr: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}="([^"]*)"`, "i");
  const match = elementStr.match(regex);
  return match ? match[1] : null;
}

function findElements(xml: string, tagName: string): string[] {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)`,
    "gi",
  );
  return xml.match(regex) || [];
}

function findRootTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let firstMatch: string | null = null;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    if (!firstMatch) firstMatch = match[0];
    if (getAttr(match[0], "total_score") !== null) return match[0];
  }
  return firstMatch;
}

// ---------- Error mapping ----------

function mapDpMessage(dp: number): string {
  if (dp & 128) return "Mispronunciation";
  if (dp & 64) return "Repetition";
  if (dp & 32) return "Insertion";
  if (dp & 16) return "Omission";
  return "None";
}

function mapPhoneError(perr: number): string {
  switch (perr) {
    case 1:
      return "vowel";
    case 2:
      return "tone";
    case 3:
      return "both";
    default:
      return "none";
  }
}

// ---------- Tone analysis ----------

function analyzeSyllTone(
  phones: string[],
  syllDp: number = 0,
): { toneScore: number; worstPerr: number } {
  if (syllDp & 16) return { toneScore: 0, worstPerr: 0 };

  let worstPerr = 0;
  let yunPerr = -1;
  const hasYunInfo = phones.some((ph) => getAttr(ph, "is_yun") !== null);

  for (const ph of phones) {
    const perr = parseInt(getAttr(ph, "perr_msg") ?? "0");
    if (perr > worstPerr) worstPerr = perr;

    if (hasYunInfo) {
      if (getAttr(ph, "is_yun") === "1") yunPerr = perr;
    } else {
      if (perr > yunPerr) yunPerr = perr;
    }
  }

  if (yunPerr < 0) return { toneScore: 100, worstPerr };

  let toneScore: number;
  if (!(yunPerr & 2)) {
    toneScore = 100;
  } else if (yunPerr === 2) {
    toneScore = 40;
  } else {
    toneScore = 20;
  }

  return { toneScore, worstPerr };
}

// ---------- Result parsing ----------

function parseIseXml(
  xml: string,
  category: IseCategory,
): PronunciationAssessmentResult {
  const empty: PronunciationAssessmentResult = {
    accuracyScore: 0,
    fluencyScore: 0,
    completenessScore: 0,
    pronunciationScore: 0,
    toneScore: 0,
    words: [],
  };

  const rootTag = findRootTag(xml, category);
  if (!rootTag) return empty;

  if (getAttr(rootTag, "is_rejected") === "true") return empty;

  const totalScore = parseFloat(getAttr(rootTag, "total_score") ?? "0");
  const phoneScore = parseFloat(getAttr(rootTag, "phone_score") ?? "0");
  const fluencyScore = parseFloat(getAttr(rootTag, "fluency_score") ?? "0");
  const toneScore = parseFloat(getAttr(rootTag, "tone_score") ?? "0");
  const integrityScore = parseFloat(
    getAttr(rootTag, "integrity_score") ?? "0",
  );

  const words: PronunciationAssessmentResult["words"] = [];
  let parsedSentences: PronunciationAssessmentResult["sentences"];

  if (category === "read_syllable") {
    for (const wordEl of findElements(xml, "word")) {
      const content = getAttr(wordEl, "content");
      if (!content) continue;

      const allSylls = findElements(wordEl, "syll");
      const paperSyll = allSylls.find(
        (s) => getAttr(s, "rec_node_type") === "paper",
      );
      if (!paperSyll) continue;

      const dp = parseInt(getAttr(paperSyll, "dp_message") ?? "0");

      const phones = findElements(paperSyll, "phone").filter(
        (ph) => getAttr(ph, "rec_node_type") === "paper",
      );

      const { toneScore: syllTone, worstPerr } = analyzeSyllTone(phones, dp);

      let score = 100;
      if (dp & 16) {
        score = 0;
      } else if (dp & 128) {
        score = 20;
      } else if (dp & 32) {
        score = 40;
      } else if (dp & 64) {
        score = 50;
      } else {
        let phoneDeductions = 0;
        for (const ph of phones) {
          const perr = parseInt(getAttr(ph, "perr_msg") ?? "0");
          if (perr & 1) phoneDeductions += 30;
        }
        score = Math.max(0, 100 - phoneDeductions);
      }

      words.push({
        word: content,
        accuracyScore: score,
        errorType: mapDpMessage(dp),
        toneScore: syllTone,
        phoneError: mapPhoneError(worstPerr),
      });
    }
  } else if (category === "read_word") {
    for (const wordEl of findElements(xml, "word")) {
      const content = getAttr(wordEl, "content");
      if (!content) continue;

      const score = parseFloat(getAttr(wordEl, "total_score") ?? "0");

      const paperSylls = findElements(wordEl, "syll").filter(
        (s) => getAttr(s, "rec_node_type") === "paper",
      );
      let worstDp = 0;
      const toneSyllScores: number[] = [];
      let worstPerr = 0;

      for (const syll of paperSylls) {
        const dp = parseInt(getAttr(syll, "dp_message") ?? "0");
        if (dp > worstDp) worstDp = dp;

        const phones = findElements(syll, "phone").filter(
          (ph) => getAttr(ph, "rec_node_type") === "paper",
        );
        const tone = analyzeSyllTone(phones, dp);
        if (tone.worstPerr > worstPerr) worstPerr = tone.worstPerr;
        toneSyllScores.push(tone.toneScore);
      }

      let finalScore = score;
      if (finalScore === 0 && paperSylls.length > 0) {
        let deductions = 0;
        if (worstDp & 16) deductions = 100;
        else if (worstDp & 128) deductions = 60;
        else {
          for (const syll of paperSylls) {
            for (const ph of findElements(syll, "phone").filter(
              (p) => getAttr(p, "rec_node_type") === "paper",
            )) {
              const perr = parseInt(getAttr(ph, "perr_msg") ?? "0");
              if (perr & 1) deductions += 20;
            }
          }
        }
        finalScore = Math.max(0, 100 - deductions);
      }

      const wordToneScore =
        toneSyllScores.length > 0
          ? Math.round(
              toneSyllScores.reduce((a, b) => a + b, 0) /
                toneSyllScores.length,
            )
          : undefined;

      words.push({
        word: content,
        accuracyScore: Math.round(finalScore * 10) / 10,
        errorType: mapDpMessage(worstDp),
        toneScore: wordToneScore,
        phoneError: mapPhoneError(worstPerr),
      });
    }
  } else {
    const sentenceScores: PronunciationAssessmentResult["sentences"] = [];
    for (const s of findElements(xml, "sentence")) {
      const content = getAttr(s, "content");
      if (!content) continue;
      const sScore = parseFloat(getAttr(s, "total_score") ?? "0");
      sentenceScores.push({
        content,
        score: Math.round(sScore * 10) / 10,
      });
    }

    for (const w of findElements(xml, "word")) {
      const content = getAttr(w, "content");
      if (!content) continue;

      const xmlScore = parseFloat(getAttr(w, "total_score") ?? "0");

      const allSylls = findElements(w, "syll");
      const paperOnly = allSylls.filter(
        (s) => getAttr(s, "rec_node_type") === "paper",
      );
      const sylls = paperOnly.length > 0 ? paperOnly : allSylls;
      let worstDp = 0;
      const toneSyllScores: number[] = [];
      let worstPerr = 0;

      for (const syll of sylls) {
        const dp = parseInt(getAttr(syll, "dp_message") ?? "0");
        if (dp > worstDp) worstDp = dp;

        const allPhones = findElements(syll, "phone");
        const paperPhones = allPhones.filter(
          (ph) => getAttr(ph, "rec_node_type") === "paper",
        );
        const phones = paperPhones.length > 0 ? paperPhones : allPhones;
        const tone = analyzeSyllTone(phones, dp);
        if (tone.worstPerr > worstPerr) worstPerr = tone.worstPerr;
        toneSyllScores.push(tone.toneScore);
      }

      let finalScore = xmlScore;
      if (finalScore === 0 && sylls.length > 0) {
        if (worstDp & 16) {
          finalScore = 0;
        } else if (worstDp & 128) {
          finalScore = 20;
        } else if (worstDp & 32) {
          finalScore = 40;
        } else if (worstDp & 64) {
          finalScore = 50;
        } else {
          let deductions = 0;
          for (const syll of sylls) {
            for (const ph of findElements(syll, "phone").filter(
              (p) => getAttr(p, "rec_node_type") === "paper",
            )) {
              const perr = parseInt(getAttr(ph, "perr_msg") ?? "0");
              if (perr & 1) deductions += 20;
            }
          }
          finalScore = Math.max(0, 100 - deductions);
        }
      }

      const wordToneScore =
        toneSyllScores.length > 0
          ? Math.round(
              toneSyllScores.reduce((a, b) => a + b, 0) /
                toneSyllScores.length,
            )
          : undefined;

      words.push({
        word: content,
        accuracyScore: Math.round(finalScore * 10) / 10,
        errorType: mapDpMessage(worstDp),
        toneScore: wordToneScore,
        phoneError: mapPhoneError(worstPerr),
      });
    }

    if (sentenceScores.length > 0) {
      parsedSentences = sentenceScores;
    }
  }

  // Fallback: if root-level scores are 0 but we have per-word data, compute from words
  let finalAccuracy = Math.round(phoneScore * 10) / 10;
  let finalPronunciation = Math.round(totalScore * 10) / 10;
  let finalTone = Math.round(toneScore * 10) / 10;
  let finalCompleteness = Math.round(integrityScore * 10) / 10;

  if (words.length > 0 && totalScore === 0) {
    const scoredWords = words.filter((w) => w.accuracyScore > 0);
    if (scoredWords.length > 0) {
      finalAccuracy =
        Math.round(
          (scoredWords.reduce((s, w) => s + w.accuracyScore, 0) /
            scoredWords.length) *
            10,
        ) / 10;
      finalPronunciation = finalAccuracy;
    }
    const tonedWords = words.filter((w) => w.toneScore !== undefined);
    if (tonedWords.length > 0) {
      finalTone = Math.round(
        tonedWords.reduce((s, w) => s + w.toneScore!, 0) / tonedWords.length,
      );
    }
    const nonOmission = words.filter(
      (w) => w.errorType !== "Omission",
    ).length;
    finalCompleteness = Math.round((nonOmission / words.length) * 100);
  }

  return {
    accuracyScore: finalAccuracy,
    fluencyScore: Math.round(fluencyScore * 10) / 10,
    completenessScore: finalCompleteness,
    pronunciationScore: finalPronunciation,
    toneScore: finalTone,
    words,
    sentences: parsedSentences,
  };
}

// ---------- Text formatting ----------

function formatText(referenceText: string, category: IseCategory): string {
  if (category === "read_syllable" || category === "read_word") {
    const items = referenceText.trim().split(/\s+/);
    return "\uFEFF" + items.join("\n");
  }
  if (category === "read_sentence" || category === "read_chapter") {
    const sentences = referenceText
      .split(/(?<=[。！？；])/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return "\uFEFF" + sentences.join("\n");
  }
  return "\uFEFF" + referenceText;
}

// ---------- Main assessment ----------

/**
 * Assess pronunciation using iFlytek ISE (Intelligent Speech Evaluation).
 * Uses native WebSocket (Deno) and Uint8Array instead of Node.js Buffer/ws.
 */
export async function assessPronunciation(
  audioData: Uint8Array,
  referenceText: string,
  language: string = "zh-CN",
  category: IseCategory = "read_word",
): Promise<PronunciationAssessmentResult> {
  const wsUrl = await buildIflytekWsUrl(ISE_HOST, ISE_PATH);
  const text = formatText(referenceText, category);

  // Strip WAV header if present (44-byte RIFF header)
  let pcmData: Uint8Array;
  if (
    audioData.length > 44 &&
    new TextDecoder().decode(audioData.subarray(0, 4)) === "RIFF"
  ) {
    pcmData = audioData.subarray(44);
  } else {
    pcmData = audioData;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const resultChunks: string[] = [];
    const startTime = Date.now();

    console.log(
      `[ISE] category=${category}, pcm=${pcmData.length} bytes (${Math.round(pcmData.length / 32000)}s audio)`,
    );

    const ws = new WebSocket(wsUrl);

    const finish = (result: PronunciationAssessmentResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log(
        `[ISE] completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      );
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const timer = setTimeout(() => {
      ws.close();
      fail(new Error(`iFlytek ISE timeout (${ISE_TIMEOUT_MS / 1000}s)`));
    }, ISE_TIMEOUT_MS);

    ws.onopen = () => {
      // Stage 1: SSB — send parameters + reference text
      ws.send(
        JSON.stringify({
          common: { app_id: IFLYTEK_APP_ID() },
          business: {
            sub: "ise",
            ent: language.startsWith("en") ? "en_vip" : "cn_vip",
            category,
            aue: "raw",
            auf: "audio/L16;rate=16000",
            cmd: "ssb",
            text,
            tte: "utf-8",
            rstcd: "utf8",
            group: "adult",
            check_type: "common",
            rst: "entirety",
            ise_unite: "1",
            plev: "0",
            extra_ability: "multi_dimension;syll_phone_err_msg",
          },
          data: { status: 0 },
        }),
      );

      // Stage 2: AUW — send audio in 10KB chunks
      const CHUNK_SIZE = 10240;
      let offset = 0;

      const sendChunks = () => {
        if (settled || ws.readyState !== WebSocket.OPEN) return;

        while (offset < pcmData.length) {
          const end = Math.min(offset + CHUNK_SIZE, pcmData.length);
          const chunk = pcmData.subarray(offset, end);
          const isFirst = offset === 0;
          const isLast = end >= pcmData.length;
          const aus = isFirst ? 1 : isLast ? 4 : 2;

          ws.send(
            JSON.stringify({
              business: { cmd: "auw", aus },
              data: {
                status: isLast ? 2 : 1,
                data: uint8ArrayToBase64(chunk),
              },
            }),
          );

          offset = end;
        }
      };

      // Minimal delay for SSB frame to be acknowledged
      setTimeout(sendChunks, 10);
    };

    ws.onmessage = (ev: MessageEvent) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }

      if (msg.code !== 0) {
        ws.close();
        fail(
          new Error(`iFlytek ISE error ${msg.code}: ${msg.message || ""}`),
        );
        return;
      }

      if (msg.data?.data) {
        resultChunks.push(msg.data.data);
      }

      // Stage 3: status=2 means final result
      if (msg.data?.status === 2) {
        ws.close();
        try {
          const xmlBytes = base64ToUint8Array(resultChunks.join(""));
          const xmlStr = new TextDecoder("utf-8").decode(xmlBytes);
          finish(parseIseXml(xmlStr, category));
        } catch (err) {
          fail(new Error(`Failed to parse ISE result: ${err}`));
        }
      }
    };

    ws.onerror = () => {
      fail(new Error("iFlytek ISE WebSocket error"));
    };

    ws.onclose = () => {
      if (!settled) {
        if (resultChunks.length > 0) {
          try {
            const xmlBytes = base64ToUint8Array(resultChunks.join(""));
            const xmlStr = new TextDecoder("utf-8").decode(xmlBytes);
            finish(parseIseXml(xmlStr, category));
          } catch {
            fail(new Error("iFlytek ISE: closed with unparseable result"));
          }
        } else {
          fail(new Error("iFlytek ISE: closed without result"));
        }
      }
    };
  });
}
