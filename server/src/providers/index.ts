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
import './api/openai.js';
import './api/vapi.js';
import './voice/livekit.js';
import './voice/pipecat.js';
import './browser/browser.js';
import './voice/elevenlabs.js';
