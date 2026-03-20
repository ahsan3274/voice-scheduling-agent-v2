/**
 * lib/llm.js
 * Calls AWS Bedrock for the conversation brain.
 * Falls back to Ollama for local dev if LLM_PROVIDER=ollama.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/**
 * Generate the system prompt for the voice scheduling assistant
 * @returns {string} System prompt with conversation flow instructions
 */
export function getSystemPrompt() {
  return `You are a friendly, efficient voice scheduling assistant helping users book calendar meetings.

Conversation flow — follow this exactly:
1. Greet the user warmly (keep it to one sentence).
2. Ask for their full name.
3. Ask for their preferred date. Today is ${new Date().toDateString()}.
4. Ask for their preferred time. If no timezone mentioned, ask or assume UTC.
5. Ask for a meeting title (tell them they can skip it).
6. Confirm all details back: name, date, time, title.
7. Once the user confirms, immediately call the schedule_meeting tool.
8. After the tool returns successfully, tell the user the meeting is booked and read out the event link.

Critical voice rules:
- This is spoken aloud — keep every response to 1-2 short sentences maximum.
- Never use bullet points, markdown, or lists.
- Say dates naturally: "April fifth at two PM", never ISO strings.
- If time is ambiguous, confirm AM or PM before proceeding.
- Do not proceed to booking until the user explicitly confirms the details.`;
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
  const modelId = process.env.BEDROCK_MODEL_ID || 'meta.llama3-3-70b-instruct-v1:0';

  const command = new ConverseCommand({
    modelId,
    system: [{ text: getSystemPrompt() }],
    messages: messages.map((m) => ({
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

  const toolBlock = content.find((b) => b.toolUse);
  if (toolBlock) {
    return { type: 'tool_call', toolName: toolBlock.toolUse.name, toolInput: toolBlock.toolUse.input };
  }
  const textBlock = content.find((b) => b.text);
  return { type: 'text', text: textBlock?.text ?? '' };
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
  return provider === 'ollama' ? chatOllama(messages) : chatBedrock(messages);
}
