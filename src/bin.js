#!/usr/bin/env node
'use strict';

/**
 * pii-guard CLI
 * npx pii-guard          → start proxy server
 * npx pii-guard --dry-run "text with PII"
 * npx pii-guard --template healthcare
 */

const args = process.argv.slice(2);

if (args.includes('--dry-run')) {
  const idx = args.indexOf('--dry-run');
  const text = args[idx + 1] || '';
  const template = args.includes('--template') ? args[args.indexOf('--template') + 1] : 'personal';
  const { PiiGuard } = require('./sdk/index');
  const guard = new PiiGuard({ template });
  const result = guard.dryRun(text);
  console.log('\n=== DRY RUN ===');
  console.log('Template:', template);
  console.log('\nOriginal:\n ', text);
  console.log('\nRedacted:\n ', result.redacted);
  console.log(`\nRedacted ${result.count} item(s):`);
  for (const [token, value] of Object.entries(result.tokens)) {
    console.log(`  ${token} → "${value}"`);
  }
} else {
  // Start proxy server
  require('./proxy/server');
}
