import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useActiveAgent } from '@/lib/active-agent-context';
import { useScenarioRun, useScenarioRuns, useTestRun } from '@/hooks/use-queries';
import { useRealtimeRun } from '@/lib/sse';
import { cn } from '@/lib/utils';
import { createTestRun } from '@/lib/api';
import type { CriteriaResult, ScenarioRunResult, StepTiming, TranscriptEntry } from '@/lib/types';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  RotateCw,
} from 'lucide-react';

function parseJsonField<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

type DisplayStatus = 'pass' | 'fail' | 'pending' | 'running' | 'grading' | 'error' | 'canceled';

function getDisplayStatus(result: ScenarioRunResult): DisplayStatus {
  if (result.status === 'passed' || result.passed === true) return 'pass';
  if (result.status === 'failed' || result.passed === false) return 'fail';
  if (result.status === 'running') return 'running';
  if (result.status === 'grading') return 'grading';
  if (result.status === 'error') return 'error';
  if (result.status === 'canceled') return 'canceled';
  return 'pending';
}

function statusClasses(status: DisplayStatus): string {
  const map: Record<DisplayStatus, string> = {
    pass: 'text-pass',
    fail: 'text-fail',
    pending: 'text-text-secondary',
    running: 'text-accent',
    grading: 'text-accent',
    error: 'text-amber-500',
    canceled: 'text-text-secondary',
  };
  return map[status];
}

const ERROR_LABELS: Record<string, string> = {
  RATE_LIMIT: 'Rate Limited',
  SERVER_ERROR: 'Server Error',
  BROWSER_AUTH: 'Browser Login Failed',
  BROWSER_TIMEOUT: 'Browser Timeout',
  BROWSER_BLOCKED: 'Site Blocked Access',
  BROWSER_SESSION: 'Browser Session Dead',
  BROWSER_EXTRACTION: 'Could Not Extract Response',
  PROVIDER_AUTH: 'API Auth Failed',
  PROVIDER_NOT_FOUND: 'Endpoint Not Found',
  INVALID_INPUT: 'Invalid Input',
  UNKNOWN: 'Unknown Error',
};

function statusLabel(status: DisplayStatus, errorCode?: string): string {
  if (status === 'error' && errorCode) {
    return ERROR_LABELS[errorCode] || `Error: ${errorCode}`;
  }
  const map: Record<DisplayStatus, string> = {
    pass: 'Pass',
    fail: 'Fail',
    pending: 'Pending',
    running: 'Running',
    grading: 'Grading',
    error: 'Infrastructure Error',
    canceled: 'Canceled',
  };
  return map[status];
}

type NormalizedDecision = 'MET' | 'PARTIALLY MET' | 'NOT MET';

interface NormalizedEvaluation {
  id: string;
  criterion: string;
  rationale: string;
  decision: NormalizedDecision;
  passed: boolean;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

function normalizeDecision(result: CriteriaResult): NormalizedDecision {
  const decision = result.decision?.toUpperCase();
  if (decision === 'MET' || decision === 'PARTIALLY MET' || decision === 'NOT MET') {
    return decision;
  }
  return result.passed ? 'MET' : 'NOT MET';
}

function normalizeSeverity(result: CriteriaResult): 'HIGH' | 'MEDIUM' | 'LOW' {
  const points = Math.abs(result.points_awarded ?? 0);
  if (points >= 7) return 'HIGH';
  if (points >= 4) return 'MEDIUM';
  return 'LOW';
}

function normalizeCriteria(criteria: CriteriaResult[]): NormalizedEvaluation[] {
  return criteria
    .map((item, index) => {
      const decision = normalizeDecision(item);
      const passed = decision === 'MET' || decision === 'PARTIALLY MET';
      return {
        id: item.id || `${index}`,
        criterion: item.criterion || item.name || `Criterion ${index + 1}`,
        rationale: item.rationale || item.explanation || '',
        decision,
        passed,
        severity: normalizeSeverity(item),
      };
    })
    .sort((a, b) => Number(a.passed) - Number(b.passed));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function isPhaseStep(step: string): boolean {
  return ['provider_connect', 'tester_graph', 'grader_graph', 'browser_turn_total'].includes(step);
}

function stepLabel(timing: StepTiming): string {
  const labels: Record<string, string> = {
    provider_connect: 'Provider Connect',
    tester_graph: 'Tester Graph (total)',
    grader_graph: 'Grader Graph (total)',
    browser_turn_total: 'Browser Turn (total)',
    browser_session_create: 'Browser Session Create',
    browser_task_create: 'Browser Task Create',
    browser_task_wait: 'Browser Task Wait',
    prepareFirstMessage: 'Prepare First Message',
    executeTurn: `Execute Turn ${timing.turn ?? ''}`,
    generateNextMessage: `Generate Next Message (turn ${timing.turn ?? ''})`,
    coverageReview: 'Coverage Review',
    finalize: 'Finalize',
    gradeTranscript: 'Grade Transcript',
    verifyEvidence: 'Verify Evidence',
    consistencyAudit: 'Consistency Audit',
    computeScore: 'Compute Score',
    extractTriage: 'Extract Triage',
    handleGradingFailure: 'Handle Grading Failure',
  };
  return labels[timing.step] || timing.step;
}

function MessageBubble({ entry }: { entry: TranscriptEntry }) {
  const isTester = entry.role === 'attacker';
  const isSystem = entry.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-semibold text-amber-600 mb-1">Infrastructure Error</p>
          <p className="text-sm text-amber-700 whitespace-pre-wrap">{entry.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex', isTester ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[80%] rounded-xl border px-4 py-3',
          isTester ? 'bg-muted border-border' : 'bg-accent/5 border-accent/20'
        )}
      >
        <p className="text-xs font-medium text-text-secondary mb-1">{isTester ? 'Tester' : 'Target agent'}</p>
        <p className="text-sm text-text-primary whitespace-pre-wrap">{entry.content}</p>
      </div>
    </div>
  );
}

export default function ScenarioRunPage() {
  const [gradingOpen, setGradingOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [userToggledGrading, setUserToggledGrading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { id: testRunId, scenarioRunId } = useParams<{ id: string; scenarioRunId: string }>();
  const resolvedTestRunId = testRunId || '';
  const resolvedScenarioRunId = scenarioRunId || '';

  const { data: result, isLoading, error } = useScenarioRun(resolvedScenarioRunId);
  const { data: scenarioRunsData } = useScenarioRuns({ testRunId: resolvedTestRunId });
  const { data: testRunData } = useTestRun(resolvedTestRunId);
  const { setActiveAgentId } = useActiveAgent();

  useRealtimeRun(testRunId, scenarioRunId);

  const isLive = result?.status === 'running' || result?.status === 'grading';

  // Auto-expand transcript while running, grading when done
  useEffect(() => {
    if (isLive) {
      setTranscriptOpen(true);
      if (!userToggledGrading) setGradingOpen(false);
    } else if (result && !userToggledGrading) {
      setGradingOpen(true);
    }
  }, [isLive, result, userToggledGrading]);

  // Auto-scroll transcript to bottom on new messages
  useEffect(() => {
    if (isLive && transcriptOpen) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  useEffect(() => {
    const agentId = testRunData?.run?.agent_id;
    if (agentId) setActiveAgentId(agentId);
    return () => setActiveAgentId(null);
  }, [testRunData?.run?.agent_id, setActiveAgentId]);

  const scenarioRuns = scenarioRunsData?.results ?? [];
  const navigation = (() => {
    const ids = scenarioRuns.map((run) => run.id);
    const currentIndex = ids.findIndex((id) => id === resolvedScenarioRunId);
    if (currentIndex === -1) {
      return { prevId: null as string | null, nextId: null as string | null, currentIndex: 0, totalCount: ids.length };
    }
    return {
      prevId: currentIndex > 0 ? ids[currentIndex - 1] : null,
      nextId: currentIndex < ids.length - 1 ? ids[currentIndex + 1] : null,
      currentIndex,
      totalCount: ids.length,
    };
  })();

  if (isLoading) {
    return (
      <div className="flex-1 min-h-screen bg-background px-6 py-8">
        <div className="h-6 w-40 rounded bg-border animate-pulse mb-6" />
        <div className="h-10 w-96 rounded bg-border animate-pulse mb-6" />
        <div className="h-64 w-full rounded bg-border animate-pulse" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex-1 min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-text-secondary">{error?.message ?? 'Scenario run not found'}</p>
        <Link to={`/test/${resolvedTestRunId}`} className="text-sm text-accent hover:underline">
          Back to test run
        </Link>
      </div>
    );
  }

  const displayStatus = getDisplayStatus(result);
  const scenarioName = result.scenario_name || 'Scenario';
  const transcript = parseJsonField<TranscriptEntry>(result.transcript);
  const criteria = normalizeCriteria(parseJsonField<CriteriaResult>(result.criteria_results));

  const jsonPayload = {
    transcript: transcript.map((entry) => ({
      role: entry.role === 'attacker' ? 'user' : 'assistant',
      content: entry.content,
    })),
    grading_results: {
      status: displayStatus,
      passed: result.passed,
      summary: result.grade_summary || '',
      criteria_results: criteria,
    },
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(jsonPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-run-${result.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const canRerun = !isLive && result.scenario_id && testRunData?.run?.agent_id;
  const handleRerun = async () => {
    if (!testRunData?.run) return;
    setRerunning(true);
    try {
      const run = testRunData.run;
      const res = await createTestRun({
        agent_id: run.agent_id,
        scenario_ids: [result.scenario_id],
        max_turns: run.max_turns || undefined,
        creative_mode: run.creative_mode || undefined,
        grading_mode: run.grading_mode || undefined,
      });
      navigate(`/test/${res.id}`);
    } catch {
      setRerunning(false);
    }
  };

  const testRunLabel = testRunData?.run?.test_run_id || resolvedTestRunId;

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="px-6 py-7">
        <div className="text-sm text-text-secondary flex items-center gap-2 mb-4">
          <Link to={`/test/${resolvedTestRunId}`} className="inline-flex items-center gap-1 hover:text-text-primary">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="opacity-60">/</span>
          <span className="truncate">{testRunLabel}</span>
          <span className="opacity-60">/</span>
          <span className="truncate">{scenarioName}</span>
        </div>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary mb-2">{scenarioName}</h1>
            <p className={cn('text-sm font-medium', statusClasses(displayStatus))}>
              {statusLabel(displayStatus, result.error_code)}
            </p>
            {isLive && (() => {
              const maxTurns = testRunData?.run?.max_turns || 11;
              const currentTurn = transcript.length > 0
                ? Math.max(...transcript.filter(e => e.role !== 'system').map(e => e.turn || 0))
                : 0;
              return (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    <span className="text-sm text-text-secondary">
                      {result.status === 'grading'
                        ? 'Grading transcript...'
                        : `Turn ${currentTurn} of ${maxTurns}`}
                    </span>
                  </div>
                  <div className="flex-1 max-w-[200px] h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (currentTurn / maxTurns) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-3">
            {canRerun && (
              <button
                type="button"
                onClick={handleRerun}
                disabled={rerunning}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-muted disabled:opacity-50"
              >
                <RotateCw className={cn('h-3.5 w-3.5', rerunning && 'animate-spin')} />
                {rerunning ? 'Starting...' : 'Rerun'}
              </button>
            )}
            <span className="text-sm text-text-secondary">
              {navigation.currentIndex + 1} of {navigation.totalCount || 1}
            </span>
            <div className="flex items-center gap-1">
              {navigation.prevId ? (
                <Link to={`/test/${resolvedTestRunId}/scenario/${navigation.prevId}`} className="inline-flex">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
                    aria-label="Previous scenario"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </Link>
              ) : (
                <button
                  type="button"
                  className="h-8 w-8 rounded-md border border-border text-text-secondary/50 flex items-center justify-center"
                  disabled
                  aria-label="Previous scenario"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {navigation.nextId ? (
                <Link to={`/test/${resolvedTestRunId}/scenario/${navigation.nextId}`} className="inline-flex">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
                    aria-label="Next scenario"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </Link>
              ) : (
                <button
                  type="button"
                  className="h-8 w-8 rounded-md border border-border text-text-secondary/50 flex items-center justify-center"
                  disabled
                  aria-label="Next scenario"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {typeof result.metadata?.browser_live_url === 'string' && result.metadata.browser_live_url && (
          <div className="border border-border rounded-lg mb-6 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">Browser Session</span>
              {(result.status === 'running' || result.status === 'grading') && (
                <span className="inline-flex items-center gap-1 text-xs text-accent">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Active
                </span>
              )}
            </div>
            <a
              href={String(result.metadata.browser_live_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline truncate max-w-[50%]"
            >
              {String(result.metadata.browser_live_url)}
            </a>
          </div>
        )}

        <div className="border border-border rounded-lg mb-6">
          <button
            type="button"
            onClick={() => { setUserToggledGrading(true); setGradingOpen((prev) => !prev); }}
            className="w-full px-4 py-3 flex items-center justify-between"
          >
            <span className="text-sm font-semibold text-text-primary">Grading results</span>
            {gradingOpen ? <ChevronDown className="h-4 w-4 text-text-secondary" /> : <ChevronRight className="h-4 w-4 text-text-secondary" />}
          </button>

          {gradingOpen && (
            <div className="px-4 pb-4 space-y-4">
              <div className="border border-border rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-text-secondary">Result</span>
                <span className={cn('text-sm font-semibold', statusClasses(displayStatus))}>
                  {statusLabel(displayStatus, result.error_code)}
                </span>
              </div>

              {/* Intent-based grading: show triage match instead of criteria table */}
              {result.triage_result && result.gold_standard ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-border rounded-lg p-3">
                      <p className="text-xs text-text-secondary mb-1">Reference category</p>
                      <p className="text-sm font-medium text-text-primary">{result.gold_standard}</p>
                    </div>
                    <div className="border border-border rounded-lg p-3">
                      <p className="text-xs text-text-secondary mb-1">Predicted category</p>
                      <p className="text-sm font-medium text-text-primary">{result.triage_result}</p>
                    </div>
                    <div className="border border-border rounded-lg p-3">
                      <p className="text-xs text-text-secondary mb-1">Match</p>
                      <span className={cn(
                        'inline-flex rounded px-2 py-0.5 text-xs font-semibold text-white',
                        result.triage_correct ? 'bg-pass' : 'bg-fail'
                      )}>
                        {result.triage_correct ? 'CORRECT' : 'INCORRECT'}
                      </span>
                    </div>
                  </div>

                  {/* Still show criteria table if present (descriptive mode with triage) */}
                  {criteria.length > 1 && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-text-secondary">
                            <th className="py-2 pr-3 font-medium w-[38%]">Criteria</th>
                            <th className="py-2 px-3 font-medium w-[42%]">Rationale</th>
                            <th className="py-2 px-3 font-medium text-center w-[10%]">Severity</th>
                            <th className="py-2 pl-3 font-medium text-center w-[10%]">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {criteria.map((criterion) => (
                            <tr key={criterion.id} className="border-b border-border align-top">
                              <td className="py-3 pr-3 text-text-primary">{criterion.criterion}</td>
                              <td className="py-3 px-3 text-text-primary">{criterion.rationale || '-'}</td>
                              <td className="py-3 px-3 text-center">
                                <span className={cn(
                                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                  criterion.severity === 'HIGH' && 'bg-red-100 text-red-800',
                                  criterion.severity === 'MEDIUM' && 'bg-orange-100 text-orange-800',
                                  criterion.severity === 'LOW' && 'bg-yellow-100 text-yellow-800'
                                )}>
                                  {criterion.severity}
                                </span>
                              </td>
                              <td className="py-3 pl-3 text-center">
                                <span className={cn(
                                  'inline-flex rounded px-2 py-0.5 text-xs font-semibold text-white',
                                  criterion.passed ? 'bg-pass' : 'bg-fail'
                                )}>
                                  {criterion.passed ? 'PASS' : 'FAIL'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Show rationale from the single criterion in intent mode */}
                  {criteria.length === 1 && criteria[0].rationale && (
                    <p className="text-sm text-text-secondary">{criteria[0].rationale}</p>
                  )}
                </div>
              ) : criteria.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-secondary">
                        <th className="py-2 pr-3 font-medium w-[38%]">Criteria</th>
                        <th className="py-2 px-3 font-medium w-[42%]">Rationale</th>
                        <th className="py-2 px-3 font-medium text-center w-[10%]">Severity</th>
                        <th className="py-2 pl-3 font-medium text-center w-[10%]">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {criteria.map((criterion) => (
                        <tr key={criterion.id} className="border-b border-border align-top">
                          <td className="py-3 pr-3 text-text-primary">{criterion.criterion}</td>
                          <td className="py-3 px-3 text-text-primary">{criterion.rationale || '-'}</td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                criterion.severity === 'HIGH' && 'bg-red-100 text-red-800',
                                criterion.severity === 'MEDIUM' && 'bg-orange-100 text-orange-800',
                                criterion.severity === 'LOW' && 'bg-yellow-100 text-yellow-800'
                              )}
                            >
                              {criterion.severity}
                            </span>
                          </td>
                          <td className="py-3 pl-3 text-center">
                            <span
                              className={cn(
                                'inline-flex rounded px-2 py-0.5 text-xs font-semibold text-white',
                                criterion.passed ? 'bg-pass' : 'bg-fail'
                              )}
                            >
                              {criterion.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">{result.grade_summary || 'No grading details available yet.'}</p>
              )}

              {result.error_message && (
                <div className={cn(
                  'rounded border p-3 text-xs',
                  displayStatus === 'error'
                    ? 'border-amber-500/30 bg-amber-500/5 text-amber-600'
                    : 'border-fail/30 bg-fail/5 text-fail'
                )}>
                  {displayStatus === 'error' && (
                    <p className="font-semibold mb-1">
                      Infrastructure Error — not a test failure
                    </p>
                  )}
                  {result.error_message}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border border-border rounded-lg">
          <button
            type="button"
            onClick={() => setTranscriptOpen((prev) => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between"
          >
            <span className="text-sm font-semibold text-text-primary">Transcript</span>
            {transcriptOpen ? <ChevronDown className="h-4 w-4 text-text-secondary" /> : <ChevronRight className="h-4 w-4 text-text-secondary" />}
          </button>

          {transcriptOpen && (
            <div className="px-4 pb-4">
              <div className="flex items-center justify-end gap-4 mb-3">
                <button
                  type="button"
                  onClick={downloadJson}
                  className="inline-flex items-center gap-2 text-sm text-text-primary hover:text-accent"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={copyJson}
                  className="inline-flex items-center gap-2 text-sm text-text-primary hover:text-accent"
                >
                  {copied ? <Check className="h-4 w-4 text-pass" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
              </div>

              {transcript.length === 0 ? (
                <div className="rounded-lg border border-border px-4 py-8 text-sm text-text-secondary text-center">
                  {isLive ? 'Waiting for first message...' : 'No transcript available yet.'}
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                  {transcript.map((entry, index) => (
                    <MessageBubble key={`${entry.turn ?? index}-${index}`} entry={entry} />
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {result.metadata?.step_timings && result.metadata.step_timings.length > 0 && (
          <div className="border border-border rounded-lg mt-6">
            <button
              type="button"
              onClick={() => setDebugOpen((prev) => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between"
            >
              <span className="text-sm font-semibold text-text-primary">Debug Log</span>
              {debugOpen ? <ChevronDown className="h-4 w-4 text-text-secondary" /> : <ChevronRight className="h-4 w-4 text-text-secondary" />}
            </button>

            {debugOpen && (
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-text-secondary">
                    Total duration: {result.duration_ms ? formatDuration(result.duration_ms) : '-'}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-secondary">
                        <th className="py-2 pr-3 font-medium">Step</th>
                        <th className="py-2 px-3 font-medium text-right">Duration</th>
                        <th className="py-2 pl-3 font-medium text-right">Started At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.metadata.step_timings.map((timing: StepTiming, index: number) => (
                        <tr
                          key={`${timing.step}-${timing.turn ?? ''}-${index}`}
                          className={cn(
                            'border-b border-border',
                            isPhaseStep(timing.step) ? 'bg-muted/50 font-medium' : ''
                          )}
                        >
                          <td className={cn('py-2 pr-3 text-text-primary', !isPhaseStep(timing.step) && 'pl-4')}>
                            {stepLabel(timing)}
                          </td>
                          <td className="py-2 px-3 text-right text-text-primary tabular-nums">
                            {formatDuration(timing.duration_ms)}
                          </td>
                          <td className="py-2 pl-3 text-right text-text-secondary text-xs tabular-nums">
                            {new Date(timing.started_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {(result.status === 'running' || result.status === 'grading') && (
        <div className="fixed bottom-6 right-6 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm shadow-lg inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Live updating
        </div>
      )}
    </div>
  );
}
