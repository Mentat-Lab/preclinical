import { Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';

// Pages
import DashboardPage from '@/routes/dashboard';
import AgentsPage from '@/routes/agents';
import AgentDetailPage from '@/routes/agent-detail';
import AgentEditPage from '@/routes/agent-edit';
import NewAgentPage from '@/routes/agent-new';
import NewRunPage from '@/routes/agent-new-run';
import TestRunPage from '@/routes/test-run';
import ScenarioRunPage from '@/routes/scenario-run';
import ScenariosPage from '@/routes/scenarios';
import ScenarioDetailPage from '@/routes/scenario-detail';
import ScenarioGeneratePage from '@/routes/scenario-generate';
import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <div className="flex-1 min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-text-primary">404</h1>
      <p className="text-text-secondary">Page not found</p>
      <Link to="/" className="text-sm text-accent hover:underline">Go to Dashboard</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/new" element={<NewAgentPage />} />
        <Route path="/agents/:agentId" element={<AgentDetailPage />} />
        <Route path="/agents/:agentId/edit" element={<AgentEditPage />} />
        <Route path="/agents/:agentId/new-run" element={<NewRunPage />} />
        <Route path="/test/:id" element={<TestRunPage />} />
        <Route path="/test/:id/scenario/:scenarioRunId" element={<ScenarioRunPage />} />
        <Route path="/scenarios" element={<ScenariosPage />} />
        <Route path="/scenarios/generate" element={<ScenarioGeneratePage />} />
        <Route path="/scenarios/:id" element={<ScenarioDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
