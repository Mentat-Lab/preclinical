import { useMemo } from 'react';
import type { HealthCheck, TestRun } from '@/lib/types';
import { Activity, CheckCircle, FlaskConical, AlertTriangle, ServerCog } from 'lucide-react';
import { useTestRuns, useAgents, useHealth } from '@/hooks/use-queries';
import { PROVIDER_READINESS } from '@/lib/provider-config';
import { cn } from '@/lib/utils';

function calculateMetrics(runs: TestRun[]) {
  if (runs.length === 0) return { totalRuns: 0, avgPassRate: 0, totalScenarios: 0 };
  const completed = runs.filter((r) => r.status === 'completed');
  const avgPassRate =
    completed.length > 0
      ? Math.round(completed.reduce((s, r) => s + (r.pass_rate || 0), 0) / completed.length)
      : 0;
  const totalScenarios = runs.reduce((s, r) => s + (r.total_scenarios || 0), 0);
  return { totalRuns: runs.length, avgPassRate, totalScenarios };
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-text-secondary mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-sm">{title}</span>
      </div>
      <div className="text-4xl font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function checkStyles(status: HealthCheck['status']) {
  if (status === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-red-200 bg-red-50 text-red-800';
}

function CheckCard({ title, check }: { title: string; check: HealthCheck }) {
  return (
    <div className={cn('rounded-lg border p-4', checkStyles(check.status))}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-xs font-medium uppercase tracking-wide">{check.status}</span>
      </div>
      <p className="text-sm">{check.detail}</p>
    </div>
  );
}

function deriveReadinessStatus(checks: HealthCheck[]): 'ok' | 'degraded' | 'error' {
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'warning')) return 'degraded';
  return 'ok';
}

export default function DashboardPage() {
  const { data: runsData, isLoading: runsLoading } = useTestRuns({ limit: 1000 });
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: health, isLoading: healthLoading } = useHealth();

  const loading = runsLoading || agentsLoading;
  const runs = runsData?.runs ?? [];
  const metrics = calculateMetrics(runs);

  const recommendedProviders = useMemo(
    () => Object.entries(PROVIDER_READINESS).filter(([, value]) => value.stage === 'recommended'),
    [],
  );
  const readinessStatus = health
    ? deriveReadinessStatus([
        health.checks.database,
        health.checks.tester_model,
        health.checks.grader_model,
        health.checks.browser_provider,
      ])
    : null;

  return (
    <div className="flex-1 min-h-screen p-8">
      <div className="max-w-5xl">
        <p className="text-text-secondary text-sm mb-1">Preclinical</p>
        <h1 className="text-3xl font-semibold text-text-primary mb-2">Customer Readiness</h1>
        <p className="text-sm text-text-secondary mb-8">
          This page shows whether the app is actually ready for independent customer use, not just whether the UI loads.
        </p>

        <h2 className="text-lg font-medium text-text-primary mb-4">Metrics</h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-6 animate-pulse">
                <div className="h-4 bg-border rounded w-24 mb-4" />
                <div className="h-10 bg-border rounded w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <MetricCard title="Test Runs" value={metrics.totalRuns} icon={Activity} />
            <MetricCard title="Avg Pass Rate" value={`${metrics.avgPassRate}%`} icon={CheckCircle} />
            <MetricCard
              title="Scenarios Tested"
              value={metrics.totalScenarios.toLocaleString()}
              icon={FlaskConical}
            />
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-6 mb-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-medium text-text-primary">Runtime Readiness</h2>
              <p className="text-sm text-text-secondary mt-1">
                Core backend dependencies for self-serve usage.
              </p>
            </div>
            {!healthLoading && health && (
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                  readinessStatus === 'ok'
                    ? 'bg-emerald-100 text-emerald-800'
                    : readinessStatus === 'degraded'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800',
                )}
              >
                <ServerCog className="w-3.5 h-3.5" />
                {readinessStatus}
              </span>
            )}
          </div>

          {healthLoading || !health ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-lg border border-border p-4 animate-pulse">
                  <div className="h-4 bg-border rounded w-32 mb-3" />
                  <div className="h-4 bg-border rounded w-full" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <CheckCard title="Database" check={health.checks.database} />
                <CheckCard title="Tester Model" check={health.checks.tester_model} />
                <CheckCard title="Grader Model" check={health.checks.grader_model} />
                <CheckCard title="Browser Provider" check={health.checks.browser_provider} />
              </div>
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-text-secondary">
                Tester model: <span className="font-medium text-text-primary">{health.setup.tester_model}</span>
                {' · '}
                Grader model: <span className="font-medium text-text-primary">{health.setup.grader_model}</span>
                {' · '}
                Worker concurrency: <span className="font-medium text-text-primary">{health.setup.worker_concurrency}</span>
              </div>
            </>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-medium text-text-primary mb-4">Independent Use Checklist</h2>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-semibold text-text-primary mb-1">1. Confirm runtime health</p>
                <p className="text-sm text-text-secondary">
                  Both evaluator models need to be ready before customers can execute tests without operator help.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-semibold text-text-primary mb-1">2. Start with recommended providers</p>
                <p className="text-sm text-text-secondary">
                  OpenAI, Vapi, and Browser are the clearest self-serve paths. Voice transport providers still require more careful setup.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-semibold text-text-primary mb-1">3. Launch a run from the agent page</p>
                <p className="text-sm text-text-secondary">
                  Customers should be able to create an agent, start a run, and inspect results without touching the API directly.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-semibold text-text-primary mb-1">4. Export results</p>
                <p className="text-sm text-text-secondary">
                  Run results can now be exported for spreadsheets and external review, not just raw JSON.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-text-secondary" />
              <h2 className="text-lg font-medium text-text-primary">Recommended Provider Paths</h2>
            </div>
            <div className="space-y-3">
              {recommendedProviders.map(([id, provider]) => (
                <div key={id} className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-semibold text-text-primary">{id}</p>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      {provider.badge}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary mb-2">{provider.summary}</p>
                  <p className="text-xs text-text-secondary">{provider.setupNotes}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-secondary mt-4">
              Current agent count: <span className="font-medium text-text-primary">{agents?.length ?? 0}</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
