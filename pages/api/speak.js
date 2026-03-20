/**
 * POST /api/speak
 * Body: { text: string }
 * Returns: audio/mpeg stream (MP3)
 *
 * The browser fetches this endpoint and plays the returned audio.
 */

import { synthesize } from '../../lib/polly';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { text } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text must be a non-empty string' });
  }

  try {
    const audioBuffer = await synthesize(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audioBuffer);
  } catch (err) {
    console.error('[speak]', err);
    return res.status(500).json({ error: err.message });
  }
}
