'use strict';

const {
  BUILT_IN_PATTERNS,
  HEALTHCARE_PATTERNS,
  FINANCIAL_PATTERNS,
  HR_PATTERNS,
} = require('../core/patterns');

/**
 * Pre-built domain templates.
 * Each template defines a set of redact_rules.
 * Templates can be extended with custom_rules in YAML config.
 */

const TEMPLATES = {
  // ── Personal ────────────────────────────────────────────────────────────
  personal: {
    name: 'personal',
    description: 'Basic PII redaction for personal AI agents. Covers standard identifiers.',
    redact_rules: [
      ...BUILT_IN_PATTERNS.filter(p => ['email', 'phone', 'ssn', 'credit_card', 'uuid'].includes(p.name)),
    ],
  },

  // ── Enterprise / Fintech ────────────────────────────────────────────────
  enterprise: {
    name: 'enterprise',
    description: 'Fintech/compliance redaction. Covers all personal PII + financial identifiers.',
    redact_rules: [
      ...BUILT_IN_PATTERNS.filter(p =>
        ['email', 'uuid', 'jwt', 'api_key', 'credit_card', 'iban', 'ssn', 'phone', 'ipv4'].includes(p.name)
      ),
      ...FINANCIAL_PATTERNS,
    ],
  },

  // ── Healthcare / HIPAA ─────────────────────────────────────────────────
  healthcare: {
    name: 'healthcare',
    description: 'HIPAA-aligned PII redaction. Covers all personal PII + 18 HIPAA identifiers.',
    redact_rules: [
      ...BUILT_IN_PATTERNS.filter(p =>
        ['email', 'uuid', 'credit_card', 'ssn', 'phone', 'ipv4', 'dob', 'us_zip'].includes(p.name)
      ),
      ...HEALTHCARE_PATTERNS,
    ],
  },

  // ── HR / Payroll ────────────────────────────────────────────────────────
  hr: {
    name: 'hr',
    description: 'HR/payroll redaction. Covers employee data, salary, health plan references.',
    redact_rules: [
      ...BUILT_IN_PATTERNS.filter(p => ['email', 'phone', 'ssn', 'dob'].includes(p.name)),
      ...HR_PATTERNS,
    ],
  },

  // ── CRM / Sales ────────────────────────────────────────────────────────
  crm: {
    name: 'crm',
    description: 'CRM/sales redaction. Covers contact data and deal-sensitive info.',
    redact_rules: [
      ...BUILT_IN_PATTERNS.filter(p =>
        ['email', 'phone', 'credit_card', 'ipv4'].includes(p.name)
      ),
    ],
  },

  // ── Full (maximum coverage) ─────────────────────────────────────────────
  full: {
    name: 'full',
    description: 'Maximum coverage — all built-in patterns + financial + healthcare + HR.',
    redact_rules: [
      ...BUILT_IN_PATTERNS,
      ...HEALTHCARE_PATTERNS,
      ...FINANCIAL_PATTERNS,
      ...HR_PATTERNS,
    ],
  },
};

module.exports = { TEMPLATES };
