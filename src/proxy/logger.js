'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? 1;

// Ensure log dir exists
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {}

function write(level, message, data = {}) {
  if ((LEVELS[level] ?? 0) < currentLevel) return;

  const timestamp = new Date().toISOString();
  const entry = { timestamp, level: level.toUpperCase(), message, ...data };

  // Never log PII — token maps are in-memory only
  console.log(`[${entry.level}] ${message}`);

  try {
    const logFile = path.join(LOG_DIR, `${timestamp.split('T')[0]}.log`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch {}
}

module.exports = {
  debug: (msg, data) => write('debug', msg, data),
  info: (msg, data) => write('info', msg, data),
  warn: (msg, data) => write('warn', msg, data),
  error: (msg, data) => write('error', msg, data),
};
