import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgent, queryKeys } from '@/hooks/use-queries';
import * as api from '@/lib/api';
import {
  PROVIDER_NAMES,
  PROVIDER_FIELDS,
  applyProviderDefaults,
  validateProviderConfig,
} from '@/lib/provider-config';
import { ProviderConfigFields } from '@/components/agents/ProviderConfigFields';
import { inputCls } from '@/lib/scenario-helpers';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AgentEditPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: agent, isLoading, error: loadError } = useAgent(agentId!);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [editedConfigKeys, setEditedConfigKeys] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ ok: boolean; error: string | null } | null>(null);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setDescription(agent.description ?? '');
      // Handle config that may be a JSON string (double-encoded) or object
      let cfg = agent.config ?? {};
      if (typeof cfg === 'string') {
        try { cfg = JSON.parse(cfg); } catch { cfg = {}; }
      }
      setConfig(applyProviderDefaults(agent.provider, cfg as Record<string, string>));
    }
  }, [agent]);

  const validateMutation = useMutation({
    mutationFn: () => api.validateBrowserAgent(agentId!),
    onSuccess: (result) => setValidationResult(result),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; config?: Record<string, string> }) =>
      api.updateAgent(agentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agent(agentId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
      navigate(`/agents/${agentId}`);
    },
  });

  // Whether browser config fields were changed (require re-validation before save)
  const browserConfigDirty = agent?.provider === 'browser' &&
    (editedConfigKeys.has('url') || editedConfigKeys.has('profile_id'));
  const needsValidation = browserConfigDirty && !validationResult?.ok;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Agent name is required');
      return;
    }

    if (needsValidation) {
      setFormError('Please validate the browser profile before saving.');
      return;
    }

    let normalizedConfig = config;
    if (agent?.provider) {
      normalizedConfig = applyProviderDefaults(agent.provider, config);
      setConfig(normalizedConfig);
      const configError = validateProviderConfig(agent.provider, normalizedConfig);
      if (configError) {
        setFormError(configError);
        return;
      }
    }

    // Only send config fields the user actually edited (to avoid sending masked values back)
    const cleanConfig: Record<string, string> = {};
    for (const [k, v] of Object.entries(normalizedConfig)) {
      if (editedConfigKeys.has(k)) {
        cleanConfig[k] = v;
      }
    }
    if (agent?.provider === 'openai') {
      cleanConfig.target_model = normalizedConfig.target_model;
      cleanConfig.base_url = normalizedConfig.base_url;
    }

    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      config: editedConfigKeys.size > 0 || agent?.provider === 'openai' ? cleanConfig : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-secondary">Loading agent...</p>
      </div>
    );
  }

  if (loadError || !agent) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary mb-4">Agent not found</p>
          <Link to="/agents" className="text-sm text-accent underline">
            Back to agents
          </Link>
        </div>
      </div>
    );
  }

  const fields = PROVIDER_FIELDS[agent.provider] ?? [];
  const displayError =
    formError ??
    (updateMutation.isError && updateMutation.error instanceof Error
      ? updateMutation.error.message
      : null);
  const submitting = updateMutation.isPending;

  return (
    <div className="flex-1 min-h-screen bg-background">
      <header className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-semibold text-text-primary mb-1">Edit Agent</h1>
        <p className="text-sm text-text-secondary">Update agent configuration</p>
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

            {/* Provider (read-only) */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">Provider</label>
              <div className="px-3 py-2 text-sm rounded-md border border-border bg-muted text-text-secondary">
                {PROVIDER_NAMES[agent.provider] ?? agent.provider}
              </div>
              <p className="text-xs text-text-secondary">Provider cannot be changed after creation</p>
              {agent.provider === 'browser' && (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-text-secondary">
                  Browser agents use Browser Use Cloud. Keep the same <code className="rounded bg-muted px-1 py-0.5">profile_id</code> to reuse auth state across runs.
                </div>
              )}
            </div>

            {/* Provider-specific config */}
            {fields.length > 0 && (
              <ProviderConfigFields
                fields={fields}
                config={config}
                onConfigChange={(key, value) => {
                  setConfig((prev) => ({ ...prev, [key]: value }));
                  setEditedConfigKeys((prev) => new Set(prev).add(key));
                  if (agent.provider === 'browser' && (key === 'url' || key === 'profile_id')) {
                    setValidationResult(null);
                  }
                }}
                disabled={submitting}
              />
            )}

            {/* Browser profile validation — only shown when url or profile_id changed */}
            {agent.provider === 'browser' && browserConfigDirty && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setValidationResult(null);
                    validateMutation.mutate();
                  }}
                  disabled={validateMutation.isPending || submitting}
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
                to={`/agents/${agentId}`}
                className="px-4 py-2 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
