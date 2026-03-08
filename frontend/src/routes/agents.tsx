import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAgents } from '@/hooks/use-queries';
import type { Agent } from '@/lib/types';
import { PROVIDER_NAMES } from '@/lib/provider-config';
import { Plus, Bot } from 'lucide-react';

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <Link
      to={`/agents/${agent.id}`}
      className="flex items-center gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-muted/50 transition-colors group"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary group-hover:text-accent truncate">
          {agent.name}
        </p>
        {agent.description && (
          <p className="text-xs text-text-secondary truncate mt-0.5">{agent.description}</p>
        )}
      </div>
      <span className="flex-shrink-0 text-xs font-medium text-text-secondary bg-muted px-2 py-1 rounded">
        {PROVIDER_NAMES[agent.provider] ?? agent.provider}
      </span>
    </Link>
  );
}

export default function AgentsPage() {
  const navigate = useNavigate();
  const { data: agents, isLoading, error } = useAgents();

  // Mirror Next.js redirect-to-first-agent behaviour
  useEffect(() => {
    if (agents && agents.length > 0) {
      navigate(`/agents/${agents[0].id}`, { replace: true });
    }
  }, [agents, navigate]);

  if (isLoading) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center">
        <div className="space-y-3 w-full max-w-md">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <p className="text-sm text-destructive mb-4">Failed to load agents</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-text-secondary underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state — no agents yet (redirect hasn't fired)
  if (!agents || agents.length === 0) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary mb-3">No Agents Configured</h1>
          <p className="text-sm text-text-secondary mb-6">
            Create your first agent to start testing your healthcare AI.
          </p>
          <Link
            to="/agents/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Agent
          </Link>
        </div>
      </div>
    );
  }

  // Has agents — show the list while the redirect effect fires
  return (
    <div className="flex-1 min-h-screen bg-background">
      <header className="px-8 py-6 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Agents</h1>
          <p className="text-sm text-text-secondary mt-1">{agents.length} agent{agents.length !== 1 ? 's' : ''} configured</p>
        </div>
        <Link
          to="/agents/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Agent
        </Link>
      </header>

      <main className="px-8 py-6">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </div>
      </main>
    </div>
  );
}
