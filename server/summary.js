import { TEXT_MAX, TRANSCRIPT_MAX } from './call.js';

const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const NAMES = { customer: 'Customer', agent: 'Agent' };
const INSTRUCTION = `You summarise a support call between a Customer and an Agent.
Always write in English, even when the call is in Hindi, Marathi or another language.
Reply with 3 to 5 short bullets: the Customer's issue, what the Agent said or did, and the next steps.`;

// A POST /summary body: the client's own copy of the Transcript, entries shaped like transcript-entry.
export function isTranscript(data) {
  if (!Array.isArray(data) || data.length === 0 || data.length > TRANSCRIPT_MAX) return false;
  return data.every((e) => e && typeof e === 'object'
    && (e.kind === 'message' || e.kind === 'utterance')
    && Object.hasOwn(NAMES, e.from)
    && typeof e.text === 'string' && e.text.length <= TEXT_MAX
    && Number.isFinite(e.at));
}

// The Summary as 3 to 5 English bullets. Throws on any failure, so the caller answers with an error.
export async function summarise(transcript, { key, fetch = globalThis.fetch }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: transcript.map((e) => `${NAMES[e.from]}: ${e.text}`).join('\n') }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'STRING' } } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`gemini ${res.status}: ${data?.error?.message}`);
  const bullets = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
  if (!Array.isArray(bullets) || bullets.length < 3 || !bullets.every((b) => typeof b === 'string')) {
    throw new Error('gemini: unusable reply');
  }
  return bullets.slice(0, 5);
}
