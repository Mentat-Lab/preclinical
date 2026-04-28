import { describe, expect, it, vi } from 'vitest';

const { waitMock, createTaskMock } = vi.hoisted(() => ({
  waitMock: vi.fn(),
  createTaskMock: vi.fn(),
}));

vi.mock('browser-use-sdk', () => ({
  BrowserUse: class {
    tasks = {
      create: createTaskMock,
      wait: waitMock,
    };
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  log: {
    child: () => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

describe('BrowserUse API helpers', () => {
  it('fails structured extraction instead of returning raw output', async () => {
    createTaskMock.mockResolvedValueOnce({ id: 'task_123' });
    waitMock.mockResolvedValueOnce({
      status: 'finished',
      output: '403 Forbidden',
    });

    const { runTask } = await import('../api.js');

    await expect(runTask('test-key', {
      task: 'send message',
      sessionId: 'session_123',
    })).rejects.toThrow(/structured extraction failed/i);
  });
});
