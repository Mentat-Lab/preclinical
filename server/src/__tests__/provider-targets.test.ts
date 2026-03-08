import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
const providersIndexPath = path.join(repoRoot, 'server/src/providers/index.ts');
const targetsRegistryPath = path.join(repoRoot, 'target-agents/registry.json');

function readProviderNamesFromRegistry(): string[] {
  const content = readFileSync(providersIndexPath, 'utf8');
  const matches = [...content.matchAll(/import '\.\/([a-z0-9-]+)\.js';/g)];
  return matches.map((m) => m[1]);
}

describe('provider target-agent coverage', () => {
  it('every registered provider has a target-agent mapping in target-agents/registry.json', () => {
    const providers = readProviderNamesFromRegistry();
    const registry = JSON.parse(readFileSync(targetsRegistryPath, 'utf8')) as Record<string, { path: string }>;
    const mappedProviders = Object.keys(registry);

    expect(mappedProviders.sort()).toEqual(providers.sort());
  });

  it('every registry path exists on disk under target-agents/', () => {
    const registry = JSON.parse(readFileSync(targetsRegistryPath, 'utf8')) as Record<string, { path: string }>;

    for (const [provider, entry] of Object.entries(registry)) {
      const targetPath = path.join(repoRoot, 'target-agents', entry.path);
      expect(existsSync(targetPath), `Missing target agent for provider '${provider}' at ${targetPath}`).toBe(true);
    }
  });
});
