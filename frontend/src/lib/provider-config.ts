import type { AgentProvider } from './types';

export const PROVIDER_NAMES: Record<AgentProvider, string> = {
  vapi: 'Vapi',
  livekit: 'LiveKit',
  pipecat: 'Pipecat',
  openai: 'OpenAI Compatible API',
  browser: 'Browser Use Cloud',
  elevenlabs: 'ElevenLabs',
};

export interface ProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  hint?: string;
  hintLink?: { label: string; url: string };
  /** Only show this field when config[showWhen.key] === showWhen.value */
  showWhen?: { key: string; value: string };
}

export interface ProviderReadiness {
  stage: 'recommended' | 'advanced';
  badge: string;
  summary: string;
  setupNotes: string;
  selfServeLabel: string;
}

export const PROVIDER_FIELDS: Record<AgentProvider, ProviderField[]> = {
  vapi: [
    { key: 'assistant_id', label: 'Assistant ID', type: 'text', placeholder: 'asst_...', required: true },
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'vapi_...', required: true },
    { key: 'api_base', label: 'API Base URL', type: 'text', placeholder: 'https://api.vapi.ai' },
    { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', placeholder: 'Optional' },
  ],
  openai: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    { key: 'target_model', label: 'Model', type: 'text', placeholder: 'gpt-4o', required: true },
    { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1' },
    { key: 'system_prompt', label: 'System Prompt Override', type: 'text', placeholder: 'Optional' },
  ],
  livekit: [
    { key: 'url', label: 'LiveKit Server URL', type: 'text', placeholder: 'wss://...', required: true },
    { key: 'api_key', label: 'API Key', type: 'text', placeholder: 'APIxxxxxxxx', required: true },
    { key: 'api_secret', label: 'API Secret', type: 'password', placeholder: '...', required: true },
    { key: 'agent_name', label: 'Agent Name', type: 'text', placeholder: 'my-agent' },
  ],
  pipecat: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'pc_...', required: true },
    { key: 'agent_name', label: 'Agent Name', type: 'text', placeholder: 'my-pipecat-agent', required: true },
    { key: 'base_url', label: 'Base URL', type: 'text', placeholder: 'https://api.pipecat.daily.co' },
    {
      key: 'transport',
      label: 'Transport',
      type: 'select',
      options: [
        { label: 'LiveKit', value: 'livekit' },
        { label: 'Daily (requires Python worker)', value: 'daily' },
      ],
    },
  ],
  browser: [
    { key: 'url', label: 'Target URL', type: 'text', placeholder: 'https://example.com/chat', required: true },
    {
      key: 'profile_id',
      label: 'Browser Use Profile ID',
      type: 'text',
      placeholder: 'prof_...',
      required: true,
      hint: 'Required for authenticated access. Create a profile in Browser Use Cloud to persist login state.',
      hintLink: { label: 'Create Profile', url: 'https://cloud.browser-use.com/settings?tab=profiles' },
    },
    {
      key: 'instructions',
      label: 'Additional Instructions',
      type: 'text',
      placeholder: 'Optional - e.g. "Click the Patient Chat tab first"',
      hint: 'Use this for site-specific workflow hints that help Browser Use Cloud reach the chat surface.',
    },
  ],
  elevenlabs: [
    { key: 'agent_id', label: 'Agent ID', type: 'text', placeholder: 'agent_...', required: true },
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'xi_...', required: true },
    { key: 'api_base', label: 'API Base URL', type: 'text', placeholder: 'https://api.elevenlabs.io' },
  ],
};

export const PROVIDER_DEFAULTS: Partial<Record<AgentProvider, Record<string, string>>> = {
  pipecat: { base_url: 'https://api.pipecat.daily.co', transport: 'livekit' },
  openai: { target_model: 'gpt-4o', base_url: 'https://api.openai.com/v1' },
  vapi: { api_base: 'https://api.vapi.ai' },
  elevenlabs: { api_base: 'https://api.elevenlabs.io' },
};

export const PROVIDER_READINESS: Record<AgentProvider, ProviderReadiness> = {
  openai: {
    stage: 'recommended',
    badge: 'Recommended',
    summary: 'Best path for self-serve pilots and API-backed assistants.',
    setupNotes: 'Customers only need their API key, model name, and optional compatible base URL.',
    selfServeLabel: 'Self-serve ready',
  },
  vapi: {
    stage: 'recommended',
    badge: 'Recommended',
    summary: 'Good self-serve option when the customer already runs on Vapi.',
    setupNotes: 'Requires a Vapi Assistant ID and API key from the customer dashboard.',
    selfServeLabel: 'Self-serve ready',
  },
  browser: {
    stage: 'recommended',
    badge: 'Recommended',
    summary: 'Works for web chatbots through Browser Use Cloud with persistent profile state.',
    setupNotes: 'Provide the target URL, Browser Use Cloud API key, and an optional profile_id to reuse auth state across runs. No local Chrome or browser worker required.',
    selfServeLabel: 'Cloud setup',
  },
  livekit: {
    stage: 'advanced',
    badge: 'Advanced',
    summary: 'Useful for real-time voice or WebRTC agents, but setup is more operational.',
    setupNotes: 'Requires a LiveKit server URL, credentials, and transport-specific validation.',
    selfServeLabel: 'Guided setup recommended',
  },
  pipecat: {
    stage: 'advanced',
    badge: 'Advanced',
    summary: 'Supports Pipecat Cloud agents, but transport choices add more configuration risk.',
    setupNotes: 'Requires Pipecat credentials plus agent naming and transport alignment.',
    selfServeLabel: 'Guided setup recommended',
  },
  elevenlabs: {
    stage: 'recommended',
    badge: 'Recommended',
    summary: 'Good self-serve option for ElevenLabs Conversational AI voice agents.',
    setupNotes: 'Requires an Agent ID and API key from the ElevenLabs dashboard.',
    selfServeLabel: 'Self-serve ready',
  },
};

export function applyProviderDefaults(
  provider: AgentProvider,
  config: Record<string, string>,
): Record<string, string> {
  const merged = {
    ...(PROVIDER_DEFAULTS[provider] ?? {}),
    ...config,
  };

  if (provider === 'openai') {
    if (!merged.target_model?.trim()) {
      merged.target_model = PROVIDER_DEFAULTS.openai?.target_model || 'gpt-4o';
    }
    if (!merged.base_url?.trim()) {
      merged.base_url = PROVIDER_DEFAULTS.openai?.base_url || 'https://api.openai.com/v1';
    }
  }

  return merged;
}

export const PROVIDER_HELP: Record<AgentProvider, { title: string; help: string }> = {
  vapi: {
    title: 'Vapi Setup',
    help: 'Find your Assistant ID and API Key at dashboard.vapi.ai under Settings > API Keys.',
  },
  openai: {
    title: 'OpenAI Compatible API Setup',
    help: 'Find your API key at platform.openai.com/api-keys. Use the default base URL for OpenAI, or provide a custom one for compatible APIs.',
  },
  livekit: {
    title: 'LiveKit Setup',
    help: "You'll need your LiveKit Server URL (wss://...), API Key, and API Secret from your LiveKit Cloud dashboard or self-hosted instance.",
  },
  pipecat: {
    title: 'Pipecat Setup',
    help: "Find your API key in the Pipecat Cloud dashboard. You'll also need the agent name you want to test against.",
  },
  browser: {
    title: 'Browser Use Cloud Setup',
    help: 'Provide the target URL and Browser Use Cloud profile ID. The profile preserves auth/session state across repeated runs, so you do not need to rediscover login every time.',
  },
  elevenlabs: {
    title: 'ElevenLabs Setup',
    help: 'Find your Agent ID and API Key at elevenlabs.io in the Conversational AI section. The Agent ID is shown on the agent detail page.',
  },
};

export function validateProviderConfig(
  provider: AgentProvider,
  config: Record<string, string>,
): string | null {
  switch (provider) {
    case 'browser':
      if (!config.url?.trim()) return 'Target URL is required';
      if (!/^https?:\/\//i.test(config.url)) return 'Target URL must start with http:// or https://';
      if (!config.profile_id?.trim()) return 'Browser Use Profile ID is required. Create one at cloud.browser-use.com/settings?tab=profiles';
      break;
    case 'pipecat':
      if (!config.api_key?.trim()) return 'Pipecat API key is required';
      if (!config.agent_name?.trim()) return 'Pipecat agent name is required';
      break;
    case 'vapi':
      if (!config.assistant_id?.trim()) return 'Vapi Assistant ID is required';
      if (!config.api_key?.trim()) return 'Vapi API key is required';
      break;
    case 'livekit':
      if (!config.url?.trim()) return 'LiveKit Server URL is required';
      if (!config.api_key?.trim()) return 'LiveKit API key is required';
      if (!config.api_secret?.trim()) return 'LiveKit API secret is required';
      break;
    case 'openai':
      if (!config.api_key?.trim()) return 'API key is required';
      break;
    case 'elevenlabs':
      if (!config.agent_id?.trim()) return 'ElevenLabs Agent ID is required';
      if (!config.api_key?.trim()) return 'ElevenLabs API key is required';
      break;
  }
  return null;
}
