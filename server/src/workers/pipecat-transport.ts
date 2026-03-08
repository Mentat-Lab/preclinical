/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pipecat Cloud transport layer for the scenario runner.
 *
 * Manages Pipecat session lifecycle with three modes:
 *   - cloud (default): Start a Pipecat Cloud session, auto-detect LiveKit/Daily transport
 *   - local: Create a Daily room, spawn the local text agent, connect tester via Daily
 *
 * For cloud mode:
 *   1. Start a Pipecat session (creates a room)
 *   2. Auto-detect transport from API response (LiveKit or Daily)
 *   3. Connect to the room via the detected transport
 *
 * For local mode:
 *   1. Create a Daily room via REST API
 *   2. Spawn the local pipecat text agent as a subprocess
 *   3. Connect the tester via Daily transport
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  connectLiveKit,
  disconnectLiveKit,
  type LiveKitSession,
} from './livekit-transport.js';
import {
  connectDaily,
  disconnectDaily,
  type DailySession,
} from './daily-transport.js';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'pipecat-transport' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// TYPES
// =============================================================================

export interface PipecatConfig {
  apiKey: string;
  agentName: string;
  baseUrl?: string;
  transport?: string; // 'livekit' | 'daily' | 'auto'
  mode?: string; // 'cloud' | 'local'
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  autoCleanup?: boolean;
  dailyApiKey?: string;
}

export interface PipecatSession {
  sessionId: string;
  transport: 'livekit' | 'daily';
  mode: 'cloud' | 'local';
  livekitSession?: LiveKitSession;
  dailySession?: DailySession;
  agentProcess?: ChildProcess;
  config: PipecatConfig;
  dataMessages: Array<{ type: string; data: any; timestamp: number }>;
}

const PIPECAT_CLOUD_API_URL = process.env.PIPECAT_CLOUD_API_URL || 'https://api.pipecat.daily.co';

// =============================================================================
// PIPECAT CLOUD API
// =============================================================================

interface PipecatStartResponse {
  sessionId: string;
  livekitUrl?: string;
  livekitToken?: string;
  livekitRoom?: string;
  dailyRoom?: string;
  dailyToken?: string;
  dailyRoomName?: string;
  roomName?: string;
  room_name?: string;
}

async function startPipecatSession(
  config: PipecatConfig,
  roomName: string,
  metadata: Record<string, unknown>,
): Promise<PipecatStartResponse> {
  const apiUrl = (config.baseUrl || PIPECAT_CLOUD_API_URL).replace(/\/$/, '');

  const resp = await fetch(`${apiUrl}/v1/public/${config.agentName}/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      createDailyRoom: true,
      transport: 'webrtc',
      body: metadata,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Pipecat Cloud session creation failed (${resp.status}): ${await resp.text()}`);
  }

  return await resp.json() as PipecatStartResponse;
}

async function endPipecatSession(apiKey: string, agentName: string, sessionId: string): Promise<void> {
  try {
    await fetch(`${PIPECAT_CLOUD_API_URL}/v1/public/${agentName}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.warn('Failed to end session', { sessionId, error: err });
  }
}

async function fetchDataMessages(
  apiKey: string,
  agentName: string,
  sessionId: string,
): Promise<Array<{ type: string; data: any; timestamp: number }>> {
  try {
    const resp = await fetch(
      `${PIPECAT_CLOUD_API_URL}/v1/public/${agentName}/sessions/${sessionId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data.data_messages || []).map((m: any) => ({
      type: m.type || '',
      data: m.data,
      timestamp: m.timestamp || Date.now(),
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// DAILY ROOM CREATION (for local mode)
// =============================================================================

async function createDailyRoom(dailyApiKey: string): Promise<{ url: string; name: string }> {
  const resp = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dailyApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        exp: Math.floor(Date.now() / 1000) + 600, // 10 min
        enable_chat: true,
      },
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to create Daily room (${resp.status}): ${await resp.text()}`);
  }

  const data = await resp.json() as any;
  return { url: data.url, name: data.name };
}

async function getDailyMeetingToken(
  dailyApiKey: string,
  roomName: string,
  userName: string,
): Promise<string> {
  const resp = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dailyApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        exp: Math.floor(Date.now() / 1000) + 600,
        user_name: userName,
      },
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to get Daily meeting token (${resp.status}): ${await resp.text()}`);
  }

  const data = await resp.json() as any;
  return data.token;
}

async function deleteDailyRoom(dailyApiKey: string, roomName: string): Promise<void> {
  try {
    await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${dailyApiKey}` },
    });
  } catch {
    // best-effort
  }
}

// =============================================================================
// LOCAL AGENT SUBPROCESS
// =============================================================================

function findTextAgentPython(): string {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  return path.join(projectRoot, 'target-agents', 'pipecat', 'text', '.venv', 'bin', 'python3');
}

function findTextAgentScript(): string {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  return path.join(projectRoot, 'target-agents', 'pipecat', 'text', 'bot.py');
}

function spawnLocalAgent(
  roomUrl: string,
  token: string,
): ChildProcess {
  const python = findTextAgentPython();
  const script = findTextAgentScript();

  const proc = spawn(python, [script, roomUrl, token], {
    env: { ...process.env, DAILY_ROOM_URL: roomUrl, DAILY_ROOM_TOKEN: token },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    stderrBuf += text;
    if (stderrBuf.length > 2000) stderrBuf = stderrBuf.slice(-1000);
    // Log agent output for debugging
    for (const line of text.split('\n').filter(Boolean)) {
      logger.debug('Agent:', { line });
    }
  });

  proc.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      logger.debug('Agent stdout:', { line });
    }
  });

  return proc;
}

// =============================================================================
// TRANSPORT DETECTION
// =============================================================================

function detectTransport(
  config: PipecatConfig,
  response: PipecatStartResponse,
): 'livekit' | 'daily' {
  if (config.transport === 'livekit') return 'livekit';
  if (config.transport === 'daily') return 'daily';

  if (response.livekitUrl || response.livekitToken) return 'livekit';
  if (response.dailyRoom || response.dailyToken) return 'daily';
  if (config.livekitUrl) return 'livekit';

  return 'daily';
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Connect to a Pipecat session. Supports cloud and local modes.
 */
export async function connectPipecat(
  agentConfig: Record<string, any>,
  scenarioRunId: string,
): Promise<PipecatSession> {
  const config: PipecatConfig = {
    apiKey: agentConfig.api_key || agentConfig.apiKey || '',
    agentName: agentConfig.agent_name || agentConfig.agentName || '',
    baseUrl: agentConfig.base_url || agentConfig.baseUrl,
    transport: (agentConfig.transport || 'auto').toLowerCase(),
    mode: (agentConfig.mode || 'cloud').toLowerCase() as 'cloud' | 'local',
    livekitUrl: agentConfig.livekit_url || agentConfig.livekitUrl,
    livekitApiKey: agentConfig.livekit_api_key || agentConfig.livekitApiKey,
    livekitApiSecret: agentConfig.livekit_api_secret || agentConfig.livekitApiSecret,
    autoCleanup: agentConfig.auto_cleanup !== false && agentConfig.autoCleanup !== false,
    dailyApiKey: agentConfig.daily_api_key || agentConfig.dailyApiKey || process.env.DAILY_API_KEY || '',
  };

  // === LOCAL MODE ===
  if (config.mode === 'local') {
    if (!config.dailyApiKey) {
      throw new Error('DAILY_API_KEY is required for local pipecat mode');
    }

    logger.info('Starting local pipecat session');

    // 1. Create a Daily room
    const room = await createDailyRoom(config.dailyApiKey);
    logger.info('Created Daily room', { url: room.url, name: room.name });

    // 2. Get tokens
    const agentToken = await getDailyMeetingToken(config.dailyApiKey, room.name, 'preclinical-pipecat-text-agent');
    const testerToken = await getDailyMeetingToken(config.dailyApiKey, room.name, 'preclinical-tester');

    // 3. Spawn the text agent
    const agentProcess = spawnLocalAgent(room.url, agentToken);
    logger.info('Spawned local text agent', { pid: agentProcess.pid });

    // 4. Wait for agent to start up
    await new Promise((r) => setTimeout(r, 5000));

    // 5. Connect tester to the room
    const dailySession = await connectDaily(room.url, testerToken);

    // 6. Wait for agent to be ready
    await new Promise((r) => setTimeout(r, 3000));

    return {
      sessionId: `local-${room.name}`,
      transport: 'daily',
      mode: 'local',
      dailySession,
      agentProcess,
      config: { ...config, agentName: room.name },
      dataMessages: [],
    };
  }

  // === CLOUD MODE ===
  if (!config.apiKey || !config.agentName) {
    throw new Error('Pipecat Cloud API key and agent name are required');
  }

  const response = await startPipecatSession(config, `preclinical-pipecat-${scenarioRunId}`, {
    source: 'preclinical-worker',
    scenario_run_id: scenarioRunId,
  });

  const transport = detectTransport(config, response);
  logger.info('Detected transport', { transport, sessionId: response.sessionId });

  if (transport === 'daily') {
    const roomUrl = response.dailyRoom || '';
    const token = response.dailyToken || '';
    if (!roomUrl) throw new Error('Pipecat session did not return a Daily room URL');

    const dailySession = await connectDaily(roomUrl, token);
    await new Promise((r) => setTimeout(r, 3000));

    return {
      sessionId: response.sessionId || '',
      transport: 'daily',
      mode: 'cloud',
      dailySession,
      config,
      dataMessages: [],
    };
  }

  // LiveKit transport
  const livekitUrl = config.livekitUrl || response.livekitUrl;
  if (!livekitUrl) throw new Error('No LiveKit URL available for Pipecat session');

  const livekitConfig: Record<string, any> = {
    url: livekitUrl,
    auth_mode: 'token',
    room_prefix: 'preclinical-pipecat',
    room_name: response.roomName || response.room_name || response.livekitRoom || `preclinical-pipecat-${scenarioRunId}`,
    token: response.livekitToken || response.dailyToken,
    auto_cleanup: config.autoCleanup,
  };

  if (config.livekitApiKey && config.livekitApiSecret) {
    livekitConfig.api_key = config.livekitApiKey;
    livekitConfig.api_secret = config.livekitApiSecret;
    livekitConfig.auth_mode = 'api';
  }

  if (livekitConfig.auth_mode === 'token' && !livekitConfig.token && !livekitConfig.token_url) {
    throw new Error('Pipecat session did not return a LiveKit token.');
  }

  const livekitSession = await connectLiveKit(livekitConfig, scenarioRunId);

  return {
    sessionId: response.sessionId || '',
    transport: 'livekit',
    mode: 'cloud',
    livekitSession,
    config,
    dataMessages: [],
  };
}

/**
 * Send a text message and wait for the agent's response (delegates to LiveKit).
 */
export { sendAndReceive } from './livekit-transport.js';

/**
 * Disconnect from Pipecat session and clean up all resources.
 */
export async function disconnectPipecat(session: PipecatSession): Promise<void> {
  // Fetch data messages (cloud mode only)
  if (session.mode === 'cloud' && session.sessionId) {
    const msgs = await fetchDataMessages(
      session.config.apiKey,
      session.config.agentName,
      session.sessionId,
    );
    session.dataMessages.push(...msgs);
    if (session.dataMessages.length > 0) {
      logger.info('Captured data messages', { count: session.dataMessages.length });
    }
  }

  // Disconnect transport
  if (session.transport === 'daily' && session.dailySession) {
    await disconnectDaily(session.dailySession);
  } else if (session.livekitSession) {
    await disconnectLiveKit(session.livekitSession);
  }

  // Kill local agent process
  if (session.agentProcess) {
    try {
      session.agentProcess.kill();
      logger.info('Stopped local agent process');
    } catch {
      // already dead
    }
  }

  // End Pipecat Cloud session
  if (session.mode === 'cloud' && session.sessionId) {
    await endPipecatSession(session.config.apiKey, session.config.agentName, session.sessionId);
  }

  // Clean up Daily room (local mode)
  if (session.mode === 'local' && session.config.dailyApiKey && session.config.agentName) {
    await deleteDailyRoom(session.config.dailyApiKey, session.config.agentName);
  }
}
