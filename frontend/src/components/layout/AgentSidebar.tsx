import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Loader2, PanelLeftClose, PanelLeftOpen, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgents } from '@/hooks/use-queries';
import { ProviderIcon } from '@/components/ProviderIcon';
import type { Agent, AgentProvider } from '@/lib/types';

const providerLabels: Record<AgentProvider, string> = {
  vapi: 'Vapi',
  livekit: 'LiveKit',
  pipecat: 'Pipecat',
  openai: 'OpenAI',
  browser: 'Browser',
};

const SIDEBAR_COLLAPSED_KEY = 'preclinical.sidebar.collapsed';

export function AgentSidebar() {
  const { data: agents = [], isLoading } = useAgents();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const pc = a.provider.localeCompare(b.provider);
        return pc !== 0 ? pc : a.name.localeCompare(b.name);
      }),
    [agents],
  );

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    } else if (window.matchMedia('(max-width: 1024px)').matches) {
      setIsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const isAgentActive = useCallback(
    (agentId: string) =>
      pathname === `/agents/${agentId}` || pathname.startsWith(`/agents/${agentId}/`),
    [pathname],
  );

  return (
    <aside
      className={cn(
        'h-screen sticky top-0 bg-sidebar-bg border-r border-border flex flex-col shrink-0 transition-[width] duration-200 ease-out',
        isCollapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      {/* Header */}
      <div className={cn('py-4', isCollapsed ? 'px-2' : 'px-4')}>
        {isCollapsed ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              title="Expand sidebar"
              className="h-8 w-8 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-border/30 flex items-center justify-center transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Link to="/" className="block text-base text-text-primary font-semibold truncate">
              Preclinical
            </Link>
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              title="Collapse sidebar"
              className="h-7 w-7 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-border/30 flex items-center justify-center transition-colors shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* New Agent */}
      <div className={cn('mb-4', isCollapsed ? 'px-2' : 'px-3')}>
        <Link
          to="/agents/new"
          title="New Agent"
          className={cn(
            'flex items-center w-full py-2 rounded text-sm font-medium transition-colors bg-accent text-white hover:bg-text-primary',
            isCollapsed ? 'justify-center px-0' : 'gap-2 px-3',
          )}
        >
          <Plus className="w-4 h-4" />
          {!isCollapsed && 'New Agent'}
        </Link>
      </div>

      <div className={cn('border-t border-border mb-3', isCollapsed ? 'mx-2' : 'mx-4')} />

      {!isCollapsed && (
        <div className="px-4 mb-2">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Agents
          </span>
        </div>
      )}

      {/* Agents List */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div
            className={cn(
              'py-2 text-sm text-text-secondary flex items-center',
              isCollapsed ? 'justify-center' : 'px-3 gap-2',
            )}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            {!isCollapsed && 'Loading...'}
          </div>
        ) : sortedAgents.length === 0 ? (
          <div className={cn('py-2 text-sm text-text-secondary', isCollapsed ? 'text-center' : 'px-3')}>
            {isCollapsed ? '\u2014' : 'No agents yet'}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {sortedAgents.map((agent) => {
              const active = isAgentActive(agent.id);
              return (
                <li key={agent.id}>
                  <Link
                    to={`/agents/${agent.id}`}
                    title={agent.name}
                    className={cn(
                      'flex items-center h-9 rounded text-sm transition-colors leading-tight',
                      isCollapsed ? 'justify-center' : 'gap-2 px-3',
                      active
                        ? 'bg-border/60 font-medium text-text-primary'
                        : 'text-text-primary hover:bg-border/30',
                    )}
                  >
                    <ProviderIcon provider={agent.provider} className="w-4 h-4" size={16} />
                    {!isCollapsed && <span className="truncate">{agent.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Bottom nav */}
      <div className={cn('py-3 border-t border-border space-y-1', isCollapsed ? 'px-2' : 'px-3')}>
        <Link
          to="/scenarios"
          title="Scenarios"
          className={cn(
            'flex items-center h-9 rounded text-sm transition-colors',
            isCollapsed ? 'justify-center' : 'gap-2 px-3',
            pathname.startsWith('/scenarios')
              ? 'bg-border/60 font-medium text-text-primary'
              : 'text-text-secondary hover:bg-border/30 hover:text-text-primary',
          )}
        >
          <BookOpen className="w-4 h-4" />
          {!isCollapsed && 'Scenarios'}
        </Link>
      </div>
    </aside>
  );
}
