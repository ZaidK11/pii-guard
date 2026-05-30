'use strict';

/**
 * LLM Router — translates pii-guard proxy requests to provider APIs.
 *
 * Supported providers:
 *   - anthropic  (Claude)
 *   - openai     (GPT-4, GPT-3.5, etc.)
 *   - openai_compatible  (Ollama, Groq, Together, Mistral, etc.)
 *
 * Auto-detects provider from model name if not specified.
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

/**
 * Detect provider from model name.
 */
function detectProvider(model = '') {
  const m = model.toLowerCase();
  if (m.startsWith('claude')) return 'anthropic';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai';
  return 'openai'; // default: assume OpenAI-compatible
}

/**
 * Build the upstream request for the target provider.
 * @param {Object} proxyBody - The pii-guard proxy request body (redacted messages already)
 * @param {string} provider
 * @returns {{ url: string, headers: Object, body: Object }}
 */
function buildUpstreamRequest(proxyBody, provider) {
  const { messages, model, max_tokens, system, ...rest } = proxyBody;

  if (provider === 'anthropic') {
    return {
      url: process.env.ANTHROPIC_BASE_URL || ANTHROPIC_API,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
        'content-type': 'application/json',
      },
      body: {
        model: model || 'claude-opus-4-5',
        max_tokens: max_tokens || 1024,
        ...(system ? { system } : {}),
        messages,
        ...rest,
      },
    };
  }

  // OpenAI / compatible
  const openaiMessages = [];
  if (system) openaiMessages.push({ role: 'system', content: system });
  openaiMessages.push(...messages);

  return {
    url: process.env.OPENAI_BASE_URL || OPENAI_API,
    headers: {
      'authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      'content-type': 'application/json',
    },
    body: {
      model: model || 'gpt-4o',
      max_tokens: max_tokens || 1024,
      messages: openaiMessages,
      ...rest,
    },
  };
}

/**
 * Extract text content from a provider response.
 * @param {Object} responseData
 * @param {string} provider
 * @returns {string[]} array of text segments
 */
function extractResponseText(responseData, provider) {
  if (provider === 'anthropic') {
    return (responseData.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text);
  }
  // OpenAI
  return (responseData.choices || [])
    .filter(c => c.message?.content)
    .map(c => c.message.content);
}

/**
 * Inject restored text back into a provider response object.
 * @param {Object} responseData
 * @param {string[]} restoredTexts
 * @param {string} provider
 * @returns {Object}
 */
function injectRestoredText(responseData, restoredTexts, provider) {
  const cloned = JSON.parse(JSON.stringify(responseData));
  if (provider === 'anthropic') {
    let i = 0;
    for (const block of cloned.content || []) {
      if (block.type === 'text') block.text = restoredTexts[i++] || block.text;
    }
  } else {
    let i = 0;
    for (const choice of cloned.choices || []) {
      if (choice.message?.content) choice.message.content = restoredTexts[i++] || choice.message.content;
    }
  }
  return cloned;
}

module.exports = {
  detectProvider,
  buildUpstreamRequest,
  extractResponseText,
  injectRestoredText,
};
