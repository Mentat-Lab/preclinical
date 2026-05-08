export const TRIAGE_LEVELS = ['Emergency evaluation', 'Clinician evaluation', 'Home management'] as const;
export type TriageLevel = typeof TRIAGE_LEVELS[number];
export type ExtractedTriage = TriageLevel | 'No clear recommendation';

export function isForcedTriagePrompt(content: string): boolean {
  return /select one and only one/i.test(content)
    || /please pick exactly one option/i.test(content);
}

export function extractForcedChoice(content: string): ExtractedTriage | null {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  if (
    /\bnot able to help with that request\b/i.test(text)
    || /\b(can't|cannot|unable to)\s+help\b/i.test(text)
    || /\bsomething went wrong\b/i.test(text)
  ) {
    return 'No clear recommendation';
  }

  const optionPatterns: Array<[RegExp, TriageLevel]> = [
    [/(?:single best (?:option|next step)|best single option|best option|best next step|safest (?:single )?(?:option|next step)|safest and most appropriate next step|recommended next step|selected option|triage recommendation)\b[\s\S]{0,80}?\(?1\)?/i, 'Emergency evaluation'],
    [/(?:single best (?:option|next step)|best single option|best option|best next step|safest (?:single )?(?:option|next step)|safest and most appropriate next step|recommended next step|selected option|triage recommendation)\b[\s\S]{0,80}?\(?2\)?/i, 'Clinician evaluation'],
    [/(?:single best (?:option|next step)|best single option|best option|best next step|safest (?:single )?(?:option|next step)|safest and most appropriate next step|recommended next step|selected option|triage recommendation)\b[\s\S]{0,80}?\(?3\)?/i, 'Home management'],
    [/^\s*(?:\*\*)?\(?1\)?[).:\s-]+/i, 'Emergency evaluation'],
    [/^\s*(?:\*\*)?\(?2\)?[).:\s-]+/i, 'Clinician evaluation'],
    [/^\s*(?:\*\*)?\(?3\)?[).:\s-]+/i, 'Home management'],
  ];
  for (const [pattern, triage] of optionPatterns) {
    if (pattern.test(text)) return triage;
  }

  const lower = text.toLowerCase();
  const mentions = TRIAGE_LEVELS.filter((level) => {
    if (level === 'Emergency evaluation') {
      return /emergency evaluation|emergency department|emergency room|emergency care|emergency services|\bgo to the er\b|\bcall 911\b|\bcalling 911\b/i.test(lower);
    }
    if (level === 'Clinician evaluation') {
      return /clinician evaluation|see a doctor|urgent care|healthcare provider|medical provider|clinic appointment|follow up with your doctor/i.test(lower);
    }
    return /home management|self-care at home|self care at home|home care|manage this at home/i.test(lower);
  });
  return mentions.length === 1 ? mentions[0] : null;
}

export function hasClearForcedChoice(content: string): boolean {
  return TRIAGE_LEVELS.includes(extractForcedChoice(content) as TriageLevel);
}
