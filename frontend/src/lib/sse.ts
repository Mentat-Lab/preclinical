import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Opens an SSE connection to `/events?run_id=<runId>` and invalidates
 * TanStack Query caches when the backend pushes DB-change notifications.
 *
 * Backend trigger payloads (from schema.sql PG NOTIFY triggers):
 *   test_runs:        { table, id, test_run_id, status, prev_status }
 *   scenario_runs:    { table, id, test_run_id, scenario_id, status, prev_status }
 *   test_run_events:  { table, event_type, test_run_id, payload, id }
 *
 * Note: there is no `gradings` trigger — grading completion surfaces as a
 * `scenario_runs` status change to 'passed', 'failed', or 'error'.
 *
 * @param runId       The test run UUID. Hook is a no-op when undefined.
 * @param scenarioRunId  Optional individual scenario-run UUID to also
 *                    invalidate (used when watching the scenario detail page).
 */
export function useRealtimeRun(
  runId: string | undefined,
  scenarioRunId?: string | undefined,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!runId) return;

    const es = new EventSource(`${API_BASE}/events?run_id=${runId}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as {
          type?: string;
          table?: string;
          id?: string;
          test_run_id?: string;
          scenario_id?: string;
          status?: string;
        };

        // Initial handshake — nothing to invalidate.
        if (data.type === 'connected') return;

        if (data.table === 'test_runs') {
          // The run-level record changed (status transition).
          queryClient.invalidateQueries({ queryKey: ['testRun', runId] });
          queryClient.invalidateQueries({ queryKey: ['testRuns'] });
        }

        if (data.table === 'scenario_runs') {
          // A child scenario changed status. Invalidate its list and the
          // parent run (so pass-rate / counts update). Also invalidate the
          // individual scenario-run detail query when it matches the open page.
          queryClient.invalidateQueries({ queryKey: ['scenarioRuns', runId] });
          queryClient.invalidateQueries({ queryKey: ['testRun', runId] });
          if (scenarioRunId && data.id === scenarioRunId) {
            queryClient.invalidateQueries({ queryKey: ['scenarioRun', scenarioRunId] });
          }
        }

        if (data.table === 'test_run_events') {
          // Per-turn progress event — refresh the scenario list so in-progress
          // rows update, and invalidate the individual scenario-run detail when
          // viewing that page.
          queryClient.invalidateQueries({ queryKey: ['scenarioRuns', runId] });
          if (scenarioRunId) {
            queryClient.invalidateQueries({ queryKey: ['scenarioRun', scenarioRunId] });
          }
        }
      } catch {
        // Silently ignore non-JSON frames (e.g. keep-alive pings).
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects — no manual handling needed.
    };

    return () => es.close();
  }, [runId, scenarioRunId, queryClient]);
}
