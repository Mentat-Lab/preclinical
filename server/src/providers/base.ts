/**
 * Provider interface and registry.
 *
 * Every agent provider (openai, livekit, browser, etc.) implements this
 * interface. The scenario runner is provider-agnostic — it just calls
 * connect → sendMessage (loop) → disconnect.
 *
 * Providers can be:
 *   - In-process TypeScript (openai, livekit, browser)
 *   - External HTTP workers in any language (daily-python, custom)
 *
 * To add a new provider:
 *   1. Create a file in src/providers/ implementing Provider
 *   2. Register it in src/providers/index.ts
 */

// =============================================================================
// INTERFACES
// =============================================================================

/** Opaque session state returned by connect(). Each provider defines its own shape. */
export interface ProviderSession {
  /** Provider name (e.g. 'openai', 'livekit') */
  provider: string;
  /** Provider-specific state — cast to the concrete type in provider methods */
  state: unknown;
}

/** Context passed to sendMessage for providers that need it. */
export interface MessageContext {
  turn: number;
  maxTurns: number;
  transcript: Array<{ turn: number; role: string; content: string }>;
  persona?: Record<string, unknown> | null;
}

/** The provider interface. Three methods, that's it. */
export interface Provider {
  /** Provider identifier (e.g. 'openai', 'livekit', 'browser') */
  name: string;

  /**
   * Initialize a session. Called once before the turn loop.
   * For stateless providers (openai, vapi), this can just stash the config.
   * For stateful providers (livekit, browser), this creates the connection/session.
   */
  connect(
    agentConfig: Record<string, unknown>,
    scenarioRunId: string,
  ): Promise<ProviderSession>;

  /**
   * Send a message and return the agent's response.
   * Called once per turn in the conversation loop.
   */
  sendMessage(
    session: ProviderSession,
    message: string,
    context: MessageContext,
  ): Promise<string>;

  /**
   * Clean up resources. Called after the turn loop (success or error).
   * For stateless providers, this is a no-op.
   */
  disconnect(session: ProviderSession): Promise<void>;
}

// =============================================================================
// REGISTRY
// =============================================================================

const providers = new Map<string, Provider>();

/** Register a provider. Call this from each provider module. */
export function registerProvider(provider: Provider): void {
  providers.set(provider.name, provider);
}

/** Get a registered provider by name. Throws if not found. */
export function getProvider(name: string): Provider {
  const provider = providers.get(name);
  if (!provider) {
    const available = Array.from(providers.keys()).join(', ');
    throw new Error(
      `Unknown provider: '${name}'. Available: ${available || 'none (no providers registered)'}`,
    );
  }
  return provider;
}

/** List all registered provider names. */
export function listProviders(): string[] {
  return Array.from(providers.keys());
}
