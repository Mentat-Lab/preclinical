import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { Room } from '@livekit/rtc-node';

const rootEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: rootEnvPath });

function functionNotEmpty(value, name) {
  if (!value || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
}

const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) {
  console.error('Usage: node smoke_chat.js "<prompt>"');
  process.exit(1);
}

const livekitUrl = process.env.LIVEKIT_URL;
const livekitApiKey = process.env.LIVEKIT_API_KEY;
const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
functionNotEmpty(livekitUrl, 'LIVEKIT_URL');
functionNotEmpty(livekitApiKey, 'LIVEKIT_API_KEY');
functionNotEmpty(livekitApiSecret, 'LIVEKIT_API_SECRET');

const dispatchMode = (process.env.LIVEKIT_DISPATCH_MODE || 'auto').toLowerCase();
const agentName = process.env.LIVEKIT_AGENT_NAME || '';
const roomPrefix = process.env.LIVEKIT_ROOM_PREFIX || 'preclinical-test';

if (dispatchMode === 'explicit' && !agentName.trim()) {
  throw new Error('LIVEKIT_AGENT_NAME is required for explicit dispatch.');
}

const wsUrl = livekitUrl.replace(/^http/, 'ws');
const httpUrl = livekitUrl.replace(/^ws/, 'http');
const roomName = `${roomPrefix}-${Date.now()}`;
const identity = `tester-${Math.random().toString(36).slice(2, 8)}`;

async function dispatchAgentIfNeeded() {
  if (dispatchMode !== 'explicit') return;
  const dispatchClient = new AgentDispatchClient(httpUrl, livekitApiKey, livekitApiSecret);
  await dispatchClient.createDispatch(roomName, agentName, {
    metadata: JSON.stringify({ source: 'preclinical-smoke-test' }),
  });
}

async function connectAndChat() {
  await dispatchAgentIfNeeded();

  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity,
  });
  token.addGrant({ roomJoin: true, room: roomName });
  const jwt = await token.toJwt();

  const room = new Room();

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for agent response.'));
    }, 20000);

    const handleText = async (reader, participantInfo) => {
      if (participantInfo?.identity === identity) return;
      const message = await reader.readAll();
      if (!message) return;
      clearTimeout(timeout);
      resolve({ message, participant: participantInfo?.identity || 'agent' });
    };

    room.registerTextStreamHandler('lk.chat', handleText);
    room.registerTextStreamHandler('lk.transcription', handleText);
  });

  await room.connect(wsUrl, jwt);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for agent to join.'));
    }, 15000);

    const handleParticipant = (participant) => {
      if (participant?.identity && participant.identity !== identity) {
        clearTimeout(timeout);
        room.off('participantConnected', handleParticipant);
        resolve();
      }
    };

    room.on('participantConnected', handleParticipant);
    for (const participant of room.remoteParticipants.values()) {
      handleParticipant(participant);
    }
  });

  await room.localParticipant.sendText(prompt, { topic: 'lk.chat' });

  const response = await responsePromise;
  await room.disconnect();
  return response;
}

const result = await connectAndChat();
console.log('Room:', roomName);
console.log('Agent response from', result.participant, ':', result.message);
