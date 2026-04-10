/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ElevenLabs Conversational AI provider.
 *
 * Uses the ElevenLabs Conversational AI WebSocket API for text-based testing
 * of voice agents. Connects via signed URL, exchanges messages in text mode.
 */

import { registerProvider, type Provider, type ProviderSession } from '../base.js';
import { log } from '../../lib/logger.js';

const logger = log.child({ component: 'elevenlabs' });

const DEFAULT_API_BASE = 'https://api.elevenlabs.io';
const RESPONSE_TIMEOUT_MS = 60_000;

interface ElevenLabsState {
  apiKey: string;
  apiBase: string;
  agentId: string;
  ws: WebSocket | null;
  conversationId?: string;
}

/**
 * Get a signed WebSocket URL for the conversation.
 */
async function getSignedUrl(apiBase: string, agentId: string, apiKey: string): Promise<string> {
  const url = `${apiBase}/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs signed URL request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { signed_url: string };
  return data.signed_url;
}

/**
 * Connect to the ElevenLabs WebSocket and initialize a text conversation.
 */
function connectWebSocket(signedUrl: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(signedUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('ElevenLabs WebSocket connection timed out'));
    }, 15_000);

    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.addEventListener('error', (evt: Event) => {
      clearTimeout(timeout);
      reject(new Error(`ElevenLabs WebSocket error: ${(evt as any).message || 'connection failed'}`));
    });
  });
}

/**
 * Send a text message and wait for the agent's complete text response.
 *
 * ElevenLabs ConvAI WebSocket protocol (text mode):
 * - Send: { "type": "user_message", "text": "..." }
 * - Receive: { "type": "agent_response", "text": "..." } (streamed chunks)
 * - Receive: { "type": "agent_response_done" } signals end of response
 */
function sendAndReceive(ws: WebSocket, message: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let responseText = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        if (responseText.trim()) {
          resolve(responseText.trim());
        } else {
          reject(new Error('ElevenLabs response timed out'));
        }
      }
    }, timeoutMs);

    const onMessage = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(String(evt.data)) as Record<string, any>;

        switch (msg.type) {
          case 'agent_response':
            if (typeof msg.text === 'string') {
              responseText += msg.text;
            }
            break;

          case 'agent_response_done':
          case 'agent_response_end':
            if (!resolved) {
              resolved = true;
              cleanup();
              resolve(responseText.trim());
            }
            break;

          case 'conversation_initiation_metadata':
            if (msg.conversation_id) {
              logger.debug('Conversation ID', { conversationId: msg.conversation_id });
            }
            break;

          case 'error':
            if (!resolved) {
              resolved = true;
              cleanup();
              reject(new Error(`ElevenLabs agent error: ${msg.message || JSON.stringify(msg)}`));
            }
            break;

          default:
            break;
        }
      } catch {
        // Non-JSON message, ignore
      }
    };

    const onError = (evt: Event) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`ElevenLabs WebSocket error: ${(evt as any).message || 'unknown'}`));
      }
    };

    const onClose = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        if (responseText.trim()) {
          resolve(responseText.trim());
        } else {
          reject(new Error('ElevenLabs WebSocket closed before response'));
        }
      }
    };

    function cleanup() {
      clearTimeout(timeout);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
    }

    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);

    // Send the user message
    ws.send(JSON.stringify({ type: 'user_message', text: message }));
  });
}

const elevenlabsProvider: Provider = {
  name: 'elevenlabs',

  async connect(agentConfig): Promise<ProviderSession> {
    const apiKey = String(agentConfig.api_key || agentConfig.apiKey || '');
    const agentId = String(agentConfig.agent_id || agentConfig.agentId || '');
    const apiBase = String(agentConfig.api_base || agentConfig.base_url || DEFAULT_API_BASE).replace(/\/+$/, '');

    if (!apiKey) throw new Error('Agent missing api_key in config');
    if (!agentId) throw new Error('Agent missing agent_id in config');

    logger.info('Connecting to ElevenLabs ConvAI', { agentId });

    const signedUrl = await getSignedUrl(apiBase, agentId, apiKey);
    const ws = await connectWebSocket(signedUrl);

    logger.info('Connected to ElevenLabs ConvAI', { agentId });

    return {
      provider: 'elevenlabs',
      state: { apiKey, apiBase, agentId, ws } satisfies ElevenLabsState,
    };
  },

  async sendMessage(session, message): Promise<string> {
    const state = session.state as ElevenLabsState;
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      throw new Error('ElevenLabs WebSocket is not connected');
    }

    logger.debug('Sending message', { agentId: state.agentId, length: message.length });
    const response = await sendAndReceive(state.ws, message, RESPONSE_TIMEOUT_MS);
    logger.debug('Received response', { agentId: state.agentId, length: response.length });

    return response;
  },

  async disconnect(session): Promise<void> {
    const state = session.state as ElevenLabsState;
    if (state.ws) {
      try {
        state.ws.close();
      } catch {
        // Ignore close errors
      }
      state.ws = null;
      logger.info('Disconnected from ElevenLabs ConvAI', { agentId: state.agentId });
    }
  },
};

registerProvider(elevenlabsProvider);
