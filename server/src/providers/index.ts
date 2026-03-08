/**
 * Provider registry — import this to ensure all providers are registered.
 *
 * To add a new provider:
 *   1. Create src/providers/my-provider.ts implementing Provider
 *   2. Call registerProvider(myProvider) in that file
 *   3. Add an import here
 */

export { getProvider, listProviders, type Provider, type ProviderSession, type MessageContext } from './base.js';

// Import each provider to trigger registration
import './openai.js';
import './vapi.js';
import './livekit.js';
import './pipecat.js';
import './browser.js';
