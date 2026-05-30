'use strict';

/**
 * pii-guard SDK — in-process library mode.
 *
 * Use this when you want to embed pii-guard directly in your Node.js app
 * without running a separate proxy server.
 *
 * Usage:
 *   const { PiiGuard } = require('pii-guard');
 *   const guard = new PiiGuard({ template: 'enterprise', terms: ['Acme'] });
 *
 *   // Single redact
 *   const { redacted, restore } = guard.redact('Call john@acme.com');
 *   const response = await claude.messages.create({ messages: [{ role: 'user', content: redacted }] });
 *   console.log(restore(response.content[0].text));
 *
 *   // Multi-message session (keeps token map consistent across turns)
 *   const session = guard.session();
 *   const r1 = session.redact(msg1);
 *   const r2 = session.redact(msg2);
 *   // ... call LLM ...
 *   const out = session.restore(llmResponse);
 *
 *   // Streaming
 *   const sr = guard.streamRestorer();
 *   for (const chunk of stream) {
 *     process.stdout.write(sr.push(chunk));
 *   }
 *   process.stdout.write(sr.flush());
 */

const { loadConfig, buildConfig } = require('../config/loader');
const { buildRules, redact: coreRedact, restore: coreRestore, createSession } = require('../core/redactor');
const { StreamRestorer } = require('../core/stream-restorer');
const { TEMPLATES } = require('../config/templates');

class PiiGuard {
  /**
   * @param {Object|string} options - Config object or path to YAML file
   * @param {string}   [options.template]          - Template name (default: 'personal')
   * @param {string[]} [options.terms]             - Custom term strings to redact
   * @param {Object[]} [options.custom_rules]      - Custom rule objects ({ pattern, label, redact })
   * @param {string[]} [options.disable_builtins]  - Built-in pattern names to disable
   */
  constructor(options = {}) {
    if (typeof options === 'string') {
      this._config = loadConfig(options);
    } else {
      // Normalise: accept both `terms` (shorthand) and `custom_rules`
      const customRules = [];
      if (options.terms?.length) {
        for (const term of options.terms) {
          customRules.push({ pattern: term, label: 'TERM' });
        }
      }
      if (options.custom_rules?.length) {
        customRules.push(...options.custom_rules);
      }
      this._config = buildConfig({
        template: options.template || 'personal',
        custom_rules: customRules,
        disable_builtins: options.disable_builtins || [],
        ...options,
      });
    }
    this._rules = buildRules(this._config);
  }

  /**
   * Redact a single string.
   * @param {string} text
   * @returns {{ redacted: string, restore: (text: string) => string, map: Map }}
   */
  redact(text) {
    const session = createSession();
    const { redacted } = coreRedact(text, this._rules, session);
    return {
      redacted,
      restore: (t) => coreRestore(t, session),
      map: session.tokenToValue,
    };
  }

  /**
   * Create a multi-message session with shared token map.
   * Use for multi-turn conversations.
   */
  session() {
    return new GuardSession(this._rules);
  }

  /**
   * Create a streaming restorer for use with SSE/streaming LLM responses.
   * Must be paired with a session whose token map is already populated.
   */
  streamRestorer(session) {
    return new StreamRestorer(session);
  }

  /**
   * Dry run — inspect what would be redacted.
   * @param {string} text
   * @returns {{ redacted: string, tokens: Object, count: number }}
   */
  dryRun(text) {
    const { redacted, map } = this.redact(text);
    return { redacted, tokens: Object.fromEntries(map), count: map.size };
  }

  get template() { return this._config.template; }
  get ruleCount() { return this._rules.length; }
}

/**
 * Multi-message session.
 */
class GuardSession {
  constructor(rules) {
    this._rules = rules;
    this._session = createSession();
  }

  redact(text) {
    const { redacted } = coreRedact(text, this._rules, this._session);
    return redacted;
  }

  restore(text) {
    return coreRestore(text, this._session);
  }

  streamRestorer() {
    return new StreamRestorer(this._session);
  }

  get tokenCount() { return this._session.tokenToValue.size; }
}

module.exports = {
  PiiGuard,
  GuardSession,
  StreamRestorer,
  TEMPLATES,
  // Shorthand
  createGuard: (opts) => new PiiGuard(opts),
  redact: (text, opts) => new PiiGuard(opts).redact(text),
};
