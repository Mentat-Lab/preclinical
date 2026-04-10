/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared helpers for voice transport layers (Daily, LiveKit, Pipecat).
 *
 * Extracts common patterns:
 *   - sendAndReceive: queue a response future, send a message, await the response
 *   - stderr buffering: capped buffer for subprocess stderr (debugging)
 *   - graceful process shutdown: send quit + timeout kill
 */

import { ChildProcess } from 'child_process';
import { MessageQueue } from '../lib/message-queue.js';

/**
 * Generic send-and-receive: queue a response future, call the send function,
 * then await the agent's response from the message queue.
 *
 * Works for any transport that uses MessageQueue for incoming messages.
 */
export async function sendAndReceiveVia(
  messageQueue: MessageQueue,
  sendFn: () => unknown | Promise<unknown>,
  timeoutMs: number = 30_000,
): Promise<string> {
  const responseFuture = messageQueue.nextMessage(timeoutMs);
  await sendFn();
  return await responseFuture;
}

/**
 * Creates a capped stderr buffer collector for a child process.
 * Returns a function that retrieves the current buffer contents.
 */
export function collectStderr(proc: ChildProcess, maxLen: number = 2000): () => string {
  let buf = '';
  proc.stderr?.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    if (buf.length > maxLen) buf = buf.slice(-Math.floor(maxLen / 2));
  });
  return () => buf;
}

/**
 * Gracefully shut down a child process: write a quit command, then
 * force-kill after a timeout if it hasn't exited.
 */
export function gracefulShutdown(
  proc: ChildProcess,
  quitPayload?: string,
  timeoutMs: number = 3000,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      proc.kill();
      resolve();
    }, timeoutMs);

    proc.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    if (quitPayload) {
      try {
        proc.stdin?.write(quitPayload);
      } catch {
        // stdin may already be closed
        clearTimeout(timer);
        proc.kill();
        resolve();
      }
    } else {
      proc.kill();
      clearTimeout(timer);
      resolve();
    }
  });
}
