import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgent, useTestRuns, queryKeys } from '@/hooks/use-queries';
import * as api from '@/lib/api';
import type { TestRun } from '@/lib/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ProviderIcon } from '@/components/ProviderIcon';
import { PROVIDER_NAMES } from '@/lib/provider-config';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: TestRun['status'] }) {
  if (status === 'completed') {
    return <span className="text-sm text-text-secondary">Completed</span>;
  }

  const styles: Record<TestRun['status'], string> = {
    pending: 'bg-muted text-text-secondary',
    running: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
    grading: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
    completed: 'bg-green-500/10 text-green-600 border border-green-500/20',
    failed: 'bg-red-500/10 text-red-600 border border-red-500/20',
    canceled: 'bg-muted text-text-secondary border border-border',
    scheduled: 'bg-muted text-text-secondary border border-border',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function RunResultBadge({ run }: { run: TestRun }) {
  if (run.status === 'completed' && run.total_scenarios > 0) {
    const allPassed = run.passed_count === run.total_scenarios;
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold text-white ${
          allPassed ? 'bg-green-600' : 'bg-red-600'
        }`}
      >
        {allPassed ? 'Passed' : 'Failed'}
      </span>
    );
  }
  if (run.status === 'running' || run.status === 'grading') {
    return <span className="text-text-secondary text-sm">—</span>;
  }
  if (run.status === 'canceled') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-muted text-text-secondary">
        Canceled
      </span>
    );
  }
  return <span className="text-text-secondary text-sm">—</span>;
}

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: agent, isLoading: agentLoading, error: agentError } = useAgent(agentId!);
  const { data: runsData, isLoading: runsLoading } = useTestRuns({ limit: 50 });

  const agentRuns = runsData?.runs.filter((r) => r.agent_id === agentId) ?? [];

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAgent(agentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
      navigate('/agents');
    },
  });

  const handleDelete = () => {
    if (
      window.confirm(
        `Delete agent "${agent?.name}"? This cannot be undone. All associated test runs will also be removed.`
      )
    ) {
      deleteMutation.mutate();
    }
  };

  if (agentLoading) {
    return (
      <div className="flex-1 min-h-screen bg-background">
        <div className="px-8 py-6 border-b border-border animate-pulse space-y-2">
          <div className="h-7 bg-border rounded w-48" />
          <div className="h-4 bg-border rounded w-72" />
        </div>
        <div className="px-8 py-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (agentError || !agent) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-text-secondary mb-4">Agent not found</p>
          <Link to="/agents" className="text-sm text-accent underline">
            Back to agents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-background">
      {/* Header */}
      <header className="px-8 py-6 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-text-primary">{agent.name}</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary bg-muted border border-border px-2 py-1 rounded capitalize">
                <ProviderIcon provider={agent.provider} className="w-4 h-4" size={16} />
                {PROVIDER_NAMES[agent.provider] ?? agent.provider}
              </span>
            </div>
            {agent.description && (
              <p className="text-sm text-text-secondary mt-1">{agent.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/agents/${agentId}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-red-200 rounded-md bg-card hover:bg-red-50 transition-colors text-red-600 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>

        {deleteMutation.isError && (
          <p className="mt-2 text-sm text-destructive">
            {deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Delete failed'}
          </p>
        )}
      </header>

      {/* Content */}
      <main className="px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">Test Runs</h2>
          {agentRuns.length > 0 && (
            <Link
              to={`/agents/${agentId}/new-run`}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Test Run
            </Link>
          )}
        </div>

        {runsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-border rounded animate-pulse" />
            ))}
          </div>
        ) : agentRuns.length === 0 ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-8">
            <div className="max-w-md mx-auto text-center">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Run your first test</h3>
              <p className="text-sm text-text-secondary mb-6">
                See how {agent.name} handles adversarial healthcare scenarios.
              </p>
              <Link
                to={`/agents/${agentId}/new-run`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Test Run
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {['Name', 'Status', 'Result', 'Passed', 'Created'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agentRuns.map((run) => (
                    <tr
                      key={run.id}
                      className="hover:bg-muted/50 transition-colors group cursor-pointer"
                      onClick={() => navigate(`/test/${run.id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        <span className="group-hover:text-accent">
                          {run.name || run.test_run_id || 'Test Run'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <RunResultBadge run={run} />
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {run.status === 'completed' && run.total_scenarios > 0 ? (
                          <span>{run.passed_count} / {run.total_scenarios}</span>
                        ) : (run.status === 'running' || run.status === 'grading') ? (
                          <span>In progress</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {formatDate(run.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
