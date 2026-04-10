/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LiveKit WebRTC provider.
 *
 * Connects to a LiveKit room, exchanges messages via text streams (lk.chat).
 * Supports both API key auth and custom token endpoints.
 *
 * Uses lazy imports to avoid loading the native @livekit/rtc-node binary
 * at startup — it's only loaded when a LiveKit agent is actually tested.
 */

import { registerProvider, type Provider, type ProviderSession } from '../base.js';
import { log } from '../../lib/logger.js';

const logger = log.child({ component: 'livekit' });

async function getLiveKitTransport() {
  return await import('../../workers/livekit-transport.js');
}

const livekitProvider: Provider = {
  name: 'livekit',

  async connect(agentConfig, scenarioRunId): Promise<ProviderSession> {
    const { connectLiveKit } = await getLiveKitTransport();
    const session = await connectLiveKit(agentConfig as Record<string, any>, scenarioRunId);
    logger.info('Connected', { room: session.roomName });
    return { provider: 'livekit', state: session };
  },

  async sendMessage(session, message): Promise<string> {
    const { sendAndReceive } = await getLiveKitTransport();
    return await sendAndReceive(session.state as any, message, 30_000);
  },

  async disconnect(session): Promise<void> {
    const { disconnectLiveKit } = await getLiveKitTransport();
    await disconnectLiveKit(session.state as any);
  },
};

registerProvider(livekitProvider);
