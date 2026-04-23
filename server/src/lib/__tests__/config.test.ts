/**
 * Unit tests for server config defaults.
 *
 * These tests verify the default values when env vars are NOT set.
 * Since config.ts reads process.env at import time, we test the
 * parsed values against known defaults.
 */

import { describe, it, expect } from 'vitest';
import { config } from '../config.js';

describe('config defaults', () => {
  it('DEFAULT_MAX_TURNS defaults to 11', () => {
    // If env var not overridden, should be 11
    expect(config.defaultMaxTurns).toBe(parseInt(process.env.DEFAULT_MAX_TURNS || '11', 10));
  });

  it('MIN_MAX_TURNS defaults to 5', () => {
    expect(config.minMaxTurns).toBe(parseInt(process.env.MIN_MAX_TURNS || '5', 10));
  });

  it('MAX_MAX_TURNS defaults to 15', () => {
    expect(config.maxMaxTurns).toBe(parseInt(process.env.MAX_MAX_TURNS || '15', 10));
  });

  it('GRADING_TIMEOUT_MS defaults to 120000', () => {
    expect(config.gradingTimeoutMs).toBe(parseInt(process.env.GRADING_TIMEOUT_MS || '120000', 10));
  });

  it('testerModel defaults to gpt-4o-mini', () => {
    expect(config.testerModel).toBe(process.env.TESTER_MODEL || 'gpt-4o-mini');
  });

  it('graderModel defaults to gpt-4o-mini', () => {
    expect(config.graderModel).toBe(process.env.GRADER_MODEL || 'gpt-4o-mini');
  });

  it('port defaults to 8000', () => {
    expect(config.port).toBe(parseInt(process.env.PORT || '8000', 10));
  });

  it('workerConcurrency defaults to 10', () => {
    expect(config.workerConcurrency).toBe(parseInt(process.env.WORKER_CONCURRENCY || '10', 10));
  });

  it('turn limits maintain min < default < max invariant', () => {
    expect(config.minMaxTurns).toBeLessThanOrEqual(config.defaultMaxTurns);
    expect(config.defaultMaxTurns).toBeLessThanOrEqual(config.maxMaxTurns);
  });
});
