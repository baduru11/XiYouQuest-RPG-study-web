const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY!;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION!;

export interface PronunciationAssessmentResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  words: Array<{
    word: string;
    accuracyScore: number;
    errorType: string;
  }>;
}

export async function assessPronunciation(
  audioBuffer: Buffer,
  referenceText: string,
  language: string = "zh-CN"
): Promise<PronunciationAssessmentResult> {
  const pronunciationAssessmentConfig = {
    referenceText,
    gradingSystem: "HundredMark",
    granularity: "Word",
    dimension: "Comprehensive",
  };

  const encodedConfig = Buffer.from(
    JSON.stringify(pronunciationAssessmentConfig)
  ).toString("base64");

  const response = await fetch(
    `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Pronunciation-Assessment": encodedConfig,
        "Content-Type": "audio/wav",
        Accept: "application/json",
      },
      body: new Uint8Array(audioBuffer),
    }
  );

  if (!response.ok) {
    throw new Error(`Azure Speech API error: ${response.status}`);
  }

  const data = await response.json();
  const nbest = data.NBest?.[0];

  if (!nbest?.PronunciationAssessment) {
    throw new Error("No pronunciation assessment in response");
  }

  return {
    accuracyScore: nbest.PronunciationAssessment.AccuracyScore,
    fluencyScore: nbest.PronunciationAssessment.FluencyScore,
    completenessScore: nbest.PronunciationAssessment.CompletenessScore,
    pronunciationScore: nbest.PronunciationAssessment.PronScore,
    words: (nbest.Words || []).map((w: Record<string, unknown>) => ({
      word: w.Word,
      accuracyScore: (w.PronunciationAssessment as Record<string, number>)?.AccuracyScore ?? 0,
      errorType: (w.PronunciationAssessment as Record<string, string>)?.ErrorType ?? "None",
    })),
  };
}
