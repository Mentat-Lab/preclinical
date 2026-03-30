/**
 * Simple async message queue with timeout support.
 * Used by transport layers (LiveKit, Daily) to buffer incoming messages.
 */
export class MessageQueue {
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
