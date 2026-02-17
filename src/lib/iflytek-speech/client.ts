import crypto from "crypto";
import WebSocket from "ws";
import { IFLYTEK_APP_ID, IFLYTEK_API_KEY, IFLYTEK_API_SECRET } from "@/lib/env";
import { ISE_TIMEOUT_MS } from "@/lib/constants";

const ISE_HOST = "ise-api-sg.xf-yun.com";
const ISE_PATH = "/v2/ise";

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
  /** Sentence-level scores for read_chapter / read_sentence categories. */
  sentences?: Array<{
    content: string;
    score: number;
  }>;
}

// ---------- Auth ----------

/**
 * Build an authenticated WebSocket URL for iFlytek ISE API.
 * Same HMAC-SHA256 pattern as TTS but targeting the ISE endpoint.
 */
function buildIseWsUrl(): string {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${ISE_HOST}\ndate: ${date}\nGET ${ISE_PATH} HTTP/1.1`;
  const hmac = crypto.createHmac("sha256", IFLYTEK_API_SECRET);
  hmac.update(signatureOrigin);
  const signature = hmac.digest("base64");
  const authorizationOrigin = `api_key="${IFLYTEK_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");
  return `wss://${ISE_HOST}${ISE_PATH}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${ISE_HOST}`;
}

// ---------- XML helpers ----------

/** Extract a single attribute value from an XML element string. */
function getAttr(elementStr: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}="([^"]*)"`, "i");
  const match = elementStr.match(regex);
  return match ? match[1] : null;
}

/** Find all elements of a given tag name (handles self-closing and regular). */
function findElements(xml: string, tagName: string): string[] {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)`,
    "gi"
  );
  return xml.match(regex) || [];
}

/**
 * Find the opening tag of the scoring element with given name.
 * iFlytek XML has duplicate tags (outer wrapper + inner scoring element).
 * Prefer the one carrying `total_score` to avoid grabbing the empty wrapper.
 */
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

/**
 * Compute a 0-100 tone quality score for a single syllable from its phones.
 * Checks the rhyme phone (is_yun="1") for tone error (perr_msg bit 2).
 * Returns a graduated score rather than binary:
 *   100 = correct tone, 50 = tone error only, 25 = tone + vowel error, 0 = omitted
 */
function analyzeSyllTone(phones: string[], syllDp: number = 0): { toneScore: number; worstPerr: number } {
  // Omitted syllable — no tone data
  if (syllDp & 16) return { toneScore: 0, worstPerr: 0 };

  let worstPerr = 0;
  let yunPerr = -1; // -1 = no yun phone found
  const hasYunInfo = phones.some(ph => getAttr(ph, "is_yun") !== null);

  for (const ph of phones) {
    const perr = parseInt(getAttr(ph, "perr_msg") ?? "0");
    if (perr > worstPerr) worstPerr = perr;

    // Find the rhyme phone's error (tone lives on the rhyme)
    if (hasYunInfo) {
      if (getAttr(ph, "is_yun") === "1") yunPerr = perr;
    } else {
      // No is_yun info — use worst perr from any phone
      if (perr > yunPerr) yunPerr = perr;
    }
  }

  // No phones or no rhyme found
  if (yunPerr < 0) return { toneScore: 100, worstPerr };

  // Graduated tone score based on rhyme phone error type
  let toneScore: number;
  if (!(yunPerr & 2)) {
    toneScore = 100;           // no tone error
  } else if (yunPerr === 2) {
    toneScore = 40;            // tone error only (sound correct, wrong tone)
  } else {
    toneScore = 20;            // tone + vowel error (perr_msg=3)
  }

  return { toneScore, worstPerr };
}

// ---------- Result parsing ----------

/**
 * Parse iFlytek ISE XML result into structured scoring data.
 *
 * XML hierarchy by category:
 *   read_syllable → <read_syllable> → <rec_paper> → <read_syllable_item> → <syll> → <phone>
 *   read_word     → <read_word>     → <rec_paper> → <read_word_item>     → <word> → <syll> → <phone>
 *   read_sentence → <read_sentence> → <rec_paper> → <read_sentence_item> → <sentence> → <word> → <syll> → <phone>
 *   read_chapter  → <read_chapter>  → <rec_paper> → <read_chapter_item>  → <sentence> → <word> → <syll> → <phone>
 */
function parseIseXml(
  xml: string,
  category: IseCategory
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

  // Check for rejection (gibberish / chaotic reading)
  if (getAttr(rootTag, "is_rejected") === "true") return empty;

  const totalScore = parseFloat(getAttr(rootTag, "total_score") ?? "0");
  const phoneScore = parseFloat(getAttr(rootTag, "phone_score") ?? "0");
  const fluencyScore = parseFloat(getAttr(rootTag, "fluency_score") ?? "0");
  const toneScore = parseFloat(getAttr(rootTag, "tone_score") ?? "0");
  const integrityScore = parseFloat(
    getAttr(rootTag, "integrity_score") ?? "0"
  );

  const words: PronunciationAssessmentResult["words"] = [];
  let parsedSentences: PronunciationAssessmentResult["sentences"];

  if (category === "read_syllable") {
    // XML: <sentence content="草"> → <word symbol="cao3"> → <syll rec_node_type="silv"|"sil"|"paper"> → <phone>
    // No per-word total_score exists — derive scores from phone-level errors.
    // Each <word> has silence sylls (silv/sil) + one paper syll with the actual pronunciation data.
    for (const wordEl of findElements(xml, "word")) {
      const content = getAttr(wordEl, "content");
      if (!content) continue;

      // Find the paper syll (skip silence: silv, sil)
      const allSylls = findElements(wordEl, "syll");
      const paperSyll = allSylls.find(
        s => getAttr(s, "rec_node_type") === "paper"
      );
      if (!paperSyll) continue;

      const dp = parseInt(getAttr(paperSyll, "dp_message") ?? "0");

      // Get only paper phones (with is_yun, perr_msg)
      const phones = findElements(paperSyll, "phone").filter(
        ph => getAttr(ph, "rec_node_type") === "paper"
      );

      const { toneScore: syllTone, worstPerr } = analyzeSyllTone(phones, dp);

      // Derive accuracy score from phone errors (no per-word score in XML)
      let score = 100;
      if (dp & 16) {
        score = 0; // omission
      } else if (dp & 128) {
        score = 20; // mispronunciation at syll level
      } else if (dp & 32) {
        score = 40; // insertion
      } else if (dp & 64) {
        score = 50; // repetition
      } else {
        // Score from phone-level errors (excluding tone — tracked separately)
        let phoneDeductions = 0;
        for (const ph of phones) {
          const perr = parseInt(getAttr(ph, "perr_msg") ?? "0");
          if (perr & 1) phoneDeductions += 30; // vowel error
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
    // XML structure same as read_syllable but with multi-syllable words.
    // Try <word> elements (may have total_score in read_word mode).
    for (const wordEl of findElements(xml, "word")) {
      const content = getAttr(wordEl, "content");
      if (!content) continue;

      const score = parseFloat(getAttr(wordEl, "total_score") ?? "0");

      // Only analyze paper sylls (skip silence: silv, sil)
      const paperSylls = findElements(wordEl, "syll").filter(
        s => getAttr(s, "rec_node_type") === "paper"
      );
      let worstDp = 0;
      let toneSyllScores: number[] = [];
      let worstPerr = 0;

      for (const syll of paperSylls) {
        const dp = parseInt(getAttr(syll, "dp_message") ?? "0");
        if (dp > worstDp) worstDp = dp;

        const phones = findElements(syll, "phone").filter(
          ph => getAttr(ph, "rec_node_type") === "paper"
        );
        const tone = analyzeSyllTone(phones, dp);
        if (tone.worstPerr > worstPerr) worstPerr = tone.worstPerr;
        toneSyllScores.push(tone.toneScore);
      }

      // Derive score from phone errors if XML has no per-word score
      let finalScore = score;
      if (finalScore === 0 && paperSylls.length > 0) {
        let deductions = 0;
        if (worstDp & 16) deductions = 100;
        else if (worstDp & 128) deductions = 60;
        else {
          for (const syll of paperSylls) {
            for (const ph of findElements(syll, "phone").filter(
              p => getAttr(p, "rec_node_type") === "paper"
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
          ? Math.round(toneSyllScores.reduce((a, b) => a + b, 0) / toneSyllScores.length)
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
    // read_sentence / read_chapter — extract <sentence> and <word> elements.
    // ISE puts total_score on <sentence>, not individual <word> elements,
    // so we derive word scores from dp_message / phone errors.

    // Extract sentence-level scores
    const sentenceScores: PronunciationAssessmentResult["sentences"] = [];
    for (const s of findElements(xml, "sentence")) {
      const content = getAttr(s, "content");
      if (!content) continue;
      const sScore = parseFloat(getAttr(s, "total_score") ?? "0");
      sentenceScores.push({ content, score: Math.round(sScore * 10) / 10 });
    }

    // Extract word-level data with fallback scoring
    for (const w of findElements(xml, "word")) {
      const content = getAttr(w, "content");
      if (!content) continue;

      const xmlScore = parseFloat(getAttr(w, "total_score") ?? "0");

      // Only analyze paper sylls (skip silence); fall back to all if attr absent
      const allSylls = findElements(w, "syll");
      const paperOnly = allSylls.filter(
        s => getAttr(s, "rec_node_type") === "paper"
      );
      const sylls = paperOnly.length > 0 ? paperOnly : allSylls;
      let worstDp = 0;
      let toneSyllScores: number[] = [];
      let worstPerr = 0;

      for (const syll of sylls) {
        const dp = parseInt(getAttr(syll, "dp_message") ?? "0");
        if (dp > worstDp) worstDp = dp;

        const allPhones = findElements(syll, "phone");
        const paperPhones = allPhones.filter(
          ph => getAttr(ph, "rec_node_type") === "paper"
        );
        const phones = paperPhones.length > 0 ? paperPhones : allPhones;
        const tone = analyzeSyllTone(phones, dp);
        if (tone.worstPerr > worstPerr) worstPerr = tone.worstPerr;
        toneSyllScores.push(tone.toneScore);
      }

      // Derive score from dp_message / phone errors when total_score is absent
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
              p => getAttr(p, "rec_node_type") === "paper"
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
          ? Math.round(toneSyllScores.reduce((a, b) => a + b, 0) / toneSyllScores.length)
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
    const scoredWords = words.filter(w => w.accuracyScore > 0);
    if (scoredWords.length > 0) {
      finalAccuracy = Math.round(
        (scoredWords.reduce((s, w) => s + w.accuracyScore, 0) / scoredWords.length) * 10
      ) / 10;
      finalPronunciation = finalAccuracy;
    }
    const tonedWords = words.filter(w => w.toneScore !== undefined);
    if (tonedWords.length > 0) {
      finalTone = Math.round(
        tonedWords.reduce((s, w) => s + w.toneScore!, 0) / tonedWords.length
      );
    }
    const nonOmission = words.filter(w => w.errorType !== "Omission").length;
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

/**
 * Format reference text for iFlytek ISE based on category.
 * Prepends UTF-8 BOM as required by the API.
 * For syllable/word categories, splits space-separated items into newlines.
 * For sentence/chapter categories, splits by Chinese sentence-ending punctuation
 * so each sentence is on its own line (required by the ISE API).
 */
function formatText(referenceText: string, category: IseCategory): string {
  if (category === "read_syllable" || category === "read_word") {
    const items = referenceText.trim().split(/\s+/);
    return "\uFEFF" + items.join("\n");
  }
  if (category === "read_sentence" || category === "read_chapter") {
    // Split on Chinese sentence-ending punctuation, keeping the punctuation attached
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
 *
 * Sends audio via WebSocket in 3 stages:
 *   1. SSB frame — business parameters + reference text
 *   2. AUW frames — audio data in 1280-byte chunks at 40ms intervals
 *   3. Result reception — base64-encoded XML with scores
 */
export async function assessPronunciation(
  audioBuffer: Buffer,
  referenceText: string,
  language: string = "zh-CN",
  category: IseCategory = "read_word"
): Promise<PronunciationAssessmentResult> {
  const wsUrl = buildIseWsUrl();
  const text = formatText(referenceText, category);

  // Strip WAV header if present (44-byte RIFF header)
  let pcmData: Buffer;
  if (
    audioBuffer.length > 44 &&
    audioBuffer.toString("ascii", 0, 4) === "RIFF"
  ) {
    pcmData = audioBuffer.subarray(44);
  } else {
    pcmData = audioBuffer;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const resultChunks: string[] = [];
    const startTime = Date.now();

    const TIMEOUT_MS = ISE_TIMEOUT_MS;
    console.log(
      `[ISE] category=${category}, pcm=${pcmData.length} bytes (${Math.round(pcmData.length / 32000)}s audio)`
    );

    const ws = new WebSocket(wsUrl);

    const finish = (result: PronunciationAssessmentResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log(`[ISE] completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
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
      fail(new Error(`iFlytek ISE timeout (${TIMEOUT_MS / 1000}s)`));
    }, TIMEOUT_MS);

    ws.on("open", () => {
      // Stage 1: SSB — send parameters + reference text
      ws.send(
        JSON.stringify({
          common: { app_id: IFLYTEK_APP_ID },
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
        })
      );

      // Stage 2: AUW — send complete audio as fast as the WebSocket allows.
      // Uses 10KB chunks (vs old 1.28KB) and backpressure-based flow control
      // instead of 40ms setTimeout delays. A 60s recording now uploads in ~1-2s.
      const CHUNK_SIZE = 10240;
      const BUFFER_HIGH_WATER = 65536;
      let offset = 0;

      const sendChunks = () => {
        if (settled || ws.readyState !== WebSocket.OPEN) return;

        while (offset < pcmData.length) {
          // Yield when WebSocket send buffer is full to avoid overwhelming the connection
          if (ws.bufferedAmount > BUFFER_HIGH_WATER) {
            if (ws.readyState === WebSocket.OPEN) {
              setTimeout(sendChunks, 5);
            }
            return;
          }

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
                data: chunk.toString("base64"),
              },
            })
          );

          offset = end;
        }
      };

      // Minimal delay for SSB frame to be acknowledged
      setTimeout(sendChunks, 10);
    });

    ws.on("message", (data: WebSocket.Data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.code !== 0) {
        ws.close();
        fail(
          new Error(`iFlytek ISE error ${msg.code}: ${msg.message || ""}`)
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
          const xmlStr = Buffer.from(
            resultChunks.join(""),
            "base64"
          ).toString("utf-8");
          console.log("[ISE] XML result:", xmlStr.substring(0, 2000));
          finish(parseIseXml(xmlStr, category));
        } catch (err) {
          fail(new Error(`Failed to parse ISE result: ${err}`));
        }
      }
    });

    ws.on("error", (err) => {
      fail(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on("close", () => {
      if (!settled) {
        if (resultChunks.length > 0) {
          try {
            const xmlStr = Buffer.from(
              resultChunks.join(""),
              "base64"
            ).toString("utf-8");
            console.log("[ISE] XML result (on close):", xmlStr.substring(0, 2000));
            finish(parseIseXml(xmlStr, category));
          } catch {
            fail(new Error("iFlytek ISE: closed with unparseable result"));
          }
        } else {
          fail(new Error("iFlytek ISE: closed without result"));
        }
      }
    });
  });
}
