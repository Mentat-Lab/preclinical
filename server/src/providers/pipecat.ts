/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pipecat Cloud provider.
 *
 * Starts a Pipecat Cloud session and auto-detects transport:
 *   - LiveKit: uses @livekit/rtc-node (native, in-process)
 *   - Daily: spawns a Python subprocess with daily-python SDK
 *
 * Uses lazy imports to avoid loading native binaries at startup.
 */

import { registerProvider, type Provider, type ProviderSession } from './base.js';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'pipecat' });

async function getPipecatTransport() {
  return await import('../workers/pipecat-transport.js');
}

async function getLiveKitTransport() {
  return await import('../workers/livekit-transport.js');
}

async function getDailyTransport() {
  return await import('../workers/daily-transport.js');
}

const pipecatProvider: Provider = {
  name: 'pipecat',

  async connect(agentConfig, scenarioRunId): Promise<ProviderSession> {
    const { connectPipecat } = await getPipecatTransport();
    const session = await connectPipecat(agentConfig as Record<string, any>, scenarioRunId);
    logger.info('Connected', { sessionId: session.sessionId, transport: session.transport });
    return { provider: 'pipecat', state: session };
  },

  async sendMessage(session, message): Promise<string> {
    const pcSession = session.state as any;

    if (pcSession.transport === 'daily') {
      const { sendAndReceiveDaily } = await getDailyTransport();
      return await sendAndReceiveDaily(pcSession.dailySession, message, 30_000);
    }

    const { sendAndReceive } = await getLiveKitTransport();
    return await sendAndReceive(pcSession.livekitSession, message, 30_000);
  },

  async disconnect(session): Promise<void> {
    const { disconnectPipecat } = await getPipecatTransport();
    await disconnectPipecat(session.state as any);
  },
};

registerProvider(pipecatProvider);
