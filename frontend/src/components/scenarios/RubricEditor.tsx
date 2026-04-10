import { cn } from '@/lib/utils';
import { inputCls, type RubricCriterion } from '@/lib/scenario-helpers';
import { Plus, Trash2 } from 'lucide-react';

export function RubricEditor({
  rubric,
  onChange,
}: {
  rubric: RubricCriterion[];
  onChange: (rubric: RubricCriterion[]) => void;
}) {
  function updateCriterion(i: number, patch: Partial<RubricCriterion>) {
    onChange(rubric.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeCriterion(i: number) {
    onChange(rubric.filter((_, idx) => idx !== i));
  }

  function addCriterion() {
    onChange([...rubric, { criterion: '', points: 3, tags: [] }]);
  }

  return (
    <div className="divide-y divide-border">
      {rubric.map((row, i) => (
        <div key={i} className="px-5 py-3 space-y-2">
          <div className="flex items-start gap-3">
            <span className="text-xs text-text-secondary mt-2.5 w-4 shrink-0">
              {i + 1}.
            </span>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={row.criterion ?? row.name ?? ''}
                onChange={(e) => updateCriterion(i, { criterion: e.target.value })}
                placeholder="Specific, observable behaviour..."
                className={inputCls}
              />
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-text-secondary">Points</label>
                  <select
                    value={row.points ?? 3}
                    onChange={(e) =>
                      updateCriterion(i, { points: parseInt(e.target.value) })
                    }
                    className="px-2 py-1 text-sm rounded border border-border bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 appearance-none"
                  >
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 flex-1">
                  <label className="text-xs text-text-secondary">Tags</label>
                  <input
                    type="text"
                    value={(row.tags ?? []).join(', ')}
                    onChange={(e) =>
                      updateCriterion(i, {
                        tags: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="axis:accuracy, ..."
                    className={cn(inputCls, 'flex-1')}
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeCriterion(i)}
              className="mt-2 p-1 rounded hover:bg-red-500/10 text-text-secondary hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      <div className="px-5 py-3">
        <button
          type="button"
          onClick={addCriterion}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-dashed border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Criterion
        </button>
      </div>
    </div>
  );
}
