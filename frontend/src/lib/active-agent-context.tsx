import { createContext, useContext, useState, type ReactNode } from 'react';

const ActiveAgentContext = createContext<{
  activeAgentId: string | null;
  setActiveAgentId: (id: string | null) => void;
}>({ activeAgentId: null, setActiveAgentId: () => {} });

export function ActiveAgentProvider({ children }: { children: ReactNode }) {
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  return (
    <ActiveAgentContext.Provider value={{ activeAgentId, setActiveAgentId }}>
      {children}
    </ActiveAgentContext.Provider>
  );
}

export function useActiveAgent() {
  return useContext(ActiveAgentContext);
}
