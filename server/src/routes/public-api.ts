import { Hono } from 'hono';
import agentRoutes from './agent-routes.js';
import runRoutes from './run-routes.js';
import scenarioRoutes from './scenario-routes.js';

const app = new Hono();

// Mount domain-specific route groups
app.route('/', agentRoutes);
app.route('/', runRoutes);
app.route('/', scenarioRoutes);

export default app;
