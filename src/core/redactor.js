'use strict';

/**
 * Core redaction engine.
 *
 * Strategy: single-pass positional scan — all patterns compete simultaneously.
 * Longest non-overlapping match wins, left-to-right. This prevents patterns
 * from eating each other's matches (e.g., phone regex munching UUID digits).
 *
 * Deduplication: identical values always get the same token within a session.
 * Token format: [PII_GUARD:<LABEL>:<n>]  — distinctive, unlikely to appear in normal text.
 */

const TOKEN_PREFIX = 'PII_GUARD';

/**
 * Build an active rule from a rule definition.
 * Supports: { source, flags, label } (built-in style)
 *           { pattern (RegExp), label }
 */
function compileRule(rule) {
  if (rule.redact === false) return null; // passthrough rule

  let re;
  if (rule.pattern instanceof RegExp) {
    re = new RegExp(rule.pattern.source, ensureGlobal(rule.pattern.flags));
  } else if (rule.source) {
    re = new RegExp(rule.source, ensureGlobal(rule.flags || 'g'));
  } else if (typeof rule.pattern === 'string') {
    // Literal string term: whole-word, case-insensitive
    const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`, 'gi');
  } else {
    throw new Error(`pii-guard: invalid rule — needs pattern or source: ${JSON.stringify(rule)}`);
  }

  return { re, label: rule.label || rule.category || 'PII', name: rule.name || 'custom' };
}

function ensureGlobal(flags = '') {
  return flags.includes('g') ? flags : flags + 'g';
}

/**
 * Redact PII from text.
 *
 * @param {string} text - Input text
 * @param {CompiledRule[]} rules - Compiled rules from buildRules()
 * @param {Object} [session] - Optional shared session for cross-message deduplication
 *   { valueToToken: Map, counters: Object }
 * @returns {{ redacted: string, session: Object }}
 */
function redact(text, rules, session = null) {
  if (typeof text !== 'string' || !text) return { redacted: text, session: session || createSession() };

  const s = session || createSession();

  // Collect all matches with positions
  const allMatches = [];
  for (const { re, label } of rules) {
    const freshRe = new RegExp(re.source, re.flags); // reset lastIndex
    let m;
    while ((m = freshRe.exec(text)) !== null) {
      allMatches.push({ start: m.index, end: m.index + m[0].length, value: m[0], label });
    }
  }

  // Sort: position ascending, then length descending (prefer longer at same position)
  allMatches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Greedy left-to-right non-overlapping selection
  const selected = [];
  let cursor = 0;
  for (const match of allMatches) {
    if (match.start >= cursor) {
      selected.push(match);
      cursor = match.end;
    }
  }

  // Assign tokens (same value → same token within session)
  for (const match of selected) {
    if (!s.valueToToken.has(match.value)) {
      s.counters[match.label] = (s.counters[match.label] || 0) + 1;
      const token = `[${TOKEN_PREFIX}:${match.label}:${s.counters[match.label]}]`;
      s.valueToToken.set(match.value, token);
      s.tokenToValue.set(token, match.value);
    }
  }

  // Build redacted string right-to-left to preserve indices
  let result = text;
  for (let i = selected.length - 1; i >= 0; i--) {
    const { start, end, value } = selected[i];
    const token = s.valueToToken.get(value);
    result = result.slice(0, start) + token + result.slice(end);
  }

  return { redacted: result, session: s };
}

/**
 * Restore tokens in text using a session's tokenToValue map.
 * Safe to call on partial streaming chunks — won't corrupt incomplete tokens.
 *
 * @param {string} text
 * @param {Object} session
 * @returns {string}
 */
function restore(text, session) {
  if (typeof text !== 'string' || !text) return text;
  let result = text;
  for (const [token, value] of session.tokenToValue.entries()) {
    // Use split/join — avoids regex escaping issues with bracket-heavy tokens
    result = result.split(token).join(value);
  }
  return result;
}

/**
 * Create a new session for a single request (or a multi-turn conversation).
 * Shared across messages to ensure consistent tokenization.
 */
function createSession() {
  return {
    valueToToken: new Map(), // original value → token
    tokenToValue: new Map(), // token → original value
    counters: {},            // label → count
  };
}

/**
 * Build compiled rules from a config object.
 * @param {Object} config
 * @returns {CompiledRule[]}
 */
function buildRules(config) {
  const rules = config.redact_rules || [];
  const compiled = [];
  for (const rule of rules) {
    const r = compileRule(rule);
    if (r) compiled.push(r);
  }
  return compiled;
}

module.exports = { redact, restore, createSession, buildRules, TOKEN_PREFIX };
