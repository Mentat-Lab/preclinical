import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, Share2, Trash2, ChevronRight } from 'lucide-react';
import { useScenarioRuns, useTestRun, queryKeys } from '@/hooks/use-queries';
import { useRealtimeRun } from '@/lib/sse';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ScenarioRunResult, TestRun } from '@/lib/types';

type StatusFilter = 'all' | 'pass' | 'fail' | 'error' | 'pending' | 'canceled';
type DisplayStatus = 'pass' | 'fail' | 'error' | 'pending' | 'canceled';

function getDisplayStatus(result: ScenarioRunResult): DisplayStatus {
  if (result.status === 'canceled') return 'canceled';
  if (result.status === 'error') return 'error';
  if (result.status === 'passed') return 'pass';
  if (result.status === 'failed') return 'fail';
  if (result.passed === true) return 'pass';
  if (result.passed === false) return 'fail';
  return 'pending';
}

function statusLabel(status: DisplayStatus): string {
  const map: Record<DisplayStatus, string> = {
    pass: 'Pass',
    fail: 'Fail',
    error: 'Error',
    pending: 'Pending',
    canceled: 'Canceled',
  };
  return map[status];
}

function statusTextClass(status: DisplayStatus): string {
  const map: Record<DisplayStatus, string> = {
    pass: 'text-pass',
    fail: 'text-fail',
    error: 'text-fail',
    pending: 'text-text-secondary',
    canceled: 'text-text-secondary',
  };
  return map[status];
}

function toRunOutcome(run: TestRun): 'pass' | 'fail' | 'pending' | 'canceled' {
  if (run.status === 'canceled') return 'canceled';
  if (run.status === 'completed') return (run.failed_count + run.error_count) > 0 ? 'fail' : 'pass';
  if (run.status === 'failed') return 'fail';
  return 'pending';
}

function formatShortDate(input?: string): string {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(durationMs?: number): string {
  if (durationMs == null || Number.isNaN(durationMs)) return '-';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}m ${sec}s`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-border', className)} />;
}

export default function TestRunPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [shareCopied, setShareCopied] = useState(false);

  const { data, isLoading, error } = useTestRun(id || '');
  const { data: scenarioRunsData, isLoading: scenariosLoading } = useScenarioRuns({ testRunId: id || '' });

  useRealtimeRun(id);

  const run = data?.run;
  const allResults = useMemo(() => scenarioRunsData?.results ?? [], [scenarioRunsData]);

  const filteredResults = useMemo(() => {
    if (filter === 'all') return allResults;
    return allResults.filter((result) => {
      const status = getDisplayStatus(result);
      if (filter === 'pending') return status === 'pending';
      return status === filter;
    });
  }, [allResults, filter]);

  const summary = useMemo(() => {
    const pass = allResults.filter((r) => getDisplayStatus(r) === 'pass').length;
    const fail = allResults.filter((r) => getDisplayStatus(r) === 'fail').length;
    const err = allResults.filter((r) => getDisplayStatus(r) === 'error').length;
    const pending = allResults.filter((r) => getDisplayStatus(r) === 'pending').length;
    const canceled = allResults.filter((r) => getDisplayStatus(r) === 'canceled').length;
    return { pass, fail, err, pending, canceled, total: allResults.length };
  }, [allResults]);

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTestRun(id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testRuns'] });
      navigate(run?.agent_id ? `/agents/${run.agent_id}` : '/');
    },
  });

  const runOutcome = run ? toRunOutcome(run) : 'pending';
  const progress = run
    ? (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled')
      ? 100
      : (summary.total > 0 ? Math.round(((summary.pass + summary.fail + summary.err + summary.canceled) / summary.total) * 100) : 0)
    : 0;

  const progressColorClass =
    runOutcome === 'pass'
      ? 'bg-pass'
      : runOutcome === 'fail'
        ? 'bg-fail'
        : runOutcome === 'canceled'
          ? 'bg-text-secondary'
          : 'bg-accent';

  const runBadgeClass =
    runOutcome === 'pass'
      ? 'bg-pass text-white'
      : runOutcome === 'fail'
        ? 'bg-fail text-white'
        : runOutcome === 'canceled'
          ? 'bg-text-secondary text-white'
          : 'bg-accent text-white';

  const runBadgeLabel =
    runOutcome === 'pass'
      ? 'Passed'
      : runOutcome === 'fail'
        ? 'Failed'
        : runOutcome === 'canceled'
          ? 'Canceled'
          : 'Running';

  const exportJson = () => {
    if (!run) return;
    const payload = {
      run,
      scenario_runs: allResults,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-run-${run.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  if (isLoading) {
    return (
      <div className="flex-1 min-h-screen p-8">
        <Skeleton className="h-5 w-32 mb-6" />
        <Skeleton className="h-10 w-64 mb-4" />
        <Skeleton className="h-32 w-full mb-6" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex-1 min-h-screen p-8 flex flex-col items-center justify-center gap-3">
        <p className="text-text-secondary">{error?.message ?? 'Test run not found'}</p>
        <Link to="/" className="text-sm text-accent hover:underline">Back to Dashboard</Link>
      </div>
    );
  }

  const completedLabel =
    run.status === 'canceled'
      ? `Canceled: ${formatShortDate(run.canceled_at)}`
      : `Completed: ${formatShortDate(run.completed_at || run.started_at)}`;

  const filterButtons: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pass', label: 'Pass' },
    { key: 'fail', label: 'Fail' },
    { key: 'error', label: 'Error' },
    { key: 'pending', label: 'Pending' },
    { key: 'canceled', label: 'Canceled' },
  ];

  return (
    <div className="flex-1 min-h-screen bg-background px-8 py-8">
      <Link
        to={run.agent_id ? `/agents/${run.agent_id}` : '/'}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Agent
      </Link>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Test Run Results</h1>
          <p className="text-sm text-text-secondary">
            Agent: {run.agent_type} · {run.agent_name || run.agent_id}
          </p>
          <p className="text-sm text-text-secondary">{completedLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Delete this test run? This cannot be undone.')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-fail/60 text-fail hover:bg-fail/5 disabled:opacity-50"
          >
            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted hover:bg-muted/70"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted hover:bg-muted/70"
          >
            <Share2 className="w-4 h-4" />
            {shareCopied ? 'Copied' : 'Share'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 mb-8">
        <div className="flex items-center gap-4 mb-5">
            <span className={cn('inline-flex px-4 py-2 rounded text-sm font-semibold', runBadgeClass)}>
              {runBadgeLabel}
            </span>
            <span className="text-2xl font-semibold text-text-primary">
              {summary.pass} / {run.total_scenarios || summary.total} passed
            </span>
        </div>
        <div className="h-4 rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full transition-all duration-500', progressColorClass)} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Scenario Runs</h2>
          <p className="text-sm text-text-secondary">
            Showing {filteredResults.length === 0 ? 0 : 1}-{filteredResults.length} of {summary.total}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterButtons.map((button) => {
            const active = filter === button.key;
            return (
              <button
                key={button.key}
                type="button"
                onClick={() => setFilter(button.key)}
                className={cn(
                  'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-text-primary border-border hover:bg-muted/80'
                )}
              >
                {button.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-5 text-sm uppercase tracking-wider text-text-secondary">Scenario</th>
              <th className="text-left py-3 px-5 text-sm uppercase tracking-wider text-text-secondary w-48">Result</th>
              <th className="text-left py-3 px-5 text-sm uppercase tracking-wider text-text-secondary w-40">Duration</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {scenariosLoading && filteredResults.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-sm text-text-secondary">Loading scenario runs...</td>
              </tr>
            ) : filteredResults.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-sm text-text-secondary">No scenario runs for this filter.</td>
              </tr>
            ) : (
              filteredResults.map((result) => {
                const status = getDisplayStatus(result);
                return (
                  <tr key={result.id} className="border-b last:border-b-0 border-border hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <Link to={`/test/${id}/scenario/${result.id}`} className="text-sm font-medium text-text-primary hover:text-accent">
                        {result.scenario_name || result.scenario_id}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('inline-flex items-center gap-2 text-sm font-medium', statusTextClass(status))}>
                        <span className="text-sm">•</span>
                        {statusLabel(status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-text-secondary">
                      {formatDuration(result.duration_ms)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link to={`/test/${id}/scenario/${result.id}`} className="inline-flex text-text-secondary hover:text-text-primary">
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
