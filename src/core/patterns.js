'use strict';

/**
 * Built-in PII pattern definitions.
 * Ordered by specificity — more specific patterns run first in the positional scanner.
 * Each pattern has: name, label, source (regex source), flags
 */
const BUILT_IN_PATTERNS = [
  {
    name: 'email',
    label: 'EMAIL',
    source: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
    flags: 'g',
  },
  {
    name: 'uuid',
    label: 'UUID',
    source: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    flags: 'gi',
  },
  {
    name: 'jwt',
    label: 'JWT',
    source: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
    flags: 'g',
  },
  {
    name: 'api_key',
    label: 'API_KEY',
    // Matches sk-..., sk-ant-..., Bearer tokens, etc.
    source: '(?:sk-[A-Za-z0-9\\-]{20,}|Bearer\\s+[A-Za-z0-9\\-_.]{20,})',
    flags: 'g',
  },
  {
    name: 'credit_card',
    label: 'CARD',
    source: '\\b(?:4\\d{3}|5[1-5]\\d{2}|6011|3[47]\\d{2})[\\s\\-]?\\d{4}[\\s\\-]?\\d{4}[\\s\\-]?\\d{4}(?:[\\s\\-]?\\d{3})?\\b',
    flags: 'g',
  },
  {
    name: 'iban',
    label: 'IBAN',
    source: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{4}\\d{7}(?:[A-Z0-9]?){0,16}\\b',
    flags: 'g',
  },
  {
    name: 'ssn',
    label: 'SSN',
    source: '\\b(?!000|666|9\\d{2})\\d{3}[\\s\\-](?!00)\\d{2}[\\s\\-](?!0000)\\d{4}\\b',
    flags: 'g',
  },
  {
    name: 'phone',
    // Requires separator to avoid digit-soup false positives
    label: 'PHONE',
    source: '(?:\\+?1[\\-.\\s])?\\(?\\d{3}\\)?[\\-.\\s]\\d{3}[\\-.\\s]\\d{4}(?:\\s?(?:x|ext)\\.?\\s?\\d{1,5})?',
    flags: 'g',
  },
  {
    name: 'ipv4',
    label: 'IP',
    source: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    flags: 'g',
  },
  {
    name: 'ipv6',
    label: 'IP',
    source: '(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}',
    flags: 'g',
  },
  {
    name: 'us_zip',
    label: 'ZIP',
    source: '\\b\\d{5}(?:-\\d{4})?\\b',
    flags: 'g',
  },
  {
    name: 'dob',
    label: 'DOB',
    source: '\\b(?:\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{4}[\\/\\-]\\d{2}[\\/\\-]\\d{2}|\\d{1,2}[\\-\\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\\-\\s]\\d{2,4})\\b',
    flags: 'gi',
  },
];

// Healthcare (HIPAA) patterns
const HEALTHCARE_PATTERNS = [
  {
    name: 'mrn',
    label: 'MRN',
    source: '\\bMRN[:\\s]+[A-Z0-9\\-]{4,12}\\b',
    flags: 'gi',
  },
  {
    name: 'npi',
    label: 'NPI',
    source: '\\bNPI[:\\s]+\\d{10}\\b',
    flags: 'gi',
  },
  {
    name: 'dea',
    label: 'DEA',
    source: '\\bDEA[:\\s]+[A-Z]{2}\\d{7}\\b',
    flags: 'gi',
  },
  {
    name: 'insurance_id',
    label: 'INS_ID',
    source: '\\b(?:Insurance|Ins|Member)[:\\s]+[A-Z0-9\\-]{6,16}\\b',
    flags: 'gi',
  },
];

// Financial patterns
const FINANCIAL_PATTERNS = [
  {
    name: 'account_number',
    label: 'ACCT',
    source: '\\b(?:Account|Acct|Acc)[:\\s#]+\\d{6,16}\\b',
    flags: 'gi',
  },
  {
    name: 'routing_number',
    label: 'ROUTING',
    source: '\\b(?:Routing|ABA|RTN)[:\\s]+\\d{9}\\b',
    flags: 'gi',
  },
  {
    name: 'swift',
    label: 'SWIFT',
    source: '\\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b',
    flags: 'g',
  },
];

// HR patterns
const HR_PATTERNS = [
  {
    name: 'salary',
    label: 'SALARY',
    source: '\\$[\\d,]{4,}(?:\\.\\d{2})?(?:\\s*(?:USD|EUR|GBP|MXN|ARS))?(?:\\s*(?:per\\s+year|annually|p\\.a\\.|salary))?',
    flags: 'gi',
  },
  {
    name: 'employee_id',
    label: 'EMP_ID',
    source: '\\b(?:Employee|Emp|Staff)[:\\s#]+[A-Z0-9\\-]{3,10}\\b',
    flags: 'gi',
  },
];

module.exports = {
  BUILT_IN_PATTERNS,
  HEALTHCARE_PATTERNS,
  FINANCIAL_PATTERNS,
  HR_PATTERNS,
};
