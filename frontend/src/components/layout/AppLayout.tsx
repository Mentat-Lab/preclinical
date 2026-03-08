import { Outlet } from 'react-router-dom';
import { AgentSidebar } from './AgentSidebar';

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <AgentSidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
