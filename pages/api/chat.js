/**
 * POST /api/chat
 *
 * Body: { messages: Array<{role, content}> }
 *
 * Returns:
 *   { type: 'text',      text: string }
 *   { type: 'tool_call', toolName: string, toolInput: object }
 */

import { chat } from '../../lib/llm';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  try {
    const result = await chat(messages);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[chat]', err);
    return res.status(500).json({ error: err.message });
  }
}
