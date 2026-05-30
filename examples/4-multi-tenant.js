/**
 * pii-guard Example 4: Multi-tenant SaaS
 *
 * Each tenant gets their own PiiGuard instance with their own config.
 * Sessions are isolated — token maps never cross tenant boundaries.
 */

const { PiiGuard } = require('../src');

// In a real app: load tenant configs from DB or config files
const TENANT_CONFIGS = {
  'tenant-acme': {
    template: 'enterprise',
    terms: ['Acme Corp', 'Acme', 'ACME'],
    custom_rules: [
      { name: 'acme_id', source: 'ACM-\\d{6}', label: 'ACME_ID' },
    ],
  },
  'tenant-hospital': {
    template: 'healthcare',
    custom_rules: [
      { name: 'facility', pattern: 'Mercy General Hospital', label: 'FACILITY' },
    ],
  },
};

// Cache guards per tenant (create once, reuse)
const guardCache = new Map();

function getGuard(tenantId) {
  if (!guardCache.has(tenantId)) {
    const config = TENANT_CONFIGS[tenantId];
    if (!config) throw new Error(`Unknown tenant: ${tenantId}`);
    guardCache.set(tenantId, new PiiGuard(config));
  }
  return guardCache.get(tenantId);
}

// Express middleware example
function piiMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

  try {
    const guard = getGuard(tenantId);
    // Attach guard to request for use in route handlers
    req.piiGuard = guard;
    next();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// Route handler
async function analyzeRoute(req, res) {
  const { prompt } = req.body;
  const { redacted, restore } = req.piiGuard.redact(prompt);

  const llmResponse = await callLLM(redacted); // your LLM call here
  const restored = restore(llmResponse);

  res.json({ response: restored });
}

// Demo
function demo() {
  const acmeGuard = getGuard('tenant-acme');
  const hospitalGuard = getGuard('tenant-hospital');

  const acmeInput = 'Review account for bob@acme.com at Acme Corp. ID: ACM-123456.';
  const hospitalInput = 'Patient John Smith, DOB: 01/15/1980, at Mercy General Hospital.';

  console.log('=== Acme tenant ===');
  console.log(acmeGuard.dryRun(acmeInput));

  console.log('\n=== Hospital tenant ===');
  console.log(hospitalGuard.dryRun(hospitalInput));
}

demo();

async function callLLM(prompt) {
  return `Analysis complete for ${prompt.slice(0, 20)}...`; // stub
}
