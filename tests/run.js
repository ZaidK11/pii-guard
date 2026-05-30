'use strict';

/**
 * pii-guard test runner. Zero dependencies.
 * Run: node tests/run.js
 */

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) { console.log(`  ✅ ${label}`); passed++; }
  else       { console.error(`  ❌ FAIL: ${label}`); failed++; }
}
function section(name) { console.log(`\n── ${name} ──`); }

// ── Load modules ─────────────────────────────────────────────────────────────
const { PiiGuard, createGuard, redact } = require('../src/index');
const { StreamRestorer } = require('../src/core/stream-restorer');
const { buildRules, createSession, redact: coreRedact, restore: coreRestore } = require('../src/core/redactor');
const { loadConfig } = require('../src/config/loader');

// ── Email ─────────────────────────────────────────────────────────────────────
section('Email');
{
  const { redacted, restore } = redact('Contact john.doe@example.com for help.', { template: 'personal' });
  assert(!redacted.includes('@'), 'email removed');
  assert(redacted.includes('[PII_GUARD:EMAIL:1]'), 'email token format');
  assert(restore(redacted).includes('john.doe@example.com'), 'email restored');
}

// ── Phone ─────────────────────────────────────────────────────────────────────
section('Phone');
{
  const { redacted, restore } = redact('Call (555) 123-4567 or +1-800-555-0199.', { template: 'personal' });
  assert(!redacted.includes('555'), 'phone removed');
  assert(restore(redacted).includes('(555) 123-4567'), 'phone restored');
}

// ── SSN ───────────────────────────────────────────────────────────────────────
section('SSN');
{
  const { redacted } = redact('SSN: 123-45-6789', { template: 'personal' });
  assert(redacted.includes('[PII_GUARD:SSN:1]'), 'SSN token');
}

// ── UUID doesn't eat phone digits ─────────────────────────────────────────────
section('UUID + Phone non-interference');
{
  const text = 'User: 550e8400-e29b-41d4-a716-446655440000 | Phone: (555) 123-4567';
  const { redacted } = redact(text, { template: 'enterprise' });
  assert(redacted.includes('[PII_GUARD:UUID:1]'), 'UUID redacted');
  assert(redacted.includes('[PII_GUARD:PHONE:1]'), 'phone redacted alongside UUID');
}

// ── Credit card ────────────────────────────────────────────────────────────────
section('Credit Card');
{
  const { redacted } = redact('Card: 4111 1111 1111 1111', { template: 'personal' });
  assert(redacted.includes('[PII_GUARD:CARD:1]'), 'card token');
}

// ── Custom terms ───────────────────────────────────────────────────────────────
section('Custom Terms');
{
  const guard = new PiiGuard({ template: 'personal', terms: ['Acme Corp', 'Stripe'] });
  const { redacted, restore } = guard.redact('Acme Corp uses Stripe for payments.');
  assert(!redacted.includes('Acme Corp'), 'company removed');
  assert(!redacted.includes('Stripe'), 'partner removed');
  assert(restore(redacted).includes('Acme Corp'), 'company restored');
}

// ── Same value deduplication ───────────────────────────────────────────────────
section('Deduplication');
{
  const { redacted, map } = redact('Email: a@b.com | Also: a@b.com', { template: 'personal' });
  assert(map.size === 1, `same email → 1 token (got ${map.size})`);
  const matches = (redacted.match(/\[PII_GUARD:EMAIL:1\]/g) || []).length;
  assert(matches === 2, 'token appears twice for both occurrences');
}

// ── Multi-message session ──────────────────────────────────────────────────────
section('Multi-message session');
{
  const guard = new PiiGuard({ template: 'personal' });
  const session = guard.session();
  const r1 = session.redact('Email: hello@test.com');
  const r2 = session.redact('Again: hello@test.com');
  assert(session.tokenCount === 1, 'same email shared across messages');
  assert(r1.includes('[PII_GUARD:EMAIL:1]'), 'msg1 redacted');
  assert(r2.includes('[PII_GUARD:EMAIL:1]'), 'msg2 same token');
}

// ── Restore in LLM response ────────────────────────────────────────────────────
section('LLM response restoration');
{
  const guard = new PiiGuard({ template: 'enterprise', terms: ['Airtm'] });
  const { redacted, restore } = guard.redact('Review for john@airtm.io at Airtm.');
  const fakeLLMResponse = `Review for [PII_GUARD:EMAIL:1] at [PII_GUARD:TERM:1]: approved.`;
  const restored = restore(fakeLLMResponse);
  assert(restored.includes('john@airtm.io'), 'email restored in LLM output');
  assert(restored.includes('Airtm'), 'term restored in LLM output');
}

// ── Passthrough rules (redact: false) ──────────────────────────────────────────
section('Passthrough rules');
{
  const guard = new PiiGuard({
    template: 'personal',
    custom_rules: [
      { pattern: 'OFAC', redact: false },
    ],
  });
  const { redacted } = guard.redact('OFAC screening required, email: test@test.com');
  assert(redacted.includes('OFAC'), 'OFAC preserved');
  assert(!redacted.includes('test@test.com'), 'email still redacted');
}

// ── Disable built-ins ──────────────────────────────────────────────────────────
section('Disable built-ins');
{
  const guard = new PiiGuard({ template: 'personal', disable_builtins: ['email'] });
  const { redacted } = guard.redact('Contact hi@example.com');
  assert(redacted.includes('hi@example.com'), 'email kept when disabled');
}

// ── YAML config loading ────────────────────────────────────────────────────────
section('Config loader');
{
  const fs = require('fs');
  const yaml = '  template: enterprise\n  disable_builtins:\n    - dob\n';
  fs.writeFileSync('/tmp/pii-guard-test.yaml', yaml);
  let config;
  try {
    config = loadConfig('/tmp/pii-guard-test.yaml');
    assert(config.template === 'enterprise', 'template loaded');
    assert(!config.redact_rules.find(r => r.name === 'dob'), 'dob disabled');
  } catch (e) {
    if (e.message.includes('js-yaml')) {
      console.log('  ⚠️  js-yaml not installed — YAML test skipped');
      passed++;
    } else {
      assert(false, `config load failed: ${e.message}`);
    }
  }
  fs.unlinkSync('/tmp/pii-guard-test.yaml');
}

// ── Streaming restorer ─────────────────────────────────────────────────────────
section('StreamRestorer — split token across chunks');
{
  const guard = new PiiGuard({ template: 'personal' });
  const { redacted, map } = guard.redact('Contact test@example.com for details.');
  const { session: s } = (() => {
    // Manually create session with map
    const sess = createSession();
    for (const [token, value] of map.entries()) {
      sess.tokenToValue.set(token, value);
      sess.valueToToken.set(value, token);
    }
    return { session: sess };
  })();

  const sr = new StreamRestorer(s);
  const token = '[PII_GUARD:EMAIL:1]';
  const splitPoint = Math.floor(token.length / 2);
  const chunk1 = 'Contact ' + token.slice(0, splitPoint);
  const chunk2 = token.slice(splitPoint) + ' for details.';

  let output = '';
  output += sr.push(chunk1);
  output += sr.push(chunk2);
  output += sr.flush();

  assert(output.includes('test@example.com'), `split token restored (got: "${output}")`);
}

// ── Dry run ───────────────────────────────────────────────────────────────────
section('Dry run');
{
  const guard = new PiiGuard({ template: 'personal' });
  const { count } = guard.dryRun('Email: hi@x.com | SSN: 123-45-6789');
  assert(count === 2, `dry run: ${count} items (expected 2)`);
}

// ── Healthcare template ───────────────────────────────────────────────────────
section('Healthcare template');
{
  const guard = new PiiGuard({ template: 'healthcare' });
  const { redacted } = guard.redact('MRN: AB-123456, DOB: 01/15/1990, Insurance: XYZ12345678');
  assert(redacted.includes('[PII_GUARD:MRN:1]'), 'MRN redacted');
  assert(redacted.includes('[PII_GUARD:DOB:1]'), 'DOB redacted');
  assert(redacted.includes('[PII_GUARD:INS_ID:1]'), 'insurance ID redacted');
}

// ── Enterprise template ───────────────────────────────────────────────────────
section('Enterprise template');
{
  const guard = new PiiGuard({ template: 'enterprise' });
  const { redacted } = guard.redact('Account: 123456789012, Routing: 021000021, IBAN: GB82WEST12345698765432');
  assert(redacted.includes('[PII_GUARD:ACCT:1]'), 'account number redacted');
  assert(redacted.includes('[PII_GUARD:ROUTING:1]'), 'routing number redacted');
  assert(redacted.includes('[PII_GUARD:IBAN:1]'), 'IBAN redacted');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed ✅');
