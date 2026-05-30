'use strict';

/**
 * Config loader. Supports YAML files and plain JS objects.
 *
 * Config structure:
 *   template: personal | enterprise | healthcare | hr | crm | full
 *   custom_rules:
 *     - name: my_rule
 *       pattern: "SomeCompanyName"     # string term (whole-word match)
 *       label: COMPANY                 # optional token label
 *     - name: case_id
 *       source: "(AR|COL|BOL)-\\d{4}" # regex source string
 *       flags: g
 *       label: CASE_ID
 *       redact: true                   # default
 *     - name: keep_regulatory
 *       pattern: "(OFAC|FinCEN|SAR)"
 *       redact: false                  # passthrough: skip this pattern
 *   disable_builtins:
 *     - dob
 *     - us_zip
 */

const fs = require('fs');
const path = require('path');
const { TEMPLATES } = require('./templates');

let yaml;
try {
  yaml = require('js-yaml');
} catch {
  yaml = null; // js-yaml not installed → only support JS object config
}

/**
 * Load config from a YAML file path or a plain JS config object.
 * @param {string|Object} configPathOrObject
 * @returns {Object} merged config
 */
function loadConfig(configPathOrObject = {}) {
  let raw = {};

  if (typeof configPathOrObject === 'string') {
    const configPath = path.resolve(configPathOrObject);
    if (!fs.existsSync(configPath)) {
      throw new Error(`pii-guard: config file not found: ${configPath}`);
    }
    const content = fs.readFileSync(configPath, 'utf8');
    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
      if (!yaml) throw new Error('pii-guard: js-yaml required for YAML configs. npm install js-yaml');
      raw = yaml.load(content) || {};
    } else {
      raw = JSON.parse(content);
    }
  } else if (typeof configPathOrObject === 'object') {
    raw = configPathOrObject;
  }

  return buildConfig(raw);
}

/**
 * Build a resolved config from raw user config.
 */
function buildConfig(raw = {}) {
  const templateName = raw.template || 'personal';
  const template = TEMPLATES[templateName];
  if (!template) {
    throw new Error(`pii-guard: unknown template "${templateName}". Valid: ${Object.keys(TEMPLATES).join(', ')}`);
  }

  // Start from template rules
  let rules = [...template.redact_rules];

  // Remove disabled builtins
  const disabled = new Set(raw.disable_builtins || []);
  if (disabled.size > 0) {
    rules = rules.filter(r => !disabled.has(r.name));
  }

  // Append custom rules
  const customRules = raw.custom_rules || [];
  rules = [...rules, ...customRules];

  return {
    template: templateName,
    redact_rules: rules,
    // pass-through any other config keys
    ...Object.fromEntries(
      Object.entries(raw).filter(([k]) => !['template', 'custom_rules', 'disable_builtins'].includes(k))
    ),
  };
}

/**
 * Load config from environment variable TEMPLATE (no file needed).
 * Used by Docker/Railway deployments.
 */
function loadFromEnv() {
  const template = process.env.TEMPLATE || 'personal';
  const custom = process.env.CUSTOM_RULES ? JSON.parse(process.env.CUSTOM_RULES) : [];
  const disabled = process.env.DISABLE_BUILTINS ? process.env.DISABLE_BUILTINS.split(',') : [];
  return buildConfig({ template, custom_rules: custom, disable_builtins: disabled });
}

module.exports = { loadConfig, loadFromEnv, buildConfig, TEMPLATES };
