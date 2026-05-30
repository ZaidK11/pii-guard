'use strict';

/**
 * pii-guard proxy server.
 *
 * Drop-in replacement for Claude/OpenAI API endpoints:
 *   POST /v1/messages       → Anthropic-compatible
 *   POST /v1/chat/completions → OpenAI-compatible
 *   POST /api/guard         → pii-guard native (any provider)
 *   GET  /health            → health check
 *   GET  /stats             → redaction stats (current session)
 */

const express = require('express');
const { loadConfig, loadFromEnv } = require('../config/loader');
const { buildRules, redact, restore, createSession } = require('../core/redactor');
const { StreamRestorer } = require('../core/stream-restorer');
const { detectProvider, buildUpstreamRequest, extractResponseText, injectRestoredText } = require('./router');
const logger = require('./logger');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Load config ──────────────────────────────────────────────────────────────
let CONFIG;
let RULES;

function initConfig() {
  try {
    if (process.env.CONFIG_PATH) {
      CONFIG = loadConfig(process.env.CONFIG_PATH);
    } else {
      CONFIG = loadFromEnv();
    }
    RULES = buildRules(CONFIG);
    logger.info(`pii-guard ready — template: ${CONFIG.template}, rules: ${RULES.length}`);
  } catch (err) {
    logger.error(`Failed to load config: ${err.message}`);
    process.exit(1);
  }
}

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = { requests: 0, redactions: 0, errors: 0, uptime: Date.now() };

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    template: CONFIG?.template,
    rules: RULES?.length,
    uptime: Math.round((Date.now() - stats.uptime) / 1000) + 's',
  });
});

app.get('/stats', (req, res) => {
  res.json({ ...stats, template: CONFIG?.template });
});

// ── Core proxy handler ───────────────────────────────────────────────────────

async function handleMessages(req, res) {
  stats.requests++;
  const body = req.body;
  const providerOverride = req.headers['x-pii-guard-provider'] || null;

  // Detect provider
  const provider = providerOverride || detectProvider(body.model);

  // Build session (shared across all messages in this request)
  const session = createSession();

  // Redact all user messages
  const redactedMessages = [];
  let totalRedactions = 0;

  for (const msg of body.messages || []) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const { redacted: redactedText, session: s } = redact(msg.content, RULES, session);
      Object.assign(session, s); // merge session (same object, but pattern)
      const count = session.tokenToValue.size;
      totalRedactions = Math.max(totalRedactions, count);
      redactedMessages.push({ ...msg, content: redactedText });
    } else {
      redactedMessages.push(msg);
    }
  }

  stats.redactions += totalRedactions;
  logger.info(`request processed — provider: ${provider}, redactions: ${totalRedactions}`);

  // Build upstream request
  const { url, headers, body: upstreamBody } = buildUpstreamRequest(
    { ...body, messages: redactedMessages },
    provider
  );

  const isStreaming = body.stream === true;

  try {
    const { default: fetch } = await import('node-fetch');
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...upstreamBody, stream: isStreaming }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      logger.error(`Upstream error ${upstream.status}: ${errText}`);
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}`, details: errText });
    }

    if (isStreaming) {
      // ── Streaming response ────────────────────────────────────────────
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const sr = new StreamRestorer(session);

      upstream.body.on('data', (chunk) => {
        const raw = chunk.toString('utf8');
        // SSE: each line is "data: <json>\n" or "data: [DONE]\n"
        const lines = raw.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) {
            res.write(line + '\n');
            continue;
          }
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            // Flush remaining buffer
            const tail = sr.flush();
            if (tail) {
              // For [DONE], just emit it as-is
            }
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            // Extract text delta (works for both Anthropic and OpenAI streaming)
            const delta = extractStreamDelta(parsed, provider);
            if (delta !== null) {
              const safe = sr.push(delta);
              parsed[provider === 'anthropic' ? '_restored_delta' : '_restored_delta'] = safe;
              // Inject restored text back
              injectStreamDelta(parsed, safe, provider);
            }
            res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          } catch {
            res.write(line + '\n');
          }
        }
      });

      upstream.body.on('end', () => {
        const tail = sr.flush();
        if (tail) {
          logger.info(`stream tail flushed: ${tail.length} chars`);
        }
        res.end();
      });

      upstream.body.on('error', (err) => {
        logger.error(`Stream error: ${err.message}`);
        stats.errors++;
        res.end();
      });

    } else {
      // ── Non-streaming response ────────────────────────────────────────
      const responseData = await upstream.json();
      const texts = extractResponseText(responseData, provider);
      const restoredTexts = texts.map(t => restore(t, session));
      const restoredResponse = injectRestoredText(responseData, restoredTexts, provider);
      res.json(restoredResponse);
    }

  } catch (err) {
    stats.errors++;
    logger.error(`Handler error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'pii-guard internal error', details: err.message });
    }
  }
}

// ── Streaming delta helpers ──────────────────────────────────────────────────

function extractStreamDelta(parsed, provider) {
  if (provider === 'anthropic') {
    return parsed.delta?.text ?? null;
  }
  // OpenAI
  return parsed.choices?.[0]?.delta?.content ?? null;
}

function injectStreamDelta(parsed, text, provider) {
  if (provider === 'anthropic') {
    if (parsed.delta) parsed.delta.text = text;
  } else {
    if (parsed.choices?.[0]?.delta) parsed.choices[0].delta.content = text;
  }
}

// ── Route mounting ───────────────────────────────────────────────────────────

// Anthropic-compatible endpoint
app.post('/v1/messages', handleMessages);

// OpenAI-compatible endpoint
app.post('/v1/chat/completions', handleMessages);

// pii-guard native endpoint
app.post('/api/guard', handleMessages);

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);

if (require.main === module) {
  initConfig();
  app.listen(PORT, () => {
    logger.info(`pii-guard proxy listening on port ${PORT}`);
    logger.info(`Endpoints: /v1/messages (Anthropic) | /v1/chat/completions (OpenAI) | /api/guard (native)`);
  });
}

module.exports = { app, initConfig };
