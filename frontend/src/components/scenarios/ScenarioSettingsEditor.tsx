import { useState } from 'react';
import { cn } from '@/lib/utils';
import { inputCls, SCENARIO_TYPES } from '@/lib/scenario-helpers';
import { X } from 'lucide-react';

interface ScenarioSettingsEditorProps {
  category: string;
  onCategoryChange: (v: string) => void;
  scenarioType: string;
  onScenarioTypeChange: (v: string) => void;
  priority: string;
  onPriorityChange: (v: string) => void;
  isActive: boolean;
  onIsActiveChange: (v: boolean) => void;
  approved: boolean;
  onApprovedChange: (v: boolean) => void;
  tags: string[];
  onTagsChange: (v: string[]) => void;
}

export function ScenarioSettingsEditor({
  category,
  onCategoryChange,
  scenarioType,
  onScenarioTypeChange,
  priority,
  onPriorityChange,
  isActive,
  onIsActiveChange,
  approved,
  onApprovedChange,
  tags,
  onTagsChange,
}: ScenarioSettingsEditorProps) {
  const [tagInput, setTagInput] = useState('');

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !tags.includes(t)) onTagsChange([...tags, t]);
    setTagInput('');
  }

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Scenario Settings
        </h2>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              placeholder="e.g. cardiac, dental"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Scenario Type</label>
            <select
              value={scenarioType}
              onChange={(e) => onScenarioTypeChange(e.target.value)}
              className={cn(inputCls, 'appearance-none')}
            >
              {SCENARIO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => onPriorityChange(e.target.value)}
              placeholder="None"
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => onIsActiveChange(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-primary">Active</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => onApprovedChange(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-primary">Approved</span>
          </label>
        </div>
        {/* Tags */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Tags</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag..."
              className={cn(inputCls, 'flex-1')}
            />
            <button
              type="button"
              onClick={addTag}
              disabled={!tagInput.trim()}
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
                    onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
                    className="hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
