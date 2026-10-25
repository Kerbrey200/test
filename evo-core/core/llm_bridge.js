/**
 * EVO-CORE MULTI-PROVIDER LLM BRIDGE
 * - openai:    any OpenAI-compatible chat-completions endpoint (OpenAI, DeepSeek, OpenRouter,
 *              Ollama, LM Studio, vLLM, ...) via native fetch
 * - anthropic: Claude through the official @anthropic-ai/sdk (loaded only when selected)
 * - gemini:    Google Gemini generateContent REST API via native fetch
 * - mock:      deterministic offline generator for tests and demos
 */

import { Gatekeeper } from './gatekeeper.js';

export const SUPPORTED_PROVIDERS = Object.freeze(['mock', 'openai', 'anthropic', 'gemini']);

const DEFAULT_MODELS = { openai: 'gpt-4o-mini', anthropic: 'claude-opus-5-5' };
const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta'
};
// Whole-file rewrites with adaptive thinking can take minutes on Claude.
const DEFAULT_TIMEOUTS = { openai: 120000, gemini: 120000, anthropic: 600000, mock: 1000 };
// Claude models that accept the server-side refusal fallback in its "default" form.
const ANTHROPIC_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
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
   * @param {'mock'|'openai'|'anthropic'|'gemini'} [options.provider] Defaults to EVO_PROVIDER or 'mock'
   * @param {string} [options.apiKey] EVO_API_KEY; optional for local OpenAI-compatible servers, and for
   *        anthropic the SDK's own credential lookup (ANTHROPIC_API_KEY, `ant auth login`) applies
   * @param {string} [options.baseUrl] EVO_BASE_URL
   * @param {string} [options.model] EVO_MODEL (required for gemini)
   * @param {string} [options.effort] Claude output_config.effort (EVO_EFFORT, default 'high'; 'none' omits it)
   * @param {boolean} [options.fallbacks] Claude server-side refusal fallback (EVO_ANTHROPIC_FALLBACKS=0 disables)
   * @param {number} [options.timeoutMs] Per attempt
   * @param {number} [options.maxRetries=2] Retries for 408/409/429/5xx and network errors
   */
  constructor(options = {}) {
    const env = options.env || process.env;
    this.provider = String(options.provider || env.EVO_PROVIDER || 'mock').toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(this.provider)) {
      throw new LLMError(`LLM provider "${this.provider}" is not supported. Use one of: ${SUPPORTED_PROVIDERS.join(', ')}.`);
    }
    this.apiKey = options.apiKey ?? env.EVO_API_KEY ?? '';
    this.baseUrl = options.baseUrl || env.EVO_BASE_URL || DEFAULT_BASE_URLS[this.provider] || null;
    this.model = options.model || env.EVO_MODEL || DEFAULT_MODELS[this.provider] || null;
    this.effort = options.effort || env.EVO_EFFORT || 'high';
    this.fallbacks = options.fallbacks ?? env.EVO_ANTHROPIC_FALLBACKS !== '0';
    this.maxTokens = options.maxTokens || 64000;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUTS[this.provider];
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseMs = options.retryBaseMs ?? 500;
    this._anthropic = null;

    if (this.provider === 'gemini' && !this.model) {
      throw new LLMError('Gemini needs an explicit model: set EVO_MODEL (or the model option).');
    }
  }

  /**
   * Short human-readable description (no secrets) for logs and the UI.
   */
  describe() {
    return this.provider === 'mock' ? 'mock (offline)' : `${this.provider}:${this.model}`;
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
      '3. Output ONLY the complete revised file inside a single fenced code block.',
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
      previousErrors.length > 0 ? `PREVIOUS ATTEMPTS FAILED - AVOID THESE ERRORS:\n${previousErrors.join('\n---\n')}` : '',
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
   * Sends one system + user prompt to the configured provider and returns the reply text.
   * Prompts are masked first so credentials found in source files never leave the machine.
   */
  async callApi(systemPrompt, userPrompt) {
    const system = Gatekeeper.maskSecrets(systemPrompt);
    const user = Gatekeeper.maskSecrets(userPrompt);
    if (this.provider === 'anthropic') return this.callAnthropic(system, user);
    if (this.provider === 'gemini') return this.callGemini(system, user);
    if (this.provider === 'openai') return this.callOpenAI(system, user);
    throw new LLMError(`Provider "${this.provider}" has no API to call.`);
  }

  async callOpenAI(system, user) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const data = await this.postJson(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, headers, {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2
    });

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMError('LLM API response has no choices[0].message.content.');
    }
    return content;
  }

  async callGemini(system, user) {
    if (!this.apiKey) throw new LLMError('Gemini needs an API key: set EVO_API_KEY.');
    const url = `${this.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(this.model)}:generateContent`;
    const data = await this.postJson(url, { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2 }
    });

    if (data.promptFeedback?.blockReason) {
      throw new LLMError(`Gemini blocked the prompt (${data.promptFeedback.blockReason}).`);
    }
    const candidate = data.candidates?.[0];
    if (!candidate) throw new LLMError('Gemini response has no candidates.');
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new LLMError('Gemini response hit the output token limit; the candidate would be truncated.');
    }
    if (candidate.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
      throw new LLMError(`Gemini stopped with finishReason ${candidate.finishReason}.`);
    }
    const text = (candidate.content?.parts || []).map(p => p.text || '').join('');
    if (!text.trim()) throw new LLMError('Gemini returned no text.');
    return text;
  }

  /**
   * Claude via the official SDK: streaming (long whole-file outputs), adaptive thinking with an
   * explicit effort, and the server-side refusal fallback on models that support it. The SDK
   * handles retries (408/409/429/5xx) and sends the current API version.
   */
  async callAnthropic(system, user) {
    let Anthropic;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch {
      throw new LLMError('The anthropic provider needs the official SDK: run "npm install" in the evo-core directory.');
    }

    if (!this._anthropic) {
      this._anthropic = new Anthropic({
        ...(this.apiKey ? { apiKey: this.apiKey } : {}),
        ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
        timeout: this.timeoutMs,
        maxRetries: this.maxRetries
      });
    }

    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    };
    if (this.effort !== 'none') params.output_config = { effort: this.effort };
    if (this.fallbacks && ANTHROPIC_FALLBACK_MODELS.has(this.model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }

    let message;
    try {
      message = await this._anthropic.beta.messages.stream(params).finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new LLMError(`Anthropic API error${err.status ? ` ${err.status}` : ''}: ${Gatekeeper.maskSecrets(err.message)}`, {
          status: err.status ?? null
        });
      }
      throw err;
    }

    // Check why generation stopped before reading content.
    if (message.stop_reason === 'refusal') {
      const category = message.stop_details?.category ? ` (category: ${message.stop_details.category})` : '';
      throw new LLMError(`Claude declined the request${category}.`);
    }
    if (message.stop_reason === 'max_tokens') {
      throw new LLMError('Claude hit max_tokens before finishing; the candidate would be truncated.');
    }

    const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
    if (!text.trim()) throw new LLMError('Claude returned no text.');
    return text;
  }

  /**
   * POSTs JSON with a per-attempt timeout; retries transient failures with exponential
   * backoff, honouring Retry-After.
   */
  async postJson(url, headers, payload) {
    const body = JSON.stringify(payload);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.requestOnce(url, headers, body);
      } catch (err) {
        if (!err.retryable || attempt >= this.maxRetries) throw err;
        await sleep(err.retryAfterMs ?? this.retryBaseMs * 2 ** attempt);
      }
    }
  }

  async requestOnce(url, headers, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
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

    return response.json();
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
