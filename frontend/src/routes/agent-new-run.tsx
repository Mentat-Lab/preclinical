import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAgent, useScenarios } from '@/hooks/use-queries';
import * as api from '@/lib/api';
import { ArrowLeft, Play, Search, Loader2, X } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50';

export default function NewRunPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const scenariosParam = searchParams.get('scenarios');
  const preSelectedScenarioIds = scenariosParam ? scenariosParam.split(',').filter(Boolean) : [];
  const hasPreSelected = preSelectedScenarioIds.length > 0;

  const { data: agent, isLoading: agentLoading } = useAgent(agentId!);
  const { data: scenariosData, isLoading: scenariosLoading } = useScenarios();
  const allScenarios = scenariosData?.scenarios ?? [];

  // Form state
  const [testName, setTestName] = useState('');
  const [concurrency, setConcurrency] = useState('1');
  const [maxScenarios, setMaxScenarios] = useState('10');
  // Scenario selection
  const [selectSpecific, setSelectSpecific] = useState(hasPreSelected);
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(
    () => new Set(preSelectedScenarioIds),
  );
  const [scenarioSearch, setScenarioSearch] = useState('');
  // Tag-based filtering
  const [filterByTags, setFilterByTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  // Seed pre-selected ids when the param changes
  useEffect(() => {
    if (preSelectedScenarioIds.length > 0) {
      setSelectedScenarios(new Set(preSelectedScenarioIds));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const maxConcurrency = 10;

  const filteredScenarios = allScenarios.filter((s) => {
    const q = scenarioSearch.toLowerCase();
    const matchesSearch = !q ||
      s.name?.toLowerCase().includes(q) ||
      (s.category ?? '').toLowerCase().includes(q) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(q));
    return matchesSearch;
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createTestRun({
        agent_id: agentId!,
        name: testName.trim() || undefined,
        concurrency_limit: concurrency ? parseInt(concurrency) : undefined,
        scenario_ids: selectSpecific ? Array.from(selectedScenarios) : undefined,
        max_scenarios: maxScenarios ? parseInt(maxScenarios) : undefined,
        tags: filterByTags && filterTags.length > 0 ? filterTags : undefined,
      }),
    onSuccess: (run) => {
      navigate(`/test/${run.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to start test run');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  };

  const canSubmit =
    !createMutation.isPending &&
    (!selectSpecific || selectedScenarios.size > 0);

  return (
    <div className="flex-1 min-h-screen bg-background">
      {/* Header */}
      <header className="px-8 py-5 border-b border-border">
        <Link
          to={`/agents/${agentId}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-3 -ml-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {agent?.name || 'Agent'}
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">New Test Run</h1>
        {agentLoading ? (
          <div className="flex items-center gap-2 mt-1">
            <Loader2 className="w-3 h-3 animate-spin text-text-secondary" />
            <p className="text-sm text-text-secondary">Loading agent...</p>
          </div>
        ) : agent ? (
          <p className="text-sm text-text-secondary mt-1">
            Configure and launch a test run for {agent.name} without using the API directly.
          </p>
        ) : null}
      </header>

      {/* Form */}
      <main className="px-8 py-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Test Run Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              Test Run Name{' '}
              <span className="font-normal text-text-secondary">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Weekly regression test"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              disabled={createMutation.isPending}
              className={inputCls}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium text-text-primary mb-1">Customer flow</p>
            <p className="text-sm text-text-secondary">
              Select what to run, start the test, then review and export the results from the run details page.
            </p>
          </div>

          {/* Scenario Selection */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectSpecific}
                onChange={(e) => setSelectSpecific(e.target.checked)}
                disabled={createMutation.isPending}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium text-text-primary">Select specific scenarios</span>
            </label>
          </div>

          {/* Tag Filter */}
          {!selectSpecific && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterByTags}
                  onChange={(e) => setFilterByTags(e.target.checked)}
                  disabled={createMutation.isPending}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium text-text-primary">Filter by tags</span>
              </label>
              {filterByTags && (
                <div className="p-3 rounded border border-border bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add a tag and press Enter..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
                          if (t && !filterTags.includes(t)) {
                            setFilterTags([...filterTags, t]);
                          }
                          setTagInput('');
                        }
                      }}
                      disabled={createMutation.isPending}
                      className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
                        if (t && !filterTags.includes(t)) {
                          setFilterTags([...filterTags, t]);
                        }
                        setTagInput('');
                      }}
                      disabled={!tagInput.trim() || createMutation.isPending}
                      className="px-3 py-2 text-sm rounded-md border border-border bg-muted text-text-primary hover:bg-muted/80 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  {filterTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {filterTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent border border-accent/20"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => setFilterTags(filterTags.filter((t) => t !== tag))}
                            className="hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-text-secondary">
                    Only scenarios matching any of these tags will be included in the run.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Scenario Picker */}
          {selectSpecific && (
            <div className="space-y-2 p-3 rounded border border-border bg-muted/30">
              {scenariosLoading ? (
                <p className="text-sm text-text-secondary">Loading scenarios...</p>
              ) : allScenarios.length === 0 ? (
                <p className="text-sm text-text-secondary">No active scenarios found.</p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search scenarios..."
                      value={scenarioSearch}
                      onChange={(e) => setScenarioSearch(e.target.value)}
                      disabled={createMutation.isPending}
                      className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {filteredScenarios.map((scenario) => (
                      <label
                        key={scenario.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedScenarios.has(scenario.id)}
                          onChange={(e) => {
                            const next = new Set(selectedScenarios);
                            if (e.target.checked) next.add(scenario.id);
                            else next.delete(scenario.id);
                            setSelectedScenarios(next);
                          }}
                          disabled={createMutation.isPending}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-text-primary truncate flex-1">
                          {scenario.name || 'Unnamed Scenario'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {selectedScenarios.size} of {allScenarios.length} scenarios selected
                  </p>
                </>
              )}
            </div>
          )}

          {/* Concurrency and Max Scenarios */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">Concurrency</label>
              <input
                type="number"
                min={1}
                max={maxConcurrency}
                placeholder="1"
                value={concurrency}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) { setConcurrency(''); return; }
                  setConcurrency(String(Math.min(Math.max(parseInt(v) || 1, 1), maxConcurrency)));
                }}
                disabled={createMutation.isPending}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">Max Scenarios</label>
              <input
                type="number"
                min={1}
                placeholder="10"
                value={maxScenarios}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) { setMaxScenarios(''); return; }
                  setMaxScenarios(String(Math.max(parseInt(v) || 1, 1)));
                }}
                disabled={createMutation.isPending}
                className={inputCls}
              />
              <p className="text-xs text-text-secondary">Clear for all</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => navigate(`/agents/${agentId}`)}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Test Run
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
