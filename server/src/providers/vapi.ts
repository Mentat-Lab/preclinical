/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Vapi voice AI provider.
 *
 * Uses Vapi's chat API for text-based testing of voice agents.
 */

import { registerProvider, type Provider, type ProviderSession, type MessageContext } from './base.js';

interface VapiState {
  apiKey: string;
  assistantId: string;
  apiBase: string;
  chatId?: string;
}

const vapiProvider: Provider = {
  name: 'vapi',

  async connect(agentConfig): Promise<ProviderSession> {
    const apiKey = String(agentConfig.api_key || agentConfig.apiKey || '');
    const assistantId = String(
      agentConfig.provider_id || agentConfig.providerId || agentConfig.assistant_id || '',
    );
    const apiBase = String(agentConfig.api_base || agentConfig.base_url || 'https://api.vapi.ai').replace(/\/+$/, '');

    if (!apiKey) throw new Error('Agent missing api_key in config');
    if (!assistantId) throw new Error('Agent missing provider_id/assistant_id in config');

    return {
      provider: 'vapi',
      state: { apiKey, assistantId, apiBase } satisfies VapiState,
    };
  },

  async sendMessage(session, message): Promise<string> {
    const state = session.state as VapiState;

    const body: Record<string, unknown> = {
      assistantId: state.assistantId,
      input: message,
    };
    if (state.chatId) body.chatId = state.chatId;

    const response = await fetch(`${state.apiBase}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vapi target call failed (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any as Record<string, unknown>;
    const output = data.output;
    const messageField = data.message;

    const resolvedText =
      (typeof output === 'string' ? output : undefined) ||
      (typeof output === 'object' && output !== null && typeof (output as any).text === 'string'
        ? (output as any).text as string
        : undefined) ||
      (typeof messageField === 'string' ? messageField : undefined) ||
      (typeof messageField === 'object' && messageField !== null && typeof (messageField as any).content === 'string'
        ? (messageField as any).content as string
        : undefined) ||
      (typeof data.text === 'string' ? data.text : '');

    // Track chatId for conversation continuity
    state.chatId =
      (typeof data.chatId === 'string' ? data.chatId : undefined) ||
      (typeof data.conversationId === 'string' ? data.conversationId : undefined) ||
      (typeof data.id === 'string' ? data.id : undefined) ||
      state.chatId;

    return resolvedText;
  },

  async disconnect(): Promise<void> {
    // Stateless — nothing to clean up
  },
};

registerProvider(vapiProvider);
