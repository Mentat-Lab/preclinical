// Shared helpers for scenario UI components

export interface RubricCriterion {
  criterion?: string;
  name?: string;
  points?: number;
  tags?: string[];
}

export function tagColor(tag: string): string {
  if (tag.startsWith('axis:')) {
    const axis = tag.slice(5);
    if (axis === 'accuracy') return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
    if (axis === 'safety') return 'bg-red-500/10 text-red-500 border border-red-500/20';
    if (axis === 'empathy') return 'bg-purple-500/10 text-purple-500 border border-purple-500/20';
    if (axis === 'efficiency') return 'bg-green-500/10 text-green-500 border border-green-500/20';
  }
  if (tag.startsWith('level:')) return 'bg-orange-500/10 text-orange-500 border border-orange-500/20';
  return 'bg-muted text-text-secondary border border-border';
}

export function tagLabel(tag: string): string {
  const idx = tag.indexOf(':');
  if (idx === -1) return tag;
  const after = tag.slice(idx + 1);
  return after.length > 24 ? after.slice(0, 22) + '\u2026' : after;
}

export const inputCls =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50';

export const SCENARIO_TYPES = ['full', 'demo', 'custom'] as const;
export const TEST_TYPES = ['emergency_referral', 'care_navigation', 'medication_management', 'general_triage'] as const;
