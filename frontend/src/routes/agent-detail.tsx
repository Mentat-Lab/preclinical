import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgent, useTestRuns, queryKeys } from '@/hooks/use-queries';
import * as api from '@/lib/api';
import type { TestRun } from '@/lib/types';
import { Plus, Pencil, Trash2, Globe, ExternalLink, Check, Monitor } from 'lucide-react';
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

  // Browserbase context setup state
  const [contextSetup, setContextSetup] = useState<{
    sessionId: string;
    liveUrl: string;
    contextId: string;
  } | null>(null);

  // BrowserUse Cloud profile setup state
  const [profileSetup, setProfileSetup] = useState<{
    sessionId: string;
    liveUrl: string;
    profileId: string;
  } | null>(null);

  // Local Chrome auth setup state
  const [localAuthSetup, setLocalAuthSetup] = useState<{
    sessionId: string;
    domain: string;
  } | null>(null);
  const [localAuthDone, setLocalAuthDone] = useState<string | null>(null);

  const agentConfig = agent ? (typeof agent.config === 'string' ? (() => { try { return JSON.parse(agent.config as string); } catch { return {}; } })() : agent.config ?? {}) as Record<string, string> : {};
  const browserBackend = agentConfig.browser_backend || 'browserbase';

  const setupContextMutation = useMutation({
    mutationFn: () => api.setupBrowserbaseContext(agentId!),
    onSuccess: (data) => {
      setContextSetup({
        sessionId: data.session_id,
        liveUrl: data.live_url,
        contextId: data.context_id,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId!) });
    },
  });

  const completeContextMutation = useMutation({
    mutationFn: () => api.completeBrowserbaseContextSetup(agentId!, contextSetup!.sessionId),
    onSuccess: () => {
      setContextSetup(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
    },
  });

  const setupProfileMutation = useMutation({
    mutationFn: () => api.setupBrowserUseCloudProfile(agentConfig.url),
    onSuccess: (data) => {
      setProfileSetup({
        sessionId: data.session_id,
        liveUrl: data.live_url,
        profileId: data.profile_id,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId!) });
    },
  });

  const completeProfileMutation = useMutation({
    mutationFn: () => api.completeBrowserUseCloudProfileSetup(profileSetup!.sessionId),
    onSuccess: () => {
      setProfileSetup(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
    },
  });

  const setupLocalAuthMutation = useMutation({
    mutationFn: () => api.setupLocalChromeAuth(agentConfig.url),
    onSuccess: (data) => {
      setLocalAuthSetup({
        sessionId: data.session_id,
        domain: data.domain,
      });
    },
  });

  const completeLocalAuthMutation = useMutation({
    mutationFn: () => api.completeLocalChromeAuth(localAuthSetup!.sessionId),
    onSuccess: () => {
      setLocalAuthDone(localAuthSetup!.domain);
      setLocalAuthSetup(null);
    },
  });

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
                <ProviderIcon provider={agent.provider} className="w-4 h-4" />
                {PROVIDER_NAMES[agent.provider] ?? agent.provider}
              </span>
            </div>
            {agent.description && (
              <p className="text-sm text-text-secondary mt-1">{agent.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {agent.provider === 'browser' && !contextSetup && !profileSetup && !localAuthSetup && browserBackend === 'browserbase' && (
              <button
                onClick={() => setupContextMutation.mutate()}
                disabled={setupContextMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary disabled:opacity-50"
              >
                <Globe className="w-3.5 h-3.5" />
                {setupContextMutation.isPending ? 'Setting up...' : 'Setup Browserbase Context'}
              </button>
            )}
            {agent.provider === 'browser' && !contextSetup && !profileSetup && !localAuthSetup && browserBackend === 'browseruse_cloud' && (
              <button
                onClick={() => setupProfileMutation.mutate()}
                disabled={setupProfileMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary disabled:opacity-50"
              >
                <Globe className="w-3.5 h-3.5" />
                {setupProfileMutation.isPending ? 'Setting up...' : 'Setup BrowserUse Profile'}
              </button>
            )}
            {agent.provider === 'browser' && !contextSetup && !profileSetup && !localAuthSetup && !localAuthDone && browserBackend === 'local' && (
              <button
                onClick={() => setupLocalAuthMutation.mutate()}
                disabled={setupLocalAuthMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary disabled:opacity-50"
              >
                <Monitor className="w-3.5 h-3.5" />
                {setupLocalAuthMutation.isPending ? 'Setting up...' : 'Setup Local Auth'}
              </button>
            )}
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

      {/* Browser Auth Setup Panels */}
      {setupContextMutation.isError && !contextSetup && (
        <div className="mx-8 mt-4 p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {setupContextMutation.error instanceof Error ? setupContextMutation.error.message : 'Context setup failed'}
        </div>
      )}
      {setupProfileMutation.isError && !profileSetup && (
        <div className="mx-8 mt-4 p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {setupProfileMutation.error instanceof Error ? setupProfileMutation.error.message : 'Profile setup failed'}
        </div>
      )}
      {setupLocalAuthMutation.isError && !localAuthSetup && (
        <div className="mx-8 mt-4 p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {setupLocalAuthMutation.error instanceof Error ? setupLocalAuthMutation.error.message : 'Auth setup failed'}
        </div>
      )}

      {contextSetup && (
        <div className="mx-8 mt-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Browserbase Context Setup</h3>
          <p className="text-sm text-blue-800 mb-3">
            A browser session is ready for you to log in manually. Open the live view, complete the login,
            and click "Done" when finished. The cookies will be saved for future test runs.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <code className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
              Context: {contextSetup.contextId}
            </code>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={contextSetup.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Live View
            </a>
            <button
              onClick={() => completeContextMutation.mutate()}
              disabled={completeContextMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {completeContextMutation.isPending ? 'Saving...' : 'Done — Save Context'}
            </button>
            <button
              onClick={() => setContextSetup(null)}
              className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors"
            >
              Cancel
            </button>
          </div>
          {completeContextMutation.isError && (
            <p className="mt-2 text-sm text-destructive">
              {completeContextMutation.error instanceof Error ? completeContextMutation.error.message : 'Failed to complete setup'}
            </p>
          )}
        </div>
      )}

      {profileSetup && (
        <div className="mx-8 mt-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">BrowserUse Cloud Profile Setup</h3>
          <p className="text-sm text-blue-800 mb-3">
            A browser session is ready for you to log in manually. Open the live view, complete the login,
            and click "Done" when finished. The cookies will be saved for future test runs.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <code className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
              Profile: {profileSetup.profileId}
            </code>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={profileSetup.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Live View
            </a>
            <button
              onClick={() => completeProfileMutation.mutate()}
              disabled={completeProfileMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {completeProfileMutation.isPending ? 'Saving...' : 'Done — Save Profile'}
            </button>
            <button
              onClick={() => setProfileSetup(null)}
              className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors"
            >
              Cancel
            </button>
          </div>
          {completeProfileMutation.isError && (
            <p className="mt-2 text-sm text-destructive">
              {completeProfileMutation.error instanceof Error ? completeProfileMutation.error.message : 'Failed to complete setup'}
            </p>
          )}
        </div>
      )}

      {localAuthSetup && (
        <div className="mx-8 mt-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Local Chrome Auth Setup</h3>
          <p className="text-sm text-blue-800 mb-3">
            Log in to <strong>{agentConfig.url}</strong> in the Chrome window on your machine, then click "Done".
            Cookies will be exported for future test runs.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => completeLocalAuthMutation.mutate()}
              disabled={completeLocalAuthMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {completeLocalAuthMutation.isPending ? 'Saving...' : 'Done — Export Cookies'}
            </button>
            <button
              onClick={() => setLocalAuthSetup(null)}
              className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors"
            >
              Cancel
            </button>
          </div>
          {completeLocalAuthMutation.isError && (
            <p className="mt-2 text-sm text-destructive">
              {completeLocalAuthMutation.error instanceof Error ? completeLocalAuthMutation.error.message : 'Failed to export cookies'}
            </p>
          )}
        </div>
      )}

      {localAuthDone && (
        <div className="mx-8 mt-4 flex items-center gap-2 text-sm text-green-700 p-3 rounded-lg border border-green-200 bg-green-50">
          <Check className="w-4 h-4" />
          Auth saved for {localAuthDone}
        </div>
      )}

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
