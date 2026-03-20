#!/usr/bin/env node
/**
 * scripts/setup-local.js
 * Run with: npm run setup
 * Validates that all required env vars are present before you start the dev server.
 */

const fs   = require('fs');
const path = require('path');

const REQUIRED = [
  { key: 'DEEPGRAM_API_KEY',           hint: 'console.deepgram.com → API Keys' },
  { key: 'AWS_ACCESS_KEY_ID',          hint: 'AWS Console → IAM → Users → Security credentials' },
  { key: 'AWS_SECRET_ACCESS_KEY',      hint: 'AWS Console → IAM → Users → Security credentials' },
  { key: 'GOOGLE_SERVICE_ACCOUNT_JSON',hint: 'Google Cloud Console → IAM → Service Accounts → Keys' },
];

const OPTIONAL = [
  { key: 'DEEPGRAM_PROJECT_ID',  hint: 'Enables short-lived browser tokens (recommended)' },
  { key: 'AWS_REGION',           hint: 'Defaults to us-east-1' },
  { key: 'BEDROCK_MODEL_ID',     hint: 'Defaults to meta.llama3-3-70b-instruct-v1:0' },
  { key: 'POLLY_VOICE_ID',       hint: 'Defaults to Joanna' },
  { key: 'GOOGLE_CALENDAR_ID',   hint: 'Defaults to "primary"' },
  { key: 'LLM_PROVIDER',         hint: 'Set to "ollama" to use local model instead of Bedrock' },
];

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

const env    = { ...loadEnv(path.join(__dirname, '..', '.env.local')), ...process.env };
let   allOk  = true;

console.log('\n🔍  Checking .env.local …\n');

for (const { key, hint } of REQUIRED) {
  const ok = !!env[key]?.trim();
  console.log(`  ${ok ? '✅' : '❌'}  ${key}${ok ? '' : `   ← MISSING  (${hint})`}`);
  if (!ok) allOk = false;
}

console.log('');

for (const { key, hint } of OPTIONAL) {
  const ok = !!env[key]?.trim();
  console.log(`  ${ok ? '✅' : '⚠️ '}  ${key}${ok ? '' : `  (optional — ${hint})`}`);
}

console.log('');

if (allOk) {
  console.log('✅  All required variables set — run: npm run dev\n');
  process.exit(0);
} else {
  console.log('❌  Missing required variables. Copy .env.example → .env.local and fill them in.\n');
  process.exit(1);
}
