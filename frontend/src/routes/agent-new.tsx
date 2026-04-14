import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { AgentProvider } from '@/lib/types';
import { queryKeys } from '@/hooks/use-queries';
import {
  PROVIDER_NAMES,
  PROVIDER_FIELDS,
  PROVIDER_DEFAULTS,
  PROVIDER_HELP,
  PROVIDER_READINESS,
  applyProviderDefaults,
  validateProviderConfig,
} from '@/lib/provider-config';
import { Check, Info, ShieldCheck, Loader2 } from 'lucide-react';
import { ProviderIcon } from '@/components/ProviderIcon';
import { cn } from '@/lib/utils';
import { ProviderConfigFields } from '@/components/agents/ProviderConfigFields';
import { inputCls } from '@/lib/scenario-helpers';

const providerCards: AgentProvider[] = ['vapi', 'livekit', 'pipecat', 'openai', 'browser', 'elevenlabs'];

export default function NewAgentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<AgentProvider | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPasswordFields, setShowPasswordFields] = useState<Record<string, boolean>>({});
  const [validationResult, setValidationResult] = useState<{ ok: boolean; error: string | null } | null>(null);

  const handleProviderChange = (newProvider: AgentProvider) => {
    setProvider(newProvider);
    setConfig(applyProviderDefaults(newProvider, PROVIDER_DEFAULTS[newProvider] ?? {}));
    setFormError(null);
    setShowPasswordFields({});
    setValidationResult(null);
  };

  const validateMutation = useMutation({
    mutationFn: () => api.validateBrowserProfile({
      url: config.url?.trim() || '',
      profile_id: config.profile_id?.trim() || '',
    }),
    onSuccess: (result) => setValidationResult(result),
  });

  const createMutation = useMutation({
    mutationFn: (payloadConfig: Record<string, string>) => {
      if (!provider) throw new Error('Please select a provider');
      return api.createAgent({
        provider,
        name: name.trim(),
        description: description.trim() || undefined,
        config: payloadConfig,
      });
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
      navigate(`/agents/${agent.id}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Agent name is required');
      return;
    }

    if (!provider) {
      setFormError('Please select a provider');
      return;
    }

    const normalizedConfig = applyProviderDefaults(provider, config);
    const configError = validateProviderConfig(provider, normalizedConfig);
    if (configError) {
      setFormError(configError);
      return;
    }

    // For browser agents, validate the profile before creating (skip if already validated)
    if (provider === 'browser' && !validationResult?.ok) {
      try {
        const result = await validateMutation.mutateAsync();
        if (!result.ok) {
          setFormError(result.error || 'Browser profile validation failed. Check your profile ID and URL.');
          return;
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Profile validation failed');
        return;
      }
    }

    setConfig(normalizedConfig);
    createMutation.mutate(normalizedConfig);
  };

  const fields = provider ? PROVIDER_FIELDS[provider] : [];
  const help = provider ? PROVIDER_HELP[provider] : null;
  const displayError =
    formError ??
    (createMutation.isError && createMutation.error instanceof Error
      ? createMutation.error.message
      : null);
  const submitting = createMutation.isPending || (provider === 'browser' && validateMutation.isPending);

  return (
    <div className="flex-1 min-h-screen bg-background">
      <header className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">Create Agent</h1>
        <p className="text-sm text-text-secondary">Configure a new agent to run tests against</p>
      </header>

      <main className="px-8 py-6">
        <form onSubmit={handleSubmit} className="max-w-2xl">
          {displayError && (
            <div className="sticky top-0 z-10 mb-4 p-3 rounded bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {displayError}
            </div>
          )}
          <div className="rounded-lg border border-border bg-card p-6 space-y-6">

            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">
                Agent Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Healthcare Triage Bot"
                disabled={submitting}
                className={inputCls}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Triage chatbot for emergency symptom assessment"
                disabled={submitting}
                className={inputCls}
              />
            </div>

            {/* Provider */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-primary">
                Provider <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {providerCards.map((p) => {
                  const selected = provider === p;
                  const readiness = PROVIDER_READINESS[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleProviderChange(p)}
                      disabled={submitting}
                      className={cn(
                        'relative rounded-lg border-2 bg-card p-5 flex flex-col items-center justify-center gap-3 transition-colors',
                        'hover:bg-muted/40 disabled:opacity-50',
                        selected ? 'border-primary' : 'border-border'
                      )}
                    >
                      <div
                        className={cn(
                          'h-12 w-12 rounded-full flex items-center justify-center',
                          selected ? 'bg-primary/10 text-primary' : 'bg-muted text-text-secondary'
                        )}
                      >
                        <ProviderIcon provider={p} className="h-7 w-7" />
                      </div>
                      <span className={cn('text-sm font-medium', selected ? 'text-primary' : 'text-text-primary')}>
                        {PROVIDER_NAMES[p]}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          readiness.stage === 'recommended'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {readiness.badge}
                      </span>
                      {selected && (
                        <span className="absolute top-2 right-2 text-primary">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Provider help callout */}
            {provider && help && (
              <div className="flex items-start gap-3 rounded-lg bg-primary/5 border border-primary/20 p-4">
                <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-text-primary">{help.title}</p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        PROVIDER_READINESS[provider].stage === 'recommended'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {PROVIDER_READINESS[provider].selfServeLabel}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5">{help.help}</p>
                  <p className="text-xs text-text-secondary mt-2">{PROVIDER_READINESS[provider].setupNotes}</p>
                </div>
              </div>
            )}

            {/* Provider-specific config */}
            {provider && fields.length > 0 && (
              <ProviderConfigFields
                fields={fields}
                config={config}
                onConfigChange={(key, value) => {
                  setConfig((prev) => ({ ...prev, [key]: value }));
                  if (provider === 'browser' && (key === 'url' || key === 'profile_id')) {
                    setValidationResult(null);
                  }
                }}
                disabled={submitting}
                showPasswordToggle
                showPasswordFields={showPasswordFields}
                onTogglePassword={(key) =>
                  setShowPasswordFields((prev) => ({ ...prev, [key]: !prev[key] }))
                }
              />
            )}

            {/* Browser profile validation */}
            {provider === 'browser' && config.url?.trim() && config.profile_id?.trim() && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setValidationResult(null);
                    validateMutation.mutate();
                  }}
                  disabled={validateMutation.isPending}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary disabled:opacity-50"
                >
                  {validateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {validateMutation.isPending ? 'Validating...' : 'Validate Profile'}
                </button>
                {validationResult && (
                  <div className={cn(
                    'p-3 rounded text-sm border',
                    validationResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-destructive/10 border-destructive/20 text-destructive',
                  )}>
                    {validationResult.ok
                      ? 'Profile validated — chat surface is accessible.'
                      : validationResult.error || 'Validation failed.'}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Link
                to="/agents"
                className="px-4 py-2 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {validateMutation.isPending
                  ? 'Validating...'
                  : createMutation.isPending
                    ? 'Creating...'
                    : 'Create Agent'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
