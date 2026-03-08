/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LiveKit transport layer for the scenario runner.
 *
 * Provides WebRTC-based text messaging through LiveKit rooms.
 * Used by both the `livekit` and `pipecat` (LiveKit transport) providers.
 */

import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { Room, RoomEvent, RemoteParticipant, TextStreamReader } from '@livekit/rtc-node';
import { randomBytes } from 'crypto';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'livekit-transport' });

// =============================================================================
// TYPES
// =============================================================================

export interface LiveKitConfig {
  url: string;
  apiKey?: string;
  apiSecret?: string;
  agentName?: string;
  dispatchMode?: string; // 'auto' | 'explicit'
  authMode?: string; // 'api' | 'token'
  roomPrefix?: string;
  tokenUrl?: string;
  tokenHeaders?: string;
  tokenBody?: string;
  tokenField?: string;
  token?: string;
  roomName?: string;
  autoCleanup?: boolean;
}

export interface LiveKitMetrics {
  connectionTimeMs: number;
  agentJoinTimeMs?: number;
  dispatchRetryCount?: number;
  roomDurationMs?: number;
  turnCount: number;
}

export interface LiveKitSession {
  room: Room;
  roomName: string;
  identity: string;
  messageQueue: MessageQueue;
  metrics: LiveKitMetrics;
  config: LiveKitConfig;
  httpUrl: string;
  wsUrl: string;
}

// =============================================================================
// MESSAGE QUEUE
// =============================================================================

class MessageQueue {
  private waiters: Array<{
    resolve: (msg: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private buffer: string[] = [];

  push(message: string): void {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      this.buffer.push(message);
    }
  }

  async nextMessage(timeoutMs: number = 30_000): Promise<string> {
    if (this.buffer.length > 0) {
      return this.buffer.shift()!;
    }
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`Timed out waiting for agent response after ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }
}

// =============================================================================
// TOKEN GENERATION
// =============================================================================

async function generateToken(
  config: LiveKitConfig,
  roomName: string,
  identity: string,
): Promise<string> {
  const authMode = (config.authMode || 'api').toLowerCase();

  if (authMode === 'api') {
    if (!config.apiKey || !config.apiSecret) {
      throw new Error('LiveKit API Key and Secret required for api auth mode');
    }
    const token = new AccessToken(config.apiKey, config.apiSecret, { identity });
    token.addGrant({ roomJoin: true, room: roomName });
    return await token.toJwt();
  }

  if (authMode === 'token') {
    if (config.token) {
      return config.token;
    }
    if (!config.tokenUrl) {
      throw new Error('Token URL required for token auth mode');
    }
    const extraHeaders: Record<string, string> = config.tokenHeaders
      ? JSON.parse(config.tokenHeaders)
      : {};
    const extraBody: Record<string, unknown> = config.tokenBody
      ? JSON.parse(config.tokenBody)
      : {};

    const resp = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ room: roomName, identity, ...extraBody }),
    });

    if (!resp.ok) {
      throw new Error(`Token endpoint error (${resp.status}): ${await resp.text()}`);
    }

    const tokenField = config.tokenField || 'token';
    try {
      const data = await resp.json() as any;
      const token = data[tokenField] || data.token || data.access_token || '';
      if (!token) throw new Error(`Token field '${tokenField}' missing in token response`);
      return token;
    } catch {
      const token = (await resp.text()).trim();
      if (!token) throw new Error('Token endpoint returned an empty token');
      return token;
    }
  }

  throw new Error(`Unsupported auth mode: ${authMode}`);
}

// =============================================================================
// AGENT DISPATCH
// =============================================================================

async function dispatchAgent(
  httpUrl: string,
  apiKey: string,
  apiSecret: string,
  roomName: string,
  agentName: string,
  metadata: Record<string, unknown>,
  maxRetries: number = 2,
): Promise<number> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
      await client.createDispatch(roomName, agentName, { metadata: JSON.stringify(metadata) });
      logger.info('Dispatched agent', { agentName, roomName, attempt: attempt + 1 });
      return attempt;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        logger.warn('Dispatch attempt failed', { attempt: attempt + 1, error: lastError.message });
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw new Error(
    `Failed to dispatch agent ${agentName} to room ${roomName} after ${maxRetries + 1} attempts: ${lastError?.message}`,
  );
}

// =============================================================================
// WAIT FOR AGENT
// =============================================================================

function waitForAgent(room: Room, identity: string, timeoutMs: number = 15_000): Promise<number> {
  const start = Date.now();

  // Check existing participants
  for (const p of room.remoteParticipants.values()) {
    if (p.identity && p.identity !== identity) {
      return Promise.resolve(Date.now() - start);
    }
  }

  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      room.off(RoomEvent.ParticipantConnected, handler);
      reject(new Error('Timed out waiting for agent to join'));
    }, timeoutMs);

    function handler(participant: RemoteParticipant) {
      if (participant.identity && participant.identity !== identity) {
        clearTimeout(timer);
        room.off(RoomEvent.ParticipantConnected, handler);
        resolve(Date.now() - start);
      }
    }

    room.on(RoomEvent.ParticipantConnected, handler);
  });
}

// =============================================================================
// TEXT STREAM SETUP
// =============================================================================

function setupTextStreams(room: Room, identity: string, messageQueue: MessageQueue): void {
  const handleStream = async (reader: TextStreamReader, participantInfo: { identity: string }) => {
    if (participantInfo.identity === identity) return;
    const chunks: string[] = [];
    for await (const chunk of reader) {
      if (chunk) chunks.push(chunk);
    }
    const text = chunks.join('');
    if (text) messageQueue.push(text);
  };

  room.registerTextStreamHandler('lk.chat', (reader, participantInfo) => {
    handleStream(reader, participantInfo).catch((err: unknown) =>
      logger.warn('Chat stream error', err),
    );
  });

  room.registerTextStreamHandler('lk.transcription', (reader, participantInfo) => {
    handleStream(reader, participantInfo).catch((err: unknown) =>
      logger.warn('Transcription stream error', err),
    );
  });
}

// =============================================================================
// ROOM CLEANUP
// =============================================================================

async function cleanupRoom(
  httpUrl: string | undefined,
  apiKey: string | undefined,
  apiSecret: string | undefined,
  roomName: string,
  autoCleanup: boolean,
): Promise<void> {
  if (!autoCleanup || !httpUrl || !apiKey || !apiSecret) return;

  try {
    const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    const participants = await roomService.listParticipants(roomName);
    for (const p of participants) {
      if (p.identity) {
        await roomService.removeParticipant(roomName, p.identity);
      }
    }
    await roomService.deleteRoom(roomName);
    logger.info('Cleaned up room', { roomName });
  } catch (err) {
    logger.warn('Cleanup failed', { roomName, error: err });
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Connect to a LiveKit room and return a session for messaging.
 */
export async function connectLiveKit(
  agentConfig: Record<string, any>,
  scenarioRunId: string,
): Promise<LiveKitSession> {
  const config: LiveKitConfig = {
    url: agentConfig.url || '',
    apiKey: agentConfig.api_key || agentConfig.apiKey,
    apiSecret: agentConfig.api_secret || agentConfig.apiSecret,
    agentName: agentConfig.agent_name || agentConfig.agentName || '',
    dispatchMode: agentConfig.dispatch_mode || agentConfig.dispatchMode || 'auto',
    authMode: agentConfig.auth_mode || agentConfig.authMode || 'api',
    roomPrefix: (agentConfig.room_prefix || agentConfig.roomPrefix || 'preclinical-test').replace(/ /g, '-'),
    tokenUrl: agentConfig.token_url || agentConfig.tokenUrl,
    tokenHeaders: agentConfig.token_headers || agentConfig.tokenHeaders,
    tokenBody: agentConfig.token_body || agentConfig.tokenBody,
    tokenField: agentConfig.token_field || agentConfig.tokenField || 'token',
    token: agentConfig.token || agentConfig.jwt || agentConfig.livekit_token || agentConfig.livekitToken,
    roomName: agentConfig.room_name || agentConfig.roomName,
    autoCleanup: agentConfig.auto_cleanup !== false && agentConfig.autoCleanup !== false,
  };

  if (!config.url) throw new Error('LiveKit Server URL is required');

  const wsUrl = config.url.replace('http://', 'ws://').replace('https://', 'wss://');
  const httpUrl = config.url.replace('ws://', 'http://').replace('wss://', 'https://');
  const roomName = config.roomName || `${config.roomPrefix}-${scenarioRunId}`;
  const identity = `tester-${randomBytes(4).toString('hex')}`;

  const metrics: LiveKitMetrics = { connectionTimeMs: 0, turnCount: 0 };
  const room = new Room();
  const messageQueue = new MessageQueue();

  // Dispatch agent before connecting (explicit mode)
  if (config.dispatchMode === 'explicit') {
    if (!config.agentName || !config.apiKey || !config.apiSecret) {
      throw new Error('Agent name, API key, and secret required for explicit dispatch mode');
    }
    const dispatchStart = Date.now();
    const retries = await dispatchAgent(
      httpUrl, config.apiKey, config.apiSecret, roomName, config.agentName,
      { source: 'preclinical-worker', scenario_run_id: scenarioRunId },
    );
    metrics.agentJoinTimeMs = Date.now() - dispatchStart;
    metrics.dispatchRetryCount = retries;
  }

  // Generate token and connect
  const jwt = await generateToken(config, roomName, identity);
  const connectStart = Date.now();
  await room.connect(wsUrl, jwt);
  metrics.connectionTimeMs = Date.now() - connectStart;

  // Wait for agent to join
  const agentJoinMs = await waitForAgent(room, identity, 15_000);
  if (!metrics.agentJoinTimeMs) metrics.agentJoinTimeMs = agentJoinMs;

  // Set up text stream handlers
  setupTextStreams(room, identity, messageQueue);

  return { room, roomName, identity, messageQueue, metrics, config, httpUrl, wsUrl };
}

/**
 * Send a text message to the LiveKit room and wait for the agent's response.
 */
export async function sendAndReceive(
  session: LiveKitSession,
  message: string,
  timeoutMs: number = 30_000,
): Promise<string> {
  const responseFuture = session.messageQueue.nextMessage(timeoutMs);
  const lp = session.room.localParticipant;
  if (!lp) throw new Error('Not connected to LiveKit room');
  await lp.sendText(message, { topic: 'lk.chat' });
  return await responseFuture;
}

/**
 * Disconnect from the LiveKit room and clean up resources.
 */
export async function disconnectLiveKit(session: LiveKitSession): Promise<void> {
  try {
    await session.room.disconnect();
    logger.info('Disconnected from room', { roomName: session.roomName });
  } catch (err) {
    logger.warn('Disconnect error', err);
  }

  await cleanupRoom(
    session.httpUrl,
    session.config.apiKey,
    session.config.apiSecret,
    session.roomName,
    session.config.autoCleanup !== false,
  );
}
