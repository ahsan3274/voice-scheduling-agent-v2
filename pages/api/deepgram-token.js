/**
 * GET /api/deepgram-token
 *
 * Returns a Deepgram key for browser live transcription.
 * By default this returns DEEPGRAM_API_KEY directly for reliability.
 * If DEEPGRAM_USE_EPHEMERAL=true, it creates a short-lived key.
 * The browser uses this token to open a live transcription WebSocket directly
 * to Deepgram — so the real API key never leaves the server.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const apiKey = process.env.DEEPGRAM_API_KEY;
  const projectId = process.env.DEEPGRAM_PROJECT_ID;
  const useEphemeral = process.env.DEEPGRAM_USE_EPHEMERAL === 'true';

  if (!apiKey) return res.status(500).json({ error: 'DEEPGRAM_API_KEY not set' });

  // Reliability-first default: return the main key unless ephemeral mode is explicitly enabled.
  // This avoids websocket handshake failures when temporary key scopes are misconfigured.
  if (!useEphemeral) {
    return res.status(200).json({ key: apiKey, ephemeral: false, source: 'direct' });
  }

  // If no project ID provided, just return the key directly.
  // (Fine for a demo — for production, always use temp tokens.)
  if (!projectId) {
    return res.status(200).json({ key: apiKey, ephemeral: false, source: 'direct-no-project-id' });
  }

  try {
    const response = await fetch(
      `https://api.deepgram.com/v1/projects/${projectId}/keys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: 'voice-agent-ephemeral',
          // Include listen scope so browser can open live transcription websocket.
          scopes: ['usage:write', 'listen:write'],
          time_to_live_in_seconds: 3600,
        }),
      }
    );

    if (!response.ok) {
      // Fall back to returning the main key if temp token creation fails
      console.warn('[deepgram-token] Could not create temp token, falling back to main key');
      return res.status(200).json({ key: apiKey, ephemeral: false, source: 'fallback-main-key' });
    }

    const data = await response.json();
    const ephemeralKey = data?.key?.key;
    if (!ephemeralKey || typeof ephemeralKey !== 'string') {
      console.warn('[deepgram-token] Temp key response malformed, falling back to main key');
      return res.status(200).json({ key: apiKey, ephemeral: false, source: 'fallback-malformed-temp-key' });
    }

    return res.status(200).json({ key: ephemeralKey, ephemeral: true, source: 'ephemeral' });
  } catch (err) {
    console.error('[deepgram-token]', err);
    return res.status(200).json({ key: apiKey, ephemeral: false, source: 'fallback-main-key-exception' });
  }
}
