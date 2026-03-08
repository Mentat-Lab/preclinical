import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGenerateScenario, useGenerateScenarioBatch } from '@/hooks/use-queries';
import { cn } from '@/lib/utils';
import type { Scenario } from '@/lib/types';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  CheckCircle,
  ChevronRight,
  Save,
  X,
  Layers,
} from 'lucide-react';
import { tagColor, tagLabel, type RubricCriterion } from '@/lib/scenario-helpers';

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: '', label: 'No category' },
  { value: 'cardiac', label: 'Cardiac' },
  { value: 'respiratory', label: 'Respiratory' },
  { value: 'mental_health', label: 'Mental Health' },
  { value: 'pediatric', label: 'Pediatric' },
  { value: 'neurological', label: 'Neurological' },
  { value: 'gastrointestinal', label: 'Gastrointestinal' },
  { value: 'musculoskeletal', label: 'Musculoskeletal' },
  { value: 'dermatological', label: 'Dermatological' },
  { value: 'infectious', label: 'Infectious' },
  { value: 'dental', label: 'Dental' },
  { value: 'other', label: 'Other' },
];

// ── Preview ────────────────────────────────────────────────────────────────────

function ScenarioPreview({
  scenario,
  onSave,
  isSaving,
}: {
  scenario: Scenario;
  onSave: () => void;
  isSaving: boolean;
}) {
  const rubric: RubricCriterion[] = Array.isArray(scenario.rubric_criteria)
    ? (scenario.rubric_criteria as RubricCriterion[])
    : [];

  const content = scenario.content ?? {};
  const stringify = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
  };
  const chiefComplaint = stringify(content.chief_complaint);
  const script = stringify(content.script);
  const demographics = content.demographics as Record<string, string> | string | undefined;

  return (
    <div className="space-y-5">
      {/* Preview header */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">Generated Scenario</span>
          </div>
          <div className="flex items-center gap-2">
            {scenario.scenario_type && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-border bg-muted text-text-secondary capitalize">
                {scenario.scenario_type}
              </span>
            )}
          </div>
        </div>
        <div className="px-5 py-4">
          <h3 className="text-base font-semibold text-text-primary">{scenario.name}</h3>
        </div>
      </div>

      {/* Demographics */}
      {demographics && (
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Demographics
            </h4>
          </div>
          <div className="px-5 py-4 flex flex-wrap gap-3">
            {typeof demographics === 'object'
              ? Object.entries(demographics).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
                    <span className="text-xs font-medium text-text-secondary capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm font-semibold text-text-primary">{val}</span>
                  </div>
                ))
              : <p className="text-sm text-text-primary">{demographics}</p>
            }
          </div>
        </section>
      )}

      {/* Chief Complaint */}
      {chiefComplaint && (
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Chief Complaint
            </h4>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-text-primary">{chiefComplaint}</p>
          </div>
        </section>
      )}

      {/* Patient Script */}
      {script && (
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Patient Script
            </h4>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{script}</p>
          </div>
        </section>
      )}

      {/* Rubric Criteria */}
      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Rubric Criteria
          </h4>
          <span className="text-xs text-text-secondary">
            {rubric.length} {rubric.length === 1 ? 'criterion' : 'criteria'}
          </span>
        </div>
        {rubric.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-text-secondary">
            No criteria defined
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Criterion
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Tags
                </th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-text-secondary uppercase tracking-wider w-20">
                  Points
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rubric.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-sm text-text-primary">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-text-secondary shrink-0 mt-0.5" />
                      <span>{row.criterion ?? row.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(row.tags ?? []).length > 0 ? (
                        (row.tags ?? []).map((tag, ti) => (
                          <span
                            key={ti}
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                              tagColor(tag)
                            )}
                            title={tag}
                          >
                            {tagLabel(tag)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-text-secondary">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-sm text-text-primary">
                    {row.points ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Save action */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <p className="text-xs text-text-secondary">
          Review the scenario above, then save it to your library.
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save &amp; Use
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ScenarioGeneratePage() {
  const navigate = useNavigate();

  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);

  const generateMutation = useGenerateScenario();
  const batchMutation = useGenerateScenarioBatch();

  const generated = batchMode ? null : (generateMutation.data ?? null);
  const batchGenerated = batchMode ? (batchMutation.data?.scenarios ?? null) : null;
  const isGenerating = batchMode ? batchMutation.isPending : generateMutation.isPending;
  const generateError = batchMode ? batchMutation.error : generateMutation.error;

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (batchMode) {
      batchMutation.reset();
      batchMutation.mutate({
        text: text.trim(),
        category: category || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
    } else {
      generateMutation.reset();
      generateMutation.mutate({
        text: text.trim(),
        name: name.trim() || undefined,
        category: category || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
    }
  }

  function handleSave() {
    if (!generated) return;
    const scenarioId = generated.scenario_id || generated.id;
    if (!scenarioId) return;
    navigate(`/scenarios/${scenarioId}`);
  }

  function handleBatchSave() {
    navigate('/scenarios');
  }

  const canGenerate = text.trim().length > 0 && !isGenerating;

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
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Generate Scenario</h1>
          <p className="text-sm text-text-secondary mt-1">
            Paste a clinical SOP, guideline, or protocol and the system will generate a structured
            test scenario.
          </p>
        </div>
      </header>

      <main className="px-8 py-6 max-w-4xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          {/* Left: form */}
          <form onSubmit={handleGenerate} className="space-y-5">
            {/* Mode toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={(e) => setBatchMode(e.target.checked)}
                  disabled={isGenerating}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Batch mode
                </span>
              </label>
              <span className="text-xs text-text-secondary">
                {batchMode
                  ? 'Generate multiple scenarios from one large SOP document'
                  : 'Generate a single scenario from focused clinical text'}
              </span>
            </div>

            {/* Optional fields row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name (single mode only) */}
              {!batchMode && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="gen-name"
                    className="text-xs font-semibold text-text-secondary uppercase tracking-wider"
                  >
                    Scenario Name
                    <span className="ml-1 font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    id="gen-name"
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isGenerating}
                    className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                  />
                </div>
              )}

              {/* Category */}
              <div className="space-y-1.5">
                <label
                  htmlFor="gen-category"
                  className="text-xs font-semibold text-text-secondary uppercase tracking-wider"
                >
                  Category
                  <span className="ml-1 font-normal normal-case">(optional)</span>
                </label>
                <select
                  id="gen-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50 appearance-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Tags
                <span className="ml-1 font-normal normal-case">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Add a tag and press Enter..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  disabled={isGenerating}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={!tagInput.trim() || isGenerating}
                  className="px-3 py-2 text-sm rounded-md border border-border bg-muted text-text-primary hover:bg-muted/80 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent border border-accent/20"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Clinical text */}
            <div className="space-y-1.5">
              <label
                htmlFor="gen-text"
                className="text-xs font-semibold text-text-secondary uppercase tracking-wider"
              >
                Clinical Text
                <span className="ml-1 font-normal normal-case text-red-500">*</span>
              </label>
              <textarea
                id="gen-text"
                placeholder="Paste a clinical SOP, guideline, protocol, or case description here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isGenerating}
                rows={14}
                className="w-full px-3 py-2.5 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50 resize-y font-mono leading-relaxed"
              />
              <p className="text-xs text-text-secondary">
                {text.trim().length > 0
                  ? `${text.trim().length.toLocaleString()} characters`
                  : 'Required — minimum a few sentences for best results'}
              </p>
            </div>

            {/* Error */}
            {generateError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
                {generateError.message}
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!canGenerate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {batchMode ? 'Generate Scenarios' : 'Generate Scenario'}
                  </>
                )}
              </button>
              {isGenerating && (
                <p className="text-xs text-text-secondary">
                  This may take 10–20 seconds while the LLM processes your text.
                </p>
              )}
            </div>
          </form>

          {/* Right: step hint (desktop only, shown before generation) */}
          {!generated && !isGenerating && (
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  How it works
                </h3>
                <ol className="space-y-2.5">
                  {[
                    'Paste clinical text from an SOP, guideline, or protocol',
                    'Optionally add a name and category',
                    'Click Generate — the LLM builds a structured scenario',
                    'Review the preview, then Save & Use',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                        {i + 1}
                      </span>
                      <span className="text-xs text-text-secondary leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          )}
        </div>

        {/* Loading state */}
        {isGenerating && (
          <div className="mt-8 rounded-lg border border-border bg-card p-10 flex flex-col items-center justify-center gap-4 text-center">
            <div className="relative">
              <Sparkles className="w-8 h-8 text-accent/30" />
              <Loader2 className="w-8 h-8 animate-spin text-accent absolute inset-0" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Generating scenario...</p>
              <p className="text-xs text-text-secondary mt-1">
                Analyzing clinical text and building rubric criteria. This usually takes 10–20
                seconds.
              </p>
            </div>
          </div>
        )}

        {/* Generated preview (single mode) */}
        {generated && !isGenerating && !batchMode && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <ChevronRight className="w-4 h-4 text-text-secondary" />
              <h2 className="text-sm font-semibold text-text-primary">Preview</h2>
            </div>
            <ScenarioPreview scenario={generated} onSave={handleSave} isSaving={false} />
          </div>
        )}

        {/* Batch results */}
        {batchGenerated && !isGenerating && batchMode && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-text-secondary" />
                <h2 className="text-sm font-semibold text-text-primary">
                  {batchGenerated.length} Scenarios Generated
                </h2>
              </div>
              <button
                type="button"
                onClick={handleBatchSave}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                <Save className="w-4 h-4" />
                View All Scenarios
              </button>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider">Criteria</th>
                  </tr>
                </thead>
                <tbody>
                  {batchGenerated.map((s) => (
                    <tr
                      key={s.id || s.scenario_id}
                      className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/scenarios/${s.id || s.scenario_id}`)}
                    >
                      <td className="px-5 py-3.5 text-sm font-medium text-text-primary">{s.name}</td>
                      <td className="px-5 py-3.5 text-sm text-text-secondary capitalize">
                        {s.content?.test_type ? String(s.content.test_type).replace(/_/g, ' ') : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-text-secondary text-right">
                        {Array.isArray(s.rubric_criteria) ? s.rubric_criteria.length : 0}
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
