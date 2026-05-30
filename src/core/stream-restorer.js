'use strict';

/**
 * Streaming-safe token restorer.
 *
 * Problem: When an LLM streams a response in chunks, a token like
 * [PII_GUARD:EMAIL:1] can split across chunk boundaries:
 *   chunk 1: "Contact [PII_GUARD:EMA"
 *   chunk 2: "IL:1] for details."
 *
 * Naive split/join on each chunk would miss split tokens.
 *
 * Solution: Buffer input. Only flush text up to the last position
 * that cannot possibly be the start of an incomplete token.
 * On stream end, flush() emits the remainder.
 */

const { restore } = require('./redactor');

const TOKEN_OPEN = '[PII_GUARD:';
const MAX_TOKEN_LENGTH = 64; // [PII_GUARD:XXXXXXXXXX:999] ≈ 28 chars, 64 is safe max

class StreamRestorer {
  constructor(session) {
    this.session = session;
    this.buffer = '';
  }

  /**
   * Push a new chunk. Returns text that is safe to emit (tokens fully resolved).
   * @param {string} chunk
   * @returns {string}
   */
  push(chunk) {
    this.buffer += chunk;
    return this._drain();
  }

  /**
   * Flush remaining buffer. Call after stream ends.
   * @returns {string}
   */
  flush() {
    const remaining = restore(this.buffer, this.session);
    this.buffer = '';
    return remaining;
  }

  /**
   * Drain safe portion of buffer.
   * "Safe" = text that cannot be the start of an unfinished token.
   *
   * We walk backwards from the end to find the last '[' that could
   * begin an incomplete TOKEN_OPEN. Everything before that '[' is safe.
   */
  _drain() {
    const buf = this.buffer;
    if (buf.length === 0) return '';

    // Find the last position that could be the start of an incomplete token
    let safeEnd = buf.length;

    for (let i = buf.length - 1; i >= Math.max(0, buf.length - MAX_TOKEN_LENGTH); i--) {
      if (buf[i] === '[') {
        const tail = buf.slice(i);
        // Is this '[' a possible start of our token prefix?
        if (TOKEN_OPEN.startsWith(tail)) {
          // Incomplete — don't flush this far
          safeEnd = i;
          break;
        }
        // Is it a complete token (starts with TOKEN_OPEN and ends with ])?
        if (tail.startsWith(TOKEN_OPEN) && tail.includes(']')) {
          // It's a complete token — safe to include
          break;
        }
        // Starts with [ but not our prefix — might be user's own brackets, safe
      }
    }

    if (safeEnd === 0) return '';

    const safe = buf.slice(0, safeEnd);
    this.buffer = buf.slice(safeEnd);
    return restore(safe, this.session);
  }
}

module.exports = { StreamRestorer };
