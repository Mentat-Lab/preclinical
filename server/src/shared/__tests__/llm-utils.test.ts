/**
 * Unit tests for LLM utilities — model routing and cached system messages.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../lib/config.js', () => ({
  config: {
    anthropicApiKey: 'test-anthropic-key',
    openaiApiKey: 'test-openai-key',
    openaiBaseUrl: 'https://api.openai.com/v1',
  },
}));

// Mock LangChain constructors — must use class syntax since source uses `new`
vi.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: class {
      _type = 'openai';
      model: string;
      constructor(opts: any) { this.model = opts.model; }
      withStructuredOutput() { return this; }
    },
  };
});

vi.mock('@langchain/anthropic', () => {
  return {
    ChatAnthropic: class {
      _type = 'anthropic';
      model: string;
      constructor(opts: any) { this.model = opts.model; }
      withStructuredOutput() { return this; }
    },
  };
});

vi.mock('@langchain/core/messages', () => {
  return {
    SystemMessage: class {
      _type = 'system';
      content: unknown;
      constructor(content: unknown) { this.content = content; }
    },
    HumanMessage: class {
      _type = 'human';
      content: unknown;
      constructor(content: unknown) { this.content = content; }
    },
  };
});

import { isAnthropicModel, createLLM, buildCachedSystemMessage } from '../llm-utils.js';

// ── isAnthropicModel ────────────────────────────────────────────────────────

describe('isAnthropicModel', () => {
  it('returns true for claude-* models', () => {
    expect(isAnthropicModel('claude-3-5-sonnet-20241022')).toBe(true);
    expect(isAnthropicModel('claude-3-haiku-20240307')).toBe(true);
    expect(isAnthropicModel('claude-opus-4-20250514')).toBe(true);
  });

  it('returns false for non-Claude models', () => {
    expect(isAnthropicModel('gpt-4o')).toBe(false);
    expect(isAnthropicModel('gpt-4o-mini')).toBe(false);
    expect(isAnthropicModel('gemini-pro')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAnthropicModel('')).toBe(false);
  });

  it('is case-sensitive (Claude with capital C does not match)', () => {
    expect(isAnthropicModel('Claude-3-sonnet')).toBe(false);
  });
});

// ── createLLM ───────────────────────────────────────────────────────────────

describe('createLLM', () => {
  it('routes claude-* models to ChatAnthropic', () => {
    const llm = createLLM({ model: 'claude-3-5-haiku-20241022', temperature: 0.7 }) as any;
    expect(llm._type).toBe('anthropic');
  });

  it('routes non-claude models to ChatOpenAI', () => {
    const llm = createLLM({ model: 'gpt-4o-mini', temperature: 0.2 }) as any;
    expect(llm._type).toBe('openai');
  });
});

// ── buildCachedSystemMessage ────────────────────────────────────────────────

describe('buildCachedSystemMessage', () => {
  it('adds cache_control for Anthropic models', () => {
    const msg = buildCachedSystemMessage('claude-3-5-sonnet-20241022', 'System prompt text') as any;
    // For Anthropic, constructor receives an object with content array
    const passedArg = msg.content;
    expect(passedArg).toHaveProperty('content');
    expect(passedArg.content[0]).toMatchObject({
      type: 'text',
      text: 'System prompt text',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('returns plain SystemMessage for non-Claude models', () => {
    const msg = buildCachedSystemMessage('gpt-4o', 'System prompt text') as any;
    expect(msg.content).toBe('System prompt text');
  });
});
