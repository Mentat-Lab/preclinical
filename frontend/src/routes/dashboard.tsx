import { useMemo } from 'react';
import type { TestRun } from '@/lib/types';
import { Activity, CheckCircle, FlaskConical } from 'lucide-react';
import { useTestRuns, useAgents } from '@/hooks/use-queries';

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

export default function DashboardPage() {
  const { data: runsData, isLoading: runsLoading } = useTestRuns({ limit: 1000 });
  const { isLoading: agentsLoading } = useAgents();

  const loading = runsLoading || agentsLoading;
  const runs = useMemo(() => runsData?.runs ?? [], [runsData]);
  const metrics = useMemo(() => calculateMetrics(runs), [runs]);

  return (
    <div className="flex-1 min-h-screen p-8">
      <div className="max-w-4xl">
        <p className="text-text-secondary text-sm mb-1">Preclinical</p>
        <h1 className="text-3xl font-semibold text-text-primary mb-8">Welcome</h1>

        <h2 className="text-lg font-medium text-text-primary mb-4">Metrics</h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-6 animate-pulse">
                <div className="h-4 bg-border rounded w-24 mb-4" />
                <div className="h-10 bg-border rounded w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard title="Test Runs" value={metrics.totalRuns} icon={Activity} />
            <MetricCard title="Avg Pass Rate" value={`${metrics.avgPassRate}%`} icon={CheckCircle} />
            <MetricCard
              title="Scenarios Tested"
              value={metrics.totalScenarios.toLocaleString()}
              icon={FlaskConical}
            />
          </div>
        )}
      </div>
    </div>
  );
}
