import { cn } from '@/lib/utils';
import { tagColor, tagLabel, type RubricCriterion } from '@/lib/scenario-helpers';
import { CheckCircle } from 'lucide-react';

export function RubricTable({ rubric }: { rubric: RubricCriterion[] }) {
  if (rubric.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-text-secondary">
        No criteria defined
      </div>
    );
  }

  return (
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
                <span>{row.criterion ?? row.name ?? '\u2014'}</span>
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
                        tagColor(tag),
                      )}
                      title={tag}
                    >
                      {tagLabel(tag)}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-text-secondary">{'\u2014'}</span>
                )}
              </div>
            </td>
            <td className="px-5 py-3 text-right text-sm text-text-primary">
              {row.points ?? '\u2014'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
