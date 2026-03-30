import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useScenarios } from '@/hooks/use-queries';
import type { Scenario } from '@/lib/types';
import { Search, Loader2, FlaskConical, Sparkles } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScenarioRow({ scenario, onClick }: { scenario: Scenario; onClick: () => void }) {
  const criteriaCount = Array.isArray(scenario.rubric_criteria)
    ? scenario.rubric_criteria.length
    : 0;

  return (
    <tr
      className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <td className="px-5 py-3.5">
        <Link
          to={`/scenarios/${scenario.id}`}
          className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {scenario.name}
        </Link>
      </td>
      <td className="px-5 py-3.5">
        {scenario.scenario_type ? (
          <span className="text-sm text-text-primary capitalize">{scenario.scenario_type}</span>
        ) : (
          <span className="text-sm text-text-secondary">—</span>
        )}
      </td>
      <td className="px-5 py-3.5">
        {scenario.category ? (
          <span className="text-sm text-text-primary capitalize">{scenario.category}</span>
        ) : (
          <span className="text-sm text-text-secondary">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <span className="text-sm text-text-secondary">
          {criteriaCount > 0 ? criteriaCount : '—'}
        </span>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScenariosPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useScenarios();
  const scenarios = data?.scenarios ?? [];

  const filtered = search.trim()
    ? scenarios.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.scenario_type ?? '').toLowerCase().includes(q) ||
          (s.category ?? '').toLowerCase().includes(q) ||
          (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      })
    : scenarios;

  return (
    <div className="flex-1 min-h-screen bg-background">
      {/* Header */}
      <header className="px-8 py-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Scenarios</h1>
            <p className="text-sm text-text-secondary mt-1">
              Browse test scenarios to run against your agents
            </p>
          </div>
          <Link
            to="/scenarios/generate"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate Scenarios
          </Link>
        </div>
      </header>

      <main className="px-8 py-6">
        {/* Search */}
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
          <input
            type="text"
            placeholder="Search scenarios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-600">
            {error.message}
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <FlaskConical className="w-8 h-8 text-text-secondary" />
            <p className="text-sm text-text-secondary">
              {search ? 'No scenarios match your search' : 'No scenarios yet'}
            </p>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && filtered.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Criteria
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((scenario) => (
                  <ScenarioRow
                    key={scenario.id}
                    scenario={scenario}
                    onClick={() => navigate(`/scenarios/${scenario.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Count */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-text-secondary mt-3">
            {filtered.length} scenario{filtered.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </p>
        )}
      </main>
    </div>
  );
}
