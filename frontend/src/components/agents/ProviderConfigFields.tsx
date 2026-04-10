import { Eye, EyeOff, ExternalLink } from 'lucide-react';
import type { ProviderField } from '@/lib/provider-config';

export const inputCls =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50';

interface ProviderConfigFieldsProps {
  fields: ProviderField[];
  config: Record<string, string>;
  onConfigChange: (key: string, value: string) => void;
  disabled?: boolean;
  /** Show password toggle (eye icon). When false, password fields render as plain password inputs. */
  showPasswordToggle?: boolean;
  showPasswordFields?: Record<string, boolean>;
  onTogglePassword?: (key: string) => void;
  /** Called for each field to allow custom rendering (e.g. browserbase context setup). Return a ReactNode to override, or null/undefined to use default. */
  renderFieldOverride?: (field: ProviderField) => React.ReactNode | null | undefined;
}

export function ProviderConfigFields({
  fields,
  config,
  onConfigChange,
  disabled = false,
  showPasswordToggle = false,
  showPasswordFields = {},
  onTogglePassword,
  renderFieldOverride,
}: ProviderConfigFieldsProps) {
  return (
    <div className="border-t border-border pt-6 space-y-4">
      <h3 className="text-sm font-medium text-text-primary">Configuration</h3>
      {fields.map((field) => {
        // Conditional visibility
        if (field.showWhen && config[field.showWhen.key] !== field.showWhen.value) {
          return null;
        }

        // Allow parent to override specific field rendering
        if (renderFieldOverride) {
          const override = renderFieldOverride(field);
          if (override !== null && override !== undefined) {
            return override;
          }
        }

        return (
          <div key={field.key} className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.type === 'select' && field.options ? (
              <select
                value={config[field.key] ?? ''}
                onChange={(e) => onConfigChange(field.key, e.target.value)}
                disabled={disabled}
                className={inputCls}
              >
                <option value="">Select...</option>
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'password' && showPasswordToggle ? (
              <div className="relative">
                <input
                  type={showPasswordFields[field.key] ? 'text' : 'password'}
                  name={field.key}
                  id={`config-${field.key}`}
                  autoComplete="off"
                  value={config[field.key] ?? ''}
                  onChange={(e) => onConfigChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  disabled={disabled}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => onTogglePassword?.(field.key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  tabIndex={-1}
                >
                  {showPasswordFields[field.key] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            ) : (
              <input
                type={field.type === 'password' ? 'password' : 'text'}
                name={field.key}
                id={`config-${field.key}`}
                autoComplete="off"
                value={config[field.key] ?? ''}
                onChange={(e) => onConfigChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                className={inputCls}
              />
            )}
            {field.hint && (
              <p className="text-xs text-text-secondary mt-1">
                {field.hint}
                {field.hintLink && (
                  <>
                    {' '}
                    <a
                      href={field.hintLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-accent hover:underline"
                    >
                      {field.hintLink.label}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
