/**
 * lib/polly.js
 * Converts text to speech using AWS Polly (Neural engine).
 * Returns a Buffer of MP3 audio.
 */

import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';

let _polly = null;
function getPolly() {
  if (!_polly) {
    _polly = new PollyClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
      } : undefined,
    });
  }
  return _polly;
}

/**
 * synthesize(text) → Buffer (MP3)
 *
 * Voice: Joanna (Neural) — natural US English, works well for scheduling assistant.
 * Override with POLLY_VOICE_ID env var e.g. "Matthew", "Aria", "Emma"
 */
export async function synthesize(text) {
  const command = new SynthesizeSpeechCommand({
    Text: text,
    TextType: 'text',
    OutputFormat: 'mp3',
    Engine: 'neural',
    VoiceId: process.env.POLLY_VOICE_ID || 'Joanna',
    SampleRate: '22050',
  });

  const res = await getPolly().send(command);

  // Collect the readable stream into a Buffer
  const chunks = [];
  for await (const chunk of res.AudioStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
