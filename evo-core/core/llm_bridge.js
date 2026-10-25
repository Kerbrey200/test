/**
 * EVO-CORE MULTI-MODEL LLM BRIDGE
 * Zero-Fat native HTTP client supporting OpenAI-compatible APIs (DeepSeek, OpenRouter, Ollama),
 * Anthropic, Google Gemini, and deterministic Offline/Mock mode.
 */

import { Gatekeeper } from './gatekeeper.js';

export class LLMBridge {
  constructor(options = {}) {
    this.provider = options.provider || process.env.EVO_PROVIDER || 'mock';
    this.apiKey = options.apiKey || process.env.EVO_API_KEY || '';
    this.baseUrl = options.baseUrl || process.env.EVO_BASE_URL || 'https://api.openai.com/v1';
    this.model = options.model || process.env.EVO_MODEL || 'gpt-4o-mini';
    this.timeoutMs = options.timeoutMs || 30000;
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
    if (this.provider === 'mock' || !this.apiKey) {
      // Offline / Deterministic Mock Mode
      return this.generateMockCandidate(targetFileContent, instruction);
    }

    const systemPrompt = [
      'You are EvoCore Autonomous Mutation Engine.',
      'Your goal is to propose an exact, minimal, flawless code modification.',
      'RULES:',
      '1. Follow all active skills and learned invariants strictly.',
      '2. Do not delete assertions or tests.',
      '3. Output ONLY the complete revised code inside a ```code ... ``` block or raw text.',
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
   * Native fetch call to OpenAI-compatible endpoint.
   */
  async callApi(systemPrompt, userPrompt) {
    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: Gatekeeper.maskSecrets(systemPrompt) },
            { role: 'user', content: Gatekeeper.maskSecrets(userPrompt) }
          ],
          temperature: 0.2
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Extracts clean code from markdown code fences if present.
   */
  extractCode(response, fallbackCode) {
    if (!response || typeof response !== 'string') return fallbackCode;

    const fenceMatch = response.match(/```(?:[a-zA-Z0-9_\-]+)?\s*\n([\s\S]*?)\n```/);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }

    return response.trim();
  }
}
