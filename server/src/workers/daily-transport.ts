/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Daily transport layer for the scenario runner.
 *
 * Provides text messaging through Daily rooms using app_message.
 * Spawns a lightweight Python subprocess using the daily-python SDK
 * (no headless Node.js Daily SDK exists).
 *
 * Protocol between Node ↔ Python subprocess (JSON lines on stdin/stdout):
 *   → {"cmd":"send","text":"..."} — send app_message to room
 *   ← {"event":"message","text":"..."} — received app_message from agent
 *   ← {"event":"ready"} — joined room, ready for messages
 *   ← {"event":"agent_joined"} — agent participant detected
 *   ← {"event":"error","message":"..."} — error
 *   → {"cmd":"quit"} — leave room and exit
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../lib/logger.js';

const logger = log.child({ component: 'daily-transport' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// TYPES
// =============================================================================

export interface DailySession {
  process: ChildProcess;
  readline: Interface;
  messageQueue: DailyMessageQueue;
  roomUrl: string;
  connected: boolean;
}

// =============================================================================
// MESSAGE QUEUE (same pattern as livekit-transport)
// =============================================================================

class DailyMessageQueue {
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
// PYTHON BRIDGE SCRIPT (embedded)
// =============================================================================

const PYTHON_BRIDGE = `
"""Daily room bridge — stdin/stdout JSON-lines protocol.

Supports two message modes:
  - Plain text:  {"text": "...", "sender": "..."}        (local text agent)
  - RTVI protocol: {"label": "rtvi-ai", "type": "bot-output", "data": {...}}  (Pipecat Cloud voice agent)
"""
import asyncio, json, os, sys
from daily import Daily, CallClient, EventHandler

TESTER_NAME = "preclinical-tester"

def extract_text(message):
    """Extract plain text from a Daily app_message payload.

    Handles:
      - RTVI bot-output: {"label":"rtvi-ai","type":"bot-output","data":{"text":"...","spoken":false,"aggregated_by":"sentence"}}
      - Plain dict:      {"text": "..."}
      - Plain string
    Returns None if the message should be ignored (e.g. word-by-word TTS fragments).
    """
    if isinstance(message, dict):
        # RTVI protocol (Pipecat Cloud)
        if message.get("label") == "rtvi-ai":
            msg_type = message.get("type", "")
            data = message.get("data", {})
            if msg_type == "bot-output" and isinstance(data, dict):
                text = data.get("text", "")
                spoken = data.get("spoken", True)
                aggregated_by = data.get("aggregated_by", "")
                # Only emit the complete sentence (spoken=False + sentence aggregation)
                if text and not spoken and aggregated_by == "sentence":
                    return text
                # Fallback: emit any non-empty bot-output if it looks like a full message
                if text and aggregated_by == "sentence":
                    return text
            # Ignore other RTVI types (metrics, tts-text fragments, tts-started/stopped)
            return None
        # Plain text dict (local text agent)
        return message.get("text") or message.get("message") or None
    if isinstance(message, str):
        try:
            parsed = json.loads(message)
            return extract_text(parsed)
        except (json.JSONDecodeError, AttributeError):
            return message if message.strip() else None
    return str(message) if message else None

class BridgeHandler(EventHandler):
    def __init__(self, loop):
        super().__init__()
        self.loop = loop
        self._pre_ready_buffer = []
        self._ready = False

    def set_ready(self):
        self._ready = True
        for text in self._pre_ready_buffer:
            self.loop.call_soon_threadsafe(lambda t=text: emit({"event": "message", "text": t}))
        self._pre_ready_buffer.clear()

    def on_participant_joined(self, participant):
        info = participant.get("info", {})
        name = info.get("userName", "")
        if name != TESTER_NAME and name != "local":
            self.loop.call_soon_threadsafe(lambda: emit({"event": "agent_joined", "name": name}))

    def on_participant_left(self, participant, reason):
        pass

    def on_app_message(self, message, sender):
        sender_name = sender if isinstance(sender, str) else str(sender)
        if sender_name == TESTER_NAME or sender_name == "local":
            return
        text = extract_text(message)
        if text is None:
            return
        if self._ready:
            self.loop.call_soon_threadsafe(lambda t=text: emit({"event": "message", "text": t}))
        else:
            # Buffer messages that arrive before the tester has joined (e.g. agent greeting)
            self._pre_ready_buffer.append(text)

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\\n")
    sys.stdout.flush()

async def main():
    room_url = os.environ["DAILY_ROOM_URL"]
    token = os.environ.get("DAILY_ROOM_TOKEN", "")

    Daily.init()
    loop = asyncio.get_running_loop()
    handler = BridgeHandler(loop)
    client = CallClient(event_handler=handler)
    client.set_user_name(TESTER_NAME)
    client.update_subscription_profiles({"base": {"camera": "unsubscribed", "microphone": "unsubscribed"}})

    join_done = asyncio.Event()
    join_err = None
    def on_join(result, error):
        nonlocal join_err
        join_err = error
        loop.call_soon_threadsafe(join_done.set)

    client.join(room_url, token or None, client_settings={"inputs": {"camera": False, "microphone": False}}, completion=on_join)
    await asyncio.wait_for(join_done.wait(), timeout=15)
    if join_err:
        emit({"event": "error", "message": str(join_err)})
        sys.exit(1)

    # Signal ready — also flushes any buffered pre-ready messages
    handler.set_ready()
    emit({"event": "ready"})

    # Read commands from stdin
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            line = await asyncio.wait_for(reader.readline(), timeout=120)
            if not line:
                break
            cmd = json.loads(line.decode().strip())
            if cmd.get("cmd") == "send":
                # Send as plain text (for local text agents)
                client.send_app_message({"text": cmd["text"], "sender": TESTER_NAME})
            elif cmd.get("cmd") == "quit":
                break
        except asyncio.TimeoutError:
            break
        except Exception as e:
            emit({"event": "error", "message": str(e)})

    client.leave()
    emit({"event": "disconnected"})

asyncio.run(main())
`;

// =============================================================================
// FIND PYTHON WITH daily-python
// =============================================================================

function findPythonPaths(): string[] {
  // Check common locations for daily-python venv
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  return [
    path.join(projectRoot, 'target-agents', 'pipecat', 'text', '.venv', 'bin', 'python3'),
    path.join(projectRoot, 'target-agents', 'pipecat', '.venv', 'bin', 'python3'),
    'python3',
    'python',
  ];
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Connect to a Daily room and return a session for messaging.
 */
export async function connectDaily(
  roomUrl: string,
  token?: string,
): Promise<DailySession> {
  const messageQueue = new DailyMessageQueue();
  const pythonPaths = findPythonPaths();

  let proc: ChildProcess | null = null;
  let lastError = '';

  for (const pythonPath of pythonPaths) {
    try {
      proc = spawn(pythonPath, ['-c', PYTHON_BRIDGE], {
        env: {
          ...process.env,
          DAILY_ROOM_URL: roomUrl,
          DAILY_ROOM_TOKEN: token || '',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Check it didn't immediately fail
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 500);
        proc!.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        proc!.on('exit', (code) => {
          if (code !== null && code !== 0) {
            clearTimeout(timeout);
            reject(new Error(`Python exited with code ${code}`));
          }
        });
      });
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      proc = null;
      continue;
    }
  }

  if (!proc) {
    throw new Error(
      `Failed to start Daily bridge Python process. Install daily-python in a venv ` +
      `(target-agents/pipecat/text/.venv). Last error: ${lastError}`,
    );
  }

  const rl = createInterface({ input: proc.stdout! });

  // Collect stderr for debugging
  let stderrBuf = '';
  proc.stderr?.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    if (stderrBuf.length > 2000) stderrBuf = stderrBuf.slice(-1000);
  });

  // Wait for "ready" event
  const session: DailySession = {
    process: proc,
    readline: rl,
    messageQueue,
    roomUrl,
    connected: false,
  };

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Daily bridge did not become ready within 20s. stderr: ${stderrBuf.slice(-500)}`));
    }, 20_000);

    rl.on('line', function onLine(line) {
      try {
        const evt = JSON.parse(line);
        if (evt.event === 'ready') {
          clearTimeout(timeout);
          session.connected = true;
          resolve();
        } else if (evt.event === 'error') {
          clearTimeout(timeout);
          reject(new Error(`Daily bridge error: ${evt.message}`));
        }
      } catch {
        // ignore non-JSON lines
      }
    });

    proc!.on('exit', (code) => {
      clearTimeout(timeout);
      if (!session.connected) {
        reject(new Error(`Daily bridge exited (code ${code}) before ready. stderr: ${stderrBuf.slice(-500)}`));
      }
    });
  });

  // Now route all subsequent messages to the queue
  rl.on('line', (line) => {
    try {
      const evt = JSON.parse(line);
      if (evt.event === 'message' && evt.text) {
        messageQueue.push(evt.text);
      } else if (evt.event === 'agent_joined') {
        logger.info('Agent joined Daily room', { name: evt.name });
      } else if (evt.event === 'error') {
        logger.warn('Daily bridge error', { message: evt.message });
      }
    } catch {
      // ignore
    }
  });

  logger.info('Connected to Daily room', { roomUrl });
  return session;
}

/**
 * Send a text message and wait for the agent's response.
 */
export async function sendAndReceiveDaily(
  session: DailySession,
  message: string,
  timeoutMs: number = 30_000,
): Promise<string> {
  const responseFuture = session.messageQueue.nextMessage(timeoutMs);
  session.process.stdin!.write(JSON.stringify({ cmd: 'send', text: message }) + '\n');
  return await responseFuture;
}

/**
 * Disconnect from the Daily room.
 */
export async function disconnectDaily(session: DailySession): Promise<void> {
  try {
    if (session.connected) {
      session.process.stdin!.write(JSON.stringify({ cmd: 'quit' }) + '\n');
      // Give it a moment to leave cleanly
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          session.process.kill();
          resolve();
        }, 3000);
        session.process.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  } catch (err) {
    logger.warn('Daily disconnect error', err);
  }
  session.connected = false;
  session.readline.close();
  logger.info('Disconnected from Daily room', { roomUrl: session.roomUrl });
}
