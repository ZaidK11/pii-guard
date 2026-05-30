# pii-guard

**Node.js-first LLM privacy proxy. Redacts PII before prompts reach any AI model — restores original values in responses, including streaming.**

```
Your Agent → pii-guard → Claude / GPT-4 / Ollama → pii-guard → Your Agent
              (redact)      (sees only tokens)        (restore)
```

No PII leaves your infrastructure. Your agent sees real data. The LLM never does.

---

## What makes this different

Most PII libraries stop at redaction. `pii-guard` closes the full loop:

| Feature | pii-guard | Others |
|---|---|---|
| Bidirectional (redact + restore) | ✅ | Redact only |
| Streaming-safe token restoration | ✅ | ❌ Split tokens break |
| Works as library AND proxy server | ✅ | One or the other |
| Multi-LLM routing (Claude, OpenAI, Ollama) | ✅ | Single provider |
| Passthrough rules (keep regulatory terms) | ✅ | All-or-nothing |
| Multi-message sessions (shared token map) | ✅ | Per-request only |
| Domain templates (healthcare, fintech, HR) | ✅ | Basic only |
| Zero heavy dependencies (no Python, no ML) | ✅ | Often needs spaCy/models |

---

## Install

```bash
npm install pii-guard
```

Or run as a standalone proxy (no npm install required in your app):

```bash
npx pii-guard       # starts proxy on port 3000
```

---

## Usage

### Mode 1: SDK (in-process library)

Drop into any existing LLM call:

```javascript
const { PiiGuard } = require('pii-guard');

const guard = new PiiGuard({ template: 'enterprise' });

// Redact before sending
const { redacted, restore } = guard.redact(userPrompt);

const response = await claude.messages.create({
  model: 'claude-opus-4-5',
  messages: [{ role: 'user', content: redacted }],  // ← PII-free
});

// Restore in response
console.log(restore(response.content[0].text));  // ← original values back
```

### Mode 2: Proxy server (language-agnostic)

Start pii-guard once. Point any LLM client at it — no code changes:

```bash
ANTHROPIC_API_KEY=sk-ant-... TEMPLATE=enterprise npx pii-guard
```

```python
# Python, unchanged OpenAI client
from openai import OpenAI
client = OpenAI(base_url="http://localhost:3000/v1", api_key="x")
response = client.chat.completions.create(model="claude-opus-4-5", messages=[...])
```

```javascript
// Node.js, point Anthropic SDK at proxy
const client = new Anthropic({ baseURL: 'http://localhost:3000' });
```

```bash
# Any language, raw HTTP
curl http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-5","max_tokens":512,"messages":[{"role":"user","content":"My SSN is 123-45-6789"}]}'
```

---

## What gets redacted

| Type | Example | Template |
|---|---|---|
| Email | `john@example.com` | all |
| Phone | `(555) 123-4567`, `+1-800-555-0199` | all |
| SSN | `123-45-6789` | all |
| UUID | `550e8400-e29b-41d4-a716-...` | all |
| Credit card | `4111 1111 1111 1111` | all |
| IBAN | `GB82WEST12345698765432` | enterprise |
| Account / routing number | `Account: 123456789012` | enterprise |
| API keys / JWTs | `sk-ant-...`, `eyJ...` | enterprise |
| IPv4 / IPv6 | `192.168.1.1` | enterprise |
| MRN, NPI, DEA | `MRN: A-123456` | healthcare |
| Date of birth | `DOB: 01/15/1990` | healthcare |
| Insurance ID | `Insurance: XYZ12345678` | healthcare |
| Salary | `$120,000 USD annually` | hr |
| Employee ID | `Employee: EMP-00123` | hr |
| Custom terms | Your company/partner names | configurable |

---

## Configuration

### Templates

```javascript
new PiiGuard({ template: 'personal' })    // email, phone, SSN, card
new PiiGuard({ template: 'enterprise' })  // + IBAN, account, routing, API keys
new PiiGuard({ template: 'healthcare' })  // + MRN, NPI, DOB, insurance
new PiiGuard({ template: 'hr' })          // + salary, employee IDs
new PiiGuard({ template: 'full' })        // everything
```

### Custom terms and rules

```javascript
const guard = new PiiGuard({
  template: 'enterprise',
  terms: ['Acme Corp', 'PartnerBank'],  // exact terms, whole-word match
  custom_rules: [
    // Custom regex rule
    { name: 'case_id', source: '(AR|COL|BOL)-\\d{4}', label: 'CASE_ID' },
    // Passthrough: keep this term visible to the LLM
    { name: 'keep_regulatory', pattern: '(OFAC|FinCEN|SAR)', redact: false },
  ],
  disable_builtins: ['dob', 'us_zip'],  // turn off specific built-ins
});
```

### YAML config (for proxy/Docker deployments)

```yaml
# pii-guard-config.yaml
template: enterprise
custom_rules:
  - name: company
    pattern: "Acme Corp"
    label: COMPANY
  - name: keep_regulatory
    pattern: "(OFAC|FinCEN|SAR)"
    redact: false
disable_builtins:
  - dob
```

```bash
CONFIG_PATH=./pii-guard-config.yaml npx pii-guard
```

---

## Multi-turn conversations

For chat agents with conversation history, use a session to share the token map across messages:

```javascript
const session = guard.session();

// Multi-message redact (same token for same value across turns)
const r1 = session.redact(message1);
const r2 = session.redact(message2);

const llmResponse = await callLLM([
  { role: 'user', content: r1 },
  { role: 'user', content: r2 },
]);

// Restore the response
console.log(session.restore(llmResponse));
```

---

## Streaming

`pii-guard` handles the hard streaming problem: tokens like `[PII_GUARD:EMAIL:1]` can split across chunk boundaries. The `StreamRestorer` buffers intelligently and only emits text when it's safe — no split tokens, no garbage output.

```javascript
const session = guard.session();
const redacted = session.redact(prompt);

// Stream from Claude
const stream = await claude.messages.stream({
  messages: [{ role: 'user', content: redacted }],
  ...
});

const sr = session.streamRestorer();

for await (const chunk of stream) {
  const text = chunk.delta?.text || '';
  process.stdout.write(sr.push(text));  // safely restored as chunks arrive
}
process.stdout.write(sr.flush());  // flush remainder
```

---

## Deploy

### Local

```bash
git clone https://github.com/ZaidK11/pii-guard
cd pii-guard
npm install
ANTHROPIC_API_KEY=sk-... TEMPLATE=enterprise npm start
```

### Docker

```bash
docker build -f docker/Dockerfile -t pii-guard .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-... \
  -e TEMPLATE=enterprise \
  pii-guard
```

### Docker Compose

```bash
cp templates/enterprise.yaml pii-guard-config.yaml
ANTHROPIC_API_KEY=sk-... docker-compose -f docker/docker-compose.yml up
```

### Railway (one-click)

1. Fork this repo
2. Connect to Railway → New Project → Deploy from GitHub
3. Set env vars: `ANTHROPIC_API_KEY`, `TEMPLATE`
4. Done — your private pii-guard proxy is live

Environment variables:
```
ANTHROPIC_API_KEY   Claude API key
OPENAI_API_KEY      OpenAI API key (if using GPT models)
TEMPLATE            personal | enterprise | healthcare | hr | full
CONFIG_PATH         Path to YAML config file (overrides TEMPLATE)
PORT                Port to listen on (default: 3000)
LOG_LEVEL           debug | info | warn | error (default: info)
```

---

## Proxy endpoints

| Endpoint | Compatible with |
|---|---|
| `POST /v1/messages` | Anthropic SDK, any Anthropic-compatible client |
| `POST /v1/chat/completions` | OpenAI SDK, LangChain, LlamaIndex, any OpenAI-compatible client |
| `POST /api/guard` | pii-guard native (auto-detects provider from model name) |
| `GET /health` | Health check |
| `GET /stats` | Redaction stats |

---

## How it works

1. **Pattern scan** — all rules run simultaneously against the prompt using a positional scanner. Longest non-overlapping match wins left-to-right. This prevents patterns from eating each other (UUID regex munching phone digit sequences).
2. **Tokenization** — each unique value gets one token: `[PII_GUARD:EMAIL:1]`. Same value → same token across the entire session.
3. **LLM call** — the redacted prompt is forwarded to the configured LLM provider.
4. **Restoration** — tokens in the response are replaced with original values. In streaming mode, a chunk buffer prevents split tokens.
5. **Memory-only** — token maps never touch disk, logs, or the network response. They live only for the duration of a request.

---

## Supported agents and systems

Works with any system that calls an LLM API:

- OpenClaw, Claude Code, Cursor, Copilot
- LangChain, LlamaIndex, AutoGen, CrewAI
- OpenAI SDK, Anthropic SDK (any language)
- Vercel AI SDK, LiteLLM, PortKey
- Custom agents (Node.js, Python, Go, Ruby, etc.)
- Any HTTP client pointing at an OpenAI-compatible endpoint

---

## Security

- PII never touches disk, logs, or network responses
- Token maps are per-request, in-memory only
- Logs record redaction *counts*, never values
- Passthrough rules let you keep regulatory terms (OFAC, SAR, etc.) visible to the LLM without leaking PII
- For HIPAA deployments: enable audit logging (optional) and ensure HTTPS in production

---

## License

Apache 2.0 — free to use, fork, and embed in commercial products.

---

## Contributing

1. Fork the repo
2. Add your pattern/template to `src/core/patterns.js` or `src/config/templates.js`
3. Add a test in `tests/run.js`
4. Submit a PR

New domain templates (legal, government, insurance, etc.) especially welcome.
