/**
 * pii-guard Example 5: Vigía Portal integration
 *
 * How pii-guard is integrated into the Vigía compliance portal.
 * This pattern works for any compliance/fintech agent.
 *
 * Guards:
 *   - User emails, phones, SSNs, UUIDs, credit cards, IBANs
 *   - Company name + partner names (Airtm, Bridges, Kount, Elliptic, Persona)
 *   - Internal system names (Dodrio, Galar, Onix)
 *   - OFAC, FinCEN, SAR, AML preserved (compliance LLM needs these)
 */

const { PiiGuard } = require('../src');

const vigiaGuard = new PiiGuard({
  template: 'enterprise',
  custom_rules: [
    // Company + partner terms
    { pattern: 'Airtm', label: 'COMPANY' },
    { pattern: 'Bridges', label: 'PARTNER' },
    { pattern: 'Elliptic', label: 'PARTNER' },
    { pattern: 'Kount', label: 'PARTNER' },
    { pattern: 'Persona', label: 'PARTNER' },
    // Internal systems
    { pattern: 'Dodrio', label: 'INTERNAL' },
    { pattern: 'Galar', label: 'INTERNAL' },
    { pattern: 'Onix', label: 'INTERNAL' },
    // Regulatory terms: DO NOT redact
    { name: 'keep_regulatory', pattern: '(OFAC|FinCEN|SAR|AML|KYC|KYB|BSA|UIF)', redact: false },
  ],
});

// Drop-in wrapper for any Claude call in Vigía
async function callClaudeWithGuard(command, callClaude) {
  const { redacted, restore } = vigiaGuard.redact(command);
  const rawResponse = await callClaude(redacted);
  return restore(rawResponse);
}

// Dry run demo
const testCommand = `
Review KYC application for user john.smith@airtm.io.
Account UUID: 550e8400-e29b-41d4-a716-446655440000
Verified via Persona. Risk score from Elliptic: 0.12.
Partner: Bridges. OFAC screening: clear. AML status: low.
Airtm internal system: Dodrio shows no flags.
`.trim();

console.log('=== DRY RUN — Vigía guard ===\n');
const { redacted, tokens, count } = vigiaGuard.dryRun(testCommand);
console.log('ORIGINAL:\n', testCommand);
console.log('\nSENT TO CLAUDE:\n', redacted);
console.log(`\nRedacted ${count} items:`);
for (const [token, value] of Object.entries(tokens)) {
  console.log(`  ${token} → "${value}"`);
}
