/**
 * EVO-CORE LLM BRIDGE
 * Zero-Fat native HTTP client for OpenAI-compatible chat-completions APIs
 * (OpenAI, DeepSeek, OpenRouter, Ollama, LM Studio, vLLM, ...) plus a deterministic
 * offline mock mode. Other provider protocols are rejected explicitly instead of being
 * sent in the wrong format.
 */

import { Gatekeeper } from './gatekeeper.js';

export const SUPPORTED_PROVIDERS = Object.freeze(['mock', 'openai']);
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export class LLMError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses a Retry-After header (seconds or HTTP date) into milliseconds.
 */
function retryAfterMs(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export class LLMBridge {
  /**
   * @param {object} [options]
   * @param {'mock'|'openai'} [options.provider] Defaults to EVO_PROVIDER or 'mock'
   * @param {string} [options.apiKey] Optional for local servers such as Ollama
   * @param {string} [options.baseUrl] OpenAI-compatible base URL (…/v1)
   * @param {string} [options.model]
   * @param {number} [options.timeoutMs=30000] Per attempt
   * @param {number} [options.maxRetries=2] Retries for 408/409/429/5xx and network errors
   */
  constructor(options = {}) {
    this.provider = String(options.provider || process.env.EVO_PROVIDER || 'mock').toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(this.provider)) {
      throw new LLMError(
        `LLM provider "${this.provider}" is not supported. Use "openai" with any OpenAI-compatible endpoint (EVO_BASE_URL) or "mock".`
      );
    }
    this.apiKey = options.apiKey ?? process.env.EVO_API_KEY ?? '';
    this.baseUrl = options.baseUrl || process.env.EVO_BASE_URL || 'https://api.openai.com/v1';
    this.model = options.model || process.env.EVO_MODEL || 'gpt-4o-mini';
    this.timeoutMs = options.timeoutMs || 30000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseMs = options.retryBaseMs ?? 500;
  }

  /**
   * Generates a code patch or hypothesis given task context and active skills.
   */
  async generateCandidate({
    taskTitle,
    targetFileContent,
    activeSkills = [],
    priorExperiences = [],
    previousErrors = [],
    instruction = 'Optimize or fix the code to pass all test requirements.'
  }) {
    if (this.provider === 'mock') {
      // Offline / Deterministic Mock Mode
      return this.generateMockCandidate(targetFileContent, instruction);
    }

    const systemPrompt = [
      'You are EvoCore Autonomous Mutation Engine.',
      'Your goal is to propose an exact, minimal, flawless code modification.',
      'RULES:',
      '1. Follow all active skills and learned invariants strictly.',
      '2. Do not delete assertions or tests.',
      '3. Output ONLY the complete revised code inside a single fenced code block.',
      '',
      'ACTIVE SKILLS:',
      ...activeSkills.map(s => `--- Skill: ${s.name} (v${s.version}) ---\n${s.body}`),
      '',
      'PRIOR RELEVANT EXPERIENCES:',
      ...priorExperiences.map(e => `[${e.domain}] Signature: ${e.signature} -> Fix: ${e.winning_fix}`)
    ].join('\n');

    const userPrompt = [
      `TASK: ${taskTitle}`,
      `INSTRUCTION: ${instruction}`,
      previousErrors.length > 0 ? `PREVIOUS ERRORS TO AVOID:\n${previousErrors.join('\n')}` : '',
      'CURRENT TARGET CODE:',
      '```',
      targetFileContent,
      '```'
    ].filter(Boolean).join('\n\n');

    const rawResponse = await this.callApi(systemPrompt, userPrompt);
    return this.extractCode(rawResponse, targetFileContent);
  }

  /**
   * Deterministic local fallback generator when offline.
   */
  generateMockCandidate(currentCode, instruction) {
    if (instruction.includes('return 100')) {
      return currentCode.replace(/return\s+[0-9]+;/, 'return 100;');
    }
    if (instruction.includes('ArraySetAsSeries')) {
      return currentCode.replace(/OnInit\(\)\s*\{/, 'OnInit() {\n  ArraySetAsSeries(rates, true);');
    }
    return currentCode + '\n// evocore-optimized-revision\n';
  }

  /**
   * One chat-completions request with timeout; retries transient failures with
   * exponential backoff, honouring Retry-After.
   */
  async callApi(systemPrompt, userPrompt) {
    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: Gatekeeper.maskSecrets(systemPrompt) },
        { role: 'user', content: Gatekeeper.maskSecrets(userPrompt) }
      ],
      temperature: 0.2
    });

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.requestOnce(endpoint, headers, body);
      } catch (err) {
        if (!err.retryable || attempt >= this.maxRetries) throw err;
        await sleep(err.retryAfterMs ?? this.retryBaseMs * 2 ** attempt);
      }
    }
  }

  async requestOnce(endpoint, headers, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers, body, signal: controller.signal });
    } catch (err) {
      const reason = err.name === 'AbortError' ? `timed out after ${this.timeoutMs} ms` : err.message;
      throw new LLMError(`LLM request failed: ${reason}`, { retryable: true });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = Gatekeeper.maskSecrets((await response.text()).slice(0, 2000));
      const error = new LLMError(`LLM API returned status ${response.status}: ${errorText}`, {
        status: response.status,
        retryable: RETRYABLE_STATUS.has(response.status)
      });
      error.retryAfterMs = retryAfterMs(response.headers.get('retry-after'));
      throw error;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('LLM API response has no choices[0].message.content.');
    }
    return content;
  }

  /**
   * Extracts clean code from markdown code fences if present.
   */
  extractCode(response, fallbackCode) {
    if (!response || typeof response !== 'string') return fallbackCode;

    const fenceMatch = response.match(/```(?:[a-zA-Z0-9_\-+.]+)?[ \t]*\r?\n([\s\S]*?)\r?\n```/);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    return response.trim();
  }
}
