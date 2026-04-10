import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Monitor } from 'lucide-react';
import * as api from '@/lib/api';

// ---- Shared types ----

interface LocalAuthSetup {
  sessionId: string;
  domain: string;
}

// ---- Local Chrome auth setup (inline, for forms) ----

interface LocalChromeAuthFieldProps {
  url: string;
  /** Validate URL before starting setup. Return true if valid. */
  validateUrl: () => boolean;
}

export function LocalChromeAuthField({ url, validateUrl }: LocalChromeAuthFieldProps) {
  const [localAuthSetup, setLocalAuthSetup] = useState<LocalAuthSetup | null>(null);
  const [localAuthDone, setLocalAuthDone] = useState<string | null>(null);

  const setupMutation = useMutation({
    mutationFn: () => api.setupLocalChromeAuth(url),
    onSuccess: (data) => {
      setLocalAuthSetup({
        sessionId: data.session_id,
        domain: data.domain,
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeLocalChromeAuth(localAuthSetup!.sessionId),
    onSuccess: () => {
      setLocalAuthDone(localAuthSetup!.domain);
      setLocalAuthSetup(null);
    },
  });

  const handleSetup = () => {
    if (!validateUrl()) return;
    setupMutation.mutate();
  };

  if (localAuthSetup) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
        <p className="text-sm text-blue-800">
          Log in to <strong>{url}</strong> in the Chrome window on your machine, then click "Done".
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            {completeMutation.isPending ? 'Saving...' : 'Done'}
          </button>
          <button
            type="button"
            onClick={() => setLocalAuthSetup(null)}
            className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors"
          >
            Cancel
          </button>
        </div>
        {completeMutation.isError && (
          <p className="text-sm text-destructive">
            {completeMutation.error instanceof Error ? completeMutation.error.message : 'Failed'}
          </p>
        )}
      </div>
    );
  }

  if (localAuthDone) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700">
        <Check className="w-4 h-4" />
        Auth saved for {localAuthDone}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSetup}
        disabled={setupMutation.isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md bg-card hover:bg-muted transition-colors text-text-primary disabled:opacity-50"
      >
        <Monitor className="w-3.5 h-3.5" />
        {setupMutation.isPending ? 'Launching Chrome...' : 'Setup Auth'}
      </button>
      <p className="text-xs text-text-secondary mt-1.5">
        Opens a Chrome window on your machine so you can log in. Cookies are exported for test runs.
      </p>
      {setupMutation.isError && (
        <p className="text-sm text-destructive mt-1">
          {setupMutation.error instanceof Error ? setupMutation.error.message : 'Setup failed'}
        </p>
      )}
    </div>
  );
}

// ---- Detail page: Local Chrome auth panel (header-level, for existing agents) ----

interface LocalChromeAuthPanelHookProps {
  url: string;
}

export function useLocalChromeAuthPanel({ url }: LocalChromeAuthPanelHookProps) {
  const [localAuthSetup, setLocalAuthSetup] = useState<LocalAuthSetup | null>(null);
  const [localAuthDone, setLocalAuthDone] = useState<string | null>(null);

  const setupMutation = useMutation({
    mutationFn: () => api.setupLocalChromeAuth(url),
    onSuccess: (data) => {
      setLocalAuthSetup({
        sessionId: data.session_id,
        domain: data.domain,
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeLocalChromeAuth(localAuthSetup!.sessionId),
    onSuccess: () => {
      setLocalAuthDone(localAuthSetup!.domain);
      setLocalAuthSetup(null);
    },
  });

  return { localAuthSetup, setLocalAuthSetup, localAuthDone, setupMutation, completeMutation };
}

export function LocalChromeAuthPanel({
  url,
  completeMutation,
  onCancel,
}: {
  url: string;
  completeMutation: ReturnType<typeof useLocalChromeAuthPanel>['completeMutation'];
  onCancel: () => void;
}) {
  return (
    <div className="mx-8 mt-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
      <h3 className="text-sm font-semibold text-blue-900 mb-2">Local Chrome Auth Setup</h3>
      <p className="text-sm text-blue-800 mb-3">
        Log in to <strong>{url}</strong> in the Chrome window on your machine, then click "Done".
        Cookies will be exported for future test runs.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          {completeMutation.isPending ? 'Saving...' : 'Done — Export Cookies'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors"
        >
          Cancel
        </button>
      </div>
      {completeMutation.isError && (
        <p className="mt-2 text-sm text-destructive">
          {completeMutation.error instanceof Error ? completeMutation.error.message : 'Failed to export cookies'}
        </p>
      )}
    </div>
  );
}
