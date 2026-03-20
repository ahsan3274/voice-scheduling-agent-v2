/**
 * lib/llm.js
 * Calls AWS Bedrock for the conversation brain.
 * Falls back to Ollama for local dev if LLM_PROVIDER=ollama.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/**
 * Generate the system prompt for the voice scheduling assistant
 * Includes current date context so the LLM knows what year it is
 */
export function getSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const isoStr = now.toISOString();

  return `You are a friendly, efficient voice scheduling assistant helping users book calendar meetings.

CURRENT DATE CONTEXT: Today is ${dateStr} (${isoStr}). When users mention dates like "March 30th" or "next Friday", use the year ${now.getFullYear()}.

YOUR SOLE PURPOSE is to schedule meetings. Follow this flow exactly:

1. GREETING (first message only): "Hello! I'm your scheduling assistant. I can help you book a meeting on your calendar. To get started, what's your full name?"

2. Ask for date: "What date would you like to schedule the meeting?"

3. Ask for time: "What time works best for you? Please include AM or PM."

4. Ask for title: "What should we call this meeting? You can skip this if you'd like."

5. Confirm: "Let me confirm - a meeting called [TITLE] on [DATE] at [TIME] with [NAME]. Is that correct?"

6. If yes, call schedule_meeting tool immediately.

7. After booking: "Perfect! Your meeting is booked. I've sent you a calendar invite with all the details."

CRITICAL RULES:
- Keep responses to 1-2 short sentences (this is spoken aloud)
- Never use markdown, bullet points, or lists
- Say dates naturally: "April fifth at two PM"
- If time is ambiguous, confirm AM/PM before proceeding
- Do NOT proceed to booking until user explicitly confirms
- Stay focused on scheduling - don't discuss other topics
- ALWAYS use the current year (${now.getFullYear()}) when creating event dates unless the user specifies otherwise`;
}

/**
 * Tool definition for scheduling meetings via Google Calendar
 */
export const SCHEDULE_TOOL = {
  name: 'schedule_meeting',
  description: 'Creates a Google Calendar event after the user has confirmed all details.',
  inputSchema: {
    type: 'object',
    properties: {
      attendeeName:  { type: 'string', description: "User's full name" },
      summary:       { type: 'string', description: 'Meeting title / summary' },
      startDateTime: { type: 'string', description: 'ISO 8601 start e.g. 2025-04-05T14:00:00' },
      endDateTime:   { type: 'string', description: 'ISO 8601 end (default: 1 hour after start)' },
      timeZone:      { type: 'string', description: 'IANA timezone e.g. Europe/Oslo. Default: UTC' },
    },
    required: ['attendeeName', 'startDateTime', 'endDateTime'],
  },
};

// ── Bedrock ──────────────────────────────────────────────────────────────────

let _bedrock = null;
function getBedrock() {
  if (!_bedrock) {
    _bedrock = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
      } : undefined, // falls back to instance profile on EC2
    });
  }
  return _bedrock;
}

async function chatBedrock(messages) {
  const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

  // Ensure messages array is not empty
  if (!messages || messages.length === 0) {
    messages = [{ role: 'user', content: 'Hello' }];
  }

  // Filter out empty messages
  let validMessages = messages.filter(m => m && m.content && m.content.trim());

  // FIX: Enforce alternating roles (Claude 3 requirement)
  // Merge consecutive same-role messages to avoid ValidationException
  const deduped = [];
  for (const msg of validMessages) {
    const last = deduped[deduped.length - 1];
    if (last && last.role === msg.role) {
      // Merge consecutive same-role messages
      last.content += '\n' + msg.content;
    } else {
      deduped.push({ role: msg.role, content: msg.content });
    }
  }
  validMessages = deduped;

  // Ensure first message is from user (Claude requirement)
  if (validMessages.length === 0 || validMessages[0].role !== 'user') {
    validMessages.unshift({ role: 'user', content: 'Hello' });
  }

  console.log('[Bedrock] Sending messages:', validMessages);

  const command = new ConverseCommand({
    modelId,
    system: [{ text: getSystemPrompt() }],
    messages: validMessages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    toolConfig: {
      tools: [{
        toolSpec: {
          name: SCHEDULE_TOOL.name,
          description: SCHEDULE_TOOL.description,
          inputSchema: { json: SCHEDULE_TOOL.inputSchema },
        },
      }],
    },
    inferenceConfig: { maxTokens: 512, temperature: 0.7 },
  });

  const res  = await getBedrock().send(command);
  const content = res.output?.message?.content ?? [];

  console.log('[Bedrock] Response:', content);

  const toolBlock = content.find((b) => b.toolUse);
  if (toolBlock) {
    return { type: 'tool_call', toolName: toolBlock.toolUse.name, toolInput: toolBlock.toolUse.input };
  }
  const textBlock = content.find((b) => b.text);
  return { type: 'text', text: textBlock?.text ?? '' };
}

// Add error handling wrapper
async function chatBedrockWithErrorHandling(messages) {
  try {
    return await chatBedrock(messages);
  } catch (err) {
    console.error('[Bedrock] Error:', err);
    console.error('[Bedrock] Error details:', err.message);
    throw err;
  }
}

// ── Ollama (local dev fallback) ──────────────────────────────────────────────

async function chatOllama(messages) {
  const base  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL    || 'llama3.1';

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: 'system', content: getSystemPrompt() }, ...messages],
      tools: [{
        type: 'function',
        function: {
          name: SCHEDULE_TOOL.name,
          description: SCHEDULE_TOOL.description,
          parameters: SCHEDULE_TOOL.inputSchema,
        },
      }],
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  const msg  = data.message;

  if (msg.tool_calls?.length) {
    const tc = msg.tool_calls[0].function;
    return {
      type: 'tool_call',
      toolName: tc.name,
      toolInput: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
    };
  }
  return { type: 'text', text: msg.content };
}

// ── Public ───────────────────────────────────────────────────────────────────

/**
 * Chat with the LLM (Bedrock or Ollama)
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @returns {Promise<{type: 'text'|'tool_call', text?: string, toolName?: string, toolInput?: object}>}
 */
export async function chat(messages) {
  const provider = process.env.LLM_PROVIDER || 'bedrock';
  return provider === 'ollama' ? chatOllama(messages) : chatBedrockWithErrorHandling(messages);
}
