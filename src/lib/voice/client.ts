const VOICE_API_KEY = process.env.VOICE_API_KEY!;
const VOICE_API_BASE_URL = process.env.VOICE_API_BASE_URL || "https://api.fish.audio";

export async function synthesizeSpeech(params: {
  voiceId: string;
  text: string;
  language?: string;
}): Promise<Buffer> {
  const response = await fetch(`${VOICE_API_BASE_URL}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference_id: params.voiceId,
      text: params.text,
      format: "mp3",
      language: params.language || "zh",
    }),
  });

  if (!response.ok) {
    throw new Error(`Voice API error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
