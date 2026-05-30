/**
 * pii-guard Example 2: SDK + Claude Anthropic API
 *
 * Drop pii-guard into any existing Claude integration.
 * Before: `command` goes to Claude with raw PII.
 * After: PII is stripped, Claude reasons on tokens, response is restored.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { PiiGuard } = require('../src'); // or require('../src')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Configure guard for your use case
const guard = new PiiGuard({
  template: 'enterprise',
  terms: ['Acme Corp', 'PartnerBank'], // company/partner names to hide
});

async function analyzeWithGuard(userPrompt) {
  // 1. Redact PII before sending to Claude
  const { redacted, restore } = guard.redact(userPrompt);

  console.log('[pii-guard] Sending to Claude:', redacted);

  // 2. Send redacted prompt (streaming)
  const stream = await client.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: redacted }],
  });

  let fullResponse = '';
  process.stdout.write('[Claude response] ');

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      const text = chunk.delta.text;
      fullResponse += text;
      process.stdout.write(text); // Stream to user
    }
  }

  console.log();

  // 3. Restore any tokens Claude echoed back
  const restoredResponse = restore(fullResponse);
  console.log('[Restored]', restoredResponse);
  return restoredResponse;
}

// Example usage:
// analyzeWithGuard('Review the KYC for john@acmecorp.com at Acme Corp. Account: 123456789012');
