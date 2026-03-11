/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenAI-compatible chat API provider.
 *
 * Works with any API that implements the OpenAI chat completions format:
 * OpenAI, Azure OpenAI, Anthropic (via proxy), local models (Ollama, vLLM), etc.
 */

import { registerProvider, type Provider, type ProviderSession, type MessageContext } from './base.js';
import { config } from '../lib/config.js';

interface OpenAIState {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
}

const openaiProvider: Provider = {
  name: 'openai',

  async connect(agentConfig): Promise<ProviderSession> {
    const apiKey = String(agentConfig.api_key || agentConfig.apiKey || config.openaiApiKey || '');
    if (!apiKey) throw new Error('Agent missing api_key in config and no OPENAI_API_KEY env var set');

    return {
      provider: 'openai',
      state: {
        apiKey,
        baseUrl: String(agentConfig.base_url || agentConfig.baseUrl || config.openaiBaseUrl || 'https://api.openai.com/v1'),
        model: String(agentConfig.target_model || agentConfig.model || 'gpt-4o'),
        systemPrompt: String(agentConfig.system_prompt || agentConfig.systemPrompt || ''),
      } satisfies OpenAIState,
    };
  },

  async sendMessage(session, message, context): Promise<string> {
    const { apiKey, baseUrl, model, systemPrompt } = session.state as OpenAIState;

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    for (const entry of context.transcript) {
      messages.push({
        role: entry.role === 'attacker' ? 'user' : 'assistant',
        content: entry.content,
      });
    }
    messages.push({ role: 'user', content: message });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024 }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI target call failed (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  },

  async disconnect(): Promise<void> {
    // Stateless — nothing to clean up
  },
};

registerProvider(openaiProvider);
