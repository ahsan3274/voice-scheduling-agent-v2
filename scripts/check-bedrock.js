/**
 * Check which Bedrock models you have access to
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const REGION = process.env.AWS_REGION || 'eu-central-1';

const MODELS_TO_TEST = [
  'meta.llama3-3-70b-instruct-v1:0',
  'meta.llama3-1-70b-instruct-v1:0',
  'meta.llama3-1-8b-instruct-v1:0',
  'anthropic.claude-3-5-sonnet-20240620-v1:0',
  'anthropic.claude-3-sonnet-20240229-v1:0',
  'anthropic.claude-3-haiku-20240307-v1:0',
];

const client = new BedrockRuntimeClient({ region: REGION });

async function testModel(modelId) {
  try {
    const command = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: 'Hi' }] }],
      inferenceConfig: { maxTokens: 10 },
    });
    
    const start = Date.now();
    await client.send(command);
    const duration = Date.now() - start;
    
    return { modelId, status: '✅ Available', time: `${duration}ms` };
  } catch (err) {
    const msg = err.name === 'AccessDeniedException' ? '❌ Access Denied' : `⚠️ ${err.message}`;
    return { modelId, status: msg, time: '-' };
  }
}

async function main() {
  console.log(`\n🔍 Checking Bedrock model access (region: ${REGION})...\n`);
  
  const results = await Promise.all(MODELS_TO_TEST.map(testModel));
  
  console.log('Model                          | Status          | Latency');
  console.log('-------------------------------|-----------------|--------');
  results.forEach(({ modelId, status, time }) => {
    const shortId = modelId.split('.').pop() || modelId;
    console.log(`${shortId.padEnd(30)} | ${status.padEnd(15)} | ${time}`);
  });
  
  const available = results.filter(r => r.status === '✅ Available');
  if (available.length > 0) {
    console.log(`\n✅ Recommended: ${available[0].modelId}`);
    console.log(`\nUpdate .env.local with:`);
    console.log(`BEDROCK_MODEL_ID=${available[0].modelId}`);
  }
  console.log('');
}

main().catch(console.error);
