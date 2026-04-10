import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useScenario, useUpdateScenario, queryKeys } from '@/hooks/use-queries';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  inputCls,
  TEST_TYPES,
  type RubricCriterion,
} from '@/lib/scenario-helpers';
import {
  RubricTable,
  RubricEditor,
  DemographicsView,
  ScenarioSettingsEditor,
} from '@/components/scenarios';
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Save,
  X,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-border', className)} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScenarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);

  const { data: scenario, isLoading, error } = useScenario(id!);
  const updateMutation = useUpdateScenario();

  // ── Edit state ──
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editScenarioType, setEditScenarioType] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editApproved, setEditApproved] = useState(true);
  const [editPriority, setEditPriority] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editChiefComplaint, setEditChiefComplaint] = useState('');
  const [editSopInstructions, setEditSopInstructions] = useState('');
  const [editTestType, setEditTestType] = useState('');
  const [editDemoAge, setEditDemoAge] = useState('');
  const [editDemoGender, setEditDemoGender] = useState('');
  const [editDemoAgeRange, setEditDemoAgeRange] = useState('');
  const [editRubric, setEditRubric] = useState<RubricCriterion[]>([]);

  function syncEditState(s: typeof scenario) {
    if (!s) return;
    const content = s.content ?? {};
    const demo = content.demographics as Record<string, unknown> | undefined;
    setEditName(s.name ?? '');
    setEditCategory(s.category ?? '');
    setEditScenarioType(s.scenario_type ?? 'custom');
    setEditIsActive(s.is_active !== false);
    setEditApproved(s.approved !== false);
    setEditPriority(s.priority != null ? String(s.priority) : '');
    setEditTags(s.tags ?? []);
    setEditChiefComplaint(String(content.chief_complaint ?? ''));
    setEditSopInstructions(String(content.sop_instructions ?? ''));
    setEditTestType(String(content.test_type ?? ''));
    setEditDemoAge(demo?.age != null ? String(demo.age) : '');
    setEditDemoGender(String(demo?.gender ?? ''));
    setEditDemoAgeRange(String(demo?.age_range ?? ''));
    setEditRubric(
      Array.isArray(s.rubric_criteria)
        ? (s.rubric_criteria as RubricCriterion[]).map((r) => ({ ...r }))
        : [],
    );
  }

  // Sync edit state when scenario loads
  useEffect(() => { syncEditState(scenario); }, [scenario]);

  function startEdit() {
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    syncEditState(scenario);
  }

  function handleSave() {
    if (!scenario) return;
    const scenarioId = scenario.scenario_id || scenario.id;

    const content: Record<string, unknown> = {
      ...(scenario.content ?? {}),
      chief_complaint: editChiefComplaint,
      sop_instructions: editSopInstructions,
      test_type: editTestType,
      demographics: {
        age: editDemoAge ? parseInt(editDemoAge) : undefined,
        gender: editDemoGender || undefined,
        age_range: editDemoAgeRange || undefined,
      },
    };

    updateMutation.mutate(
      {
        id: scenarioId,
        name: editName,
        category: editCategory || undefined,
        scenario_type: editScenarioType,
        is_active: editIsActive,
        approved: editApproved,
        priority: editPriority ? parseInt(editPriority) : undefined,
        tags: editTags,
        content,
        rubric_criteria: editRubric as Record<string, unknown>[],
      },
      {
        onSuccess: () => {
          setEditing(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.scenario(id!) });
          queryClient.invalidateQueries({ queryKey: queryKeys.scenarios() });
        },
      },
    );
  }


  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex-1 min-h-screen p-8">
        <Skeleton className="h-6 w-24 mb-6" />
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-40 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── Error / not found ──
  if (error || !scenario) {
    return (
      <div className="flex-1 min-h-screen p-8 flex flex-col items-center justify-center gap-4">
        <p className="text-text-secondary">{error?.message ?? 'Scenario not found'}</p>
        <Link to="/scenarios" className="text-sm text-accent hover:underline">
          Back to Scenarios
        </Link>
      </div>
    );
  }

  const rubric: RubricCriterion[] = Array.isArray(scenario.rubric_criteria)
    ? (scenario.rubric_criteria as RubricCriterion[])
    : [];

  const content = scenario.content ?? {};
  const hasContent = Object.keys(content).length > 0;

  const stringify = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
  };

  const script = stringify(content.script);
  const chiefComplaint = stringify(content.chief_complaint);
  const sopInstructions = stringify(content.sop_instructions);
  const testType = stringify(content.test_type);
  const demographics = content.demographics as Record<string, string> | string | undefined;

  return (
    <div className="flex-1 min-h-screen bg-background">
      {/* Header */}
      <header className="px-8 py-5 border-b border-border">
        <Link
          to="/scenarios"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4 -ml-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Scenarios
        </Link>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xl font-semibold text-text-primary bg-transparent border-b-2 border-accent/50 focus:border-accent outline-none w-full pb-0.5 mb-1.5"
              />
            ) : (
              <h1 className="text-xl font-semibold text-text-primary mb-1.5">
                {scenario.name}
              </h1>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {!editing && scenario.scenario_type && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-border bg-muted text-text-secondary capitalize">
                  {scenario.scenario_type}
                </span>
              )}
              {!editing && testType && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-accent/20 bg-accent/10 text-accent capitalize">
                  {testType.replace(/_/g, ' ')}
                </span>
              )}
              {!editing && scenario.category && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-border bg-muted text-text-secondary capitalize">
                  {scenario.category}
                </span>
              )}
              {!editing && scenario.is_active === false && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-600 border border-red-500/20">
                  Inactive
                </span>
              )}
              {!editing && scenario.approved === false && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">
                  Unapproved
                </span>
              )}
              {!editing &&
                (scenario.tags ?? []).map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent border border-accent/20"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card text-text-primary hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={updateMutation.isPending || !editName.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card text-text-primary hover:bg-muted transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="px-8 py-6 space-y-5 max-w-4xl">
        {/* Error */}
        {updateMutation.error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
            {updateMutation.error.message}
          </div>
        )}

        {/* Metadata (edit mode) */}
        {editing && (
          <ScenarioSettingsEditor
            category={editCategory}
            onCategoryChange={setEditCategory}
            scenarioType={editScenarioType}
            onScenarioTypeChange={setEditScenarioType}
            priority={editPriority}
            onPriorityChange={setEditPriority}
            isActive={editIsActive}
            onIsActiveChange={setEditIsActive}
            approved={editApproved}
            onApprovedChange={setEditApproved}
            tags={editTags}
            onTagsChange={setEditTags}
          />
        )}

        {/* Metadata (view mode) */}
        {!editing && (
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Details
              </h2>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-text-secondary mb-0.5">Category</p>
                  <p className="text-sm text-text-primary capitalize">{scenario.category || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-0.5">Scenario Type</p>
                  <p className="text-sm text-text-primary capitalize">{scenario.scenario_type || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-0.5">Priority</p>
                  <p className="text-sm text-text-primary">{scenario.priority ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary mb-0.5">Status</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-block w-2 h-2 rounded-full',
                        scenario.is_active !== false ? 'bg-green-500' : 'bg-red-500',
                      )}
                    />
                    <span className="text-sm text-text-primary">
                      {scenario.is_active !== false ? 'Active' : 'Inactive'}
                      {scenario.approved === false ? ', Unapproved' : ''}
                    </span>
                  </div>
                </div>
              </div>
              {scenario.created_at && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-text-secondary">
                  <span>Created {new Date(scenario.created_at).toLocaleDateString()}</span>
                  {scenario.updated_at && (
                    <span>Updated {new Date(scenario.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Demographics */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Demographics
            </h2>
          </div>
          <div className="px-5 py-4">
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">Age</label>
                  <input
                    type="number"
                    value={editDemoAge}
                    onChange={(e) => setEditDemoAge(e.target.value)}
                    placeholder="e.g. 45"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">Gender</label>
                  <select
                    value={editDemoGender}
                    onChange={(e) => setEditDemoGender(e.target.value)}
                    className={cn(inputCls, 'appearance-none')}
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non-binary">Non-binary</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">Age Range</label>
                  <input
                    type="text"
                    value={editDemoAgeRange}
                    onChange={(e) => setEditDemoAgeRange(e.target.value)}
                    placeholder="e.g. 40-50"
                    className={inputCls}
                  />
                </div>
              </div>
            ) : demographics ? (
              <DemographicsView demographics={demographics} />
            ) : (
              <p className="text-sm text-text-secondary">No demographics set</p>
            )}
          </div>
        </section>

        {/* Chief Complaint */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Chief Complaint
            </h2>
          </div>
          <div className="px-5 py-4">
            {editing ? (
              <textarea
                value={editChiefComplaint}
                onChange={(e) => setEditChiefComplaint(e.target.value)}
                rows={3}
                placeholder="Opening patient utterance..."
                className={cn(inputCls, 'resize-y')}
              />
            ) : chiefComplaint ? (
              <p className="text-sm text-text-primary">{chiefComplaint}</p>
            ) : (
              <p className="text-sm text-text-secondary">No chief complaint set</p>
            )}
          </div>
        </section>

        {/* Test Type (edit mode) */}
        {editing && (
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Test Type
              </h2>
            </div>
            <div className="px-5 py-4">
              <select
                value={editTestType}
                onChange={(e) => setEditTestType(e.target.value)}
                className={cn(inputCls, 'max-w-xs appearance-none')}
              >
                <option value="">—</option>
                {TEST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* Patient Script (view only — not edited since it comes from legacy scenarios) */}
        {!editing && script && (
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Patient Script
              </h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {script}
              </p>
            </div>
          </section>
        )}

        {/* SOP Instructions */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Agent SOP / Instructions
            </h2>
          </div>
          <div className="px-5 py-4">
            {editing ? (
              <textarea
                value={editSopInstructions}
                onChange={(e) => setEditSopInstructions(e.target.value)}
                rows={5}
                placeholder="What the AI agent must and must not do..."
                className={cn(inputCls, 'resize-y')}
              />
            ) : sopInstructions ? (
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {sopInstructions}
              </p>
            ) : (
              <p className="text-sm text-text-secondary">No SOP instructions set</p>
            )}
          </div>
        </section>

        {/* Rubric Criteria */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Rubric Criteria
            </h2>
            <span className="text-xs text-text-secondary">
              {(editing ? editRubric : rubric).length}{' '}
              {(editing ? editRubric : rubric).length === 1 ? 'criterion' : 'criteria'}
            </span>
          </div>

          {editing ? (
            <RubricEditor rubric={editRubric} onChange={setEditRubric} />
          ) : (
            <RubricTable rubric={rubric} />
          )}
        </section>

        {/* Raw Content JSON (collapsible, view mode only) */}
        {!editing && hasContent && (
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setContentOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
            >
              <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Raw Content JSON
              </h2>
              {contentOpen ? (
                <ChevronDown className="w-4 h-4 text-text-secondary" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-secondary" />
              )}
            </button>
            {contentOpen && (
              <div className="border-t border-border px-5 py-4">
                <pre className="text-xs text-text-secondary bg-muted/40 rounded-md border border-border p-4 overflow-auto max-h-96 whitespace-pre-wrap">
                  {JSON.stringify(content, null, 2)}
                </pre>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
