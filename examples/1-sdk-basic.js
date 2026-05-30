/**
 * pii-guard Example 1: SDK — Basic usage
 *
 * The simplest way to use pii-guard in your Node.js app.
 * No proxy server needed. Import and redact inline.
 */

const { PiiGuard } = require('../src'); // or require('../src')

// Create a guard with the 'personal' template
const guard = new PiiGuard({ template: 'personal' });

// --- One-shot redact + restore ---

const userInput = 'My name is Jane Smith. Email: jane@example.com. SSN: 234-56-7890.';

const { redacted, restore } = guard.redact(userInput);

console.log('Original :', userInput);
console.log('Redacted :', redacted);
// "My name is Jane Smith. Email: [PII_GUARD:EMAIL:1]. SSN: [PII_GUARD:SSN:1]."

// Simulate sending to Claude (or any LLM)
const fakeLLMResponse = `The user with email [PII_GUARD:EMAIL:1] has been verified.`;
console.log('Restored :', restore(fakeLLMResponse));
// "The user with email jane@example.com has been verified."
