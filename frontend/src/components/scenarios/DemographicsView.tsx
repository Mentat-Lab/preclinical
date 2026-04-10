export function DemographicsView({
  demographics,
}: {
  demographics: Record<string, string> | string | undefined;
}) {
  if (!demographics) return null;

  return typeof demographics === 'object' ? (
    <div className="flex flex-wrap gap-3">
      {Object.entries(demographics).map(([key, val]) => (
        <div key={key} className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
          <span className="text-xs font-medium text-text-secondary capitalize">
            {key.replace(/_/g, ' ')}
          </span>
          <span className="text-sm font-semibold text-text-primary">{String(val)}</span>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-text-primary">{demographics}</p>
  );
}
