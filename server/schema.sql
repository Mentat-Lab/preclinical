-- =============================================================================
-- Healthcare AI Testing Platform — Database Schema
-- Compatible with postgres:16-alpine (plain psql, no Supabase extensions)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Agents
-- ---------------------------------------------------------------------------
CREATE TABLE agents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT        NOT NULL CHECK (provider IN (
                            'vapi', 'openai', 'livekit', 'pipecat', 'browser'
                          )),
  name        TEXT        NOT NULL,
  description TEXT,
  config      JSONB       NOT NULL DEFAULT '{}',
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_provider       ON agents(provider);
CREATE INDEX idx_agents_active         ON agents(id) WHERE deleted_at IS NULL AND is_active = TRUE;

-- ---------------------------------------------------------------------------
-- Browser Profiles — per-domain configuration for browser provider
-- ---------------------------------------------------------------------------
CREATE TABLE browser_profiles (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  domain              TEXT        UNIQUE NOT NULL,
  name                TEXT        NOT NULL DEFAULT '',
  requires_auth       BOOLEAN     NOT NULL DEFAULT FALSE,
  email_verification  BOOLEAN     NOT NULL DEFAULT FALSE,
  auth_domains        TEXT[]      NOT NULL DEFAULT '{}',
  credentials         JSONB       NOT NULL DEFAULT '{}',
  config              JSONB       NOT NULL DEFAULT '{}',
  login_actions       JSONB,      -- cached initial_actions for login replay (skip LLM on repeated runs)
  source              TEXT        NOT NULL DEFAULT 'manual',
  last_verified_at    TIMESTAMPTZ,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_browser_profiles_domain ON browser_profiles(domain);
CREATE INDEX idx_browser_profiles_active        ON browser_profiles(id) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- Scenarios
-- ---------------------------------------------------------------------------
-- content JSONB shape: { chief_complaint, demographics, sop_instructions, test_type }
-- rubric_criteria JSONB shape: [ { criterion, points, tags[] } ]
CREATE TABLE scenarios (
  scenario_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  category      TEXT,
  scenario_type TEXT        NOT NULL DEFAULT 'full' CHECK (scenario_type IN ('full', 'demo', 'custom')),
  content       JSONB       NOT NULL DEFAULT '{}',
  rubric_criteria JSONB     NOT NULL DEFAULT '[]',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  approved      BOOLEAN     NOT NULL DEFAULT TRUE,
  priority      INTEGER,
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenarios_active      ON scenarios(scenario_id) WHERE is_active = TRUE AND approved = TRUE;
CREATE INDEX idx_scenarios_type        ON scenarios(scenario_type) WHERE is_active = TRUE;
CREATE INDEX idx_scenarios_priority    ON scenarios(priority NULLS LAST) WHERE is_active = TRUE;
CREATE INDEX idx_scenarios_tags        ON scenarios USING GIN(tags);

-- ---------------------------------------------------------------------------
-- Test Suites
-- ---------------------------------------------------------------------------
CREATE TABLE test_suites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT,
  description  TEXT,
  scenario_ids UUID[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Test Runs
-- ---------------------------------------------------------------------------
CREATE TABLE test_runs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id           TEXT        UNIQUE,  -- human-readable, e.g. run_20240101120000_abc1
  test_suite_id         UUID        REFERENCES test_suites(id) ON DELETE SET NULL,
  agent_id              UUID        REFERENCES agents(id) ON DELETE SET NULL,
  agent_type            TEXT,
  agent_name            TEXT,
  name                  TEXT,
  status                TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','completed','failed','canceled','scheduled')),
  total_scenarios       INTEGER     NOT NULL DEFAULT 0,
  max_turns             INTEGER,
  concurrency_limit     INTEGER     NOT NULL DEFAULT 6,
  passed_count          INTEGER     NOT NULL DEFAULT 0,
  failed_count          INTEGER     NOT NULL DEFAULT 0,
  error_count           INTEGER     NOT NULL DEFAULT 0,
  pass_rate             REAL        NOT NULL DEFAULT 0,
  benchmark_mode        BOOLEAN     NOT NULL DEFAULT FALSE,
  creative_mode         BOOLEAN     NOT NULL DEFAULT FALSE,
  is_finalizing         BOOLEAN     NOT NULL DEFAULT FALSE,
  finalize_started_at   TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  canceled_at           TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_runs_agent_id     ON test_runs(agent_id);
CREATE INDEX idx_test_runs_test_suite   ON test_runs(test_suite_id);
CREATE INDEX idx_test_runs_status       ON test_runs(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_runs_created_at   ON test_runs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Scenario Runs
-- ---------------------------------------------------------------------------
CREATE TABLE scenario_runs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id         UUID        NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  scenario_id         UUID        NOT NULL REFERENCES scenarios(scenario_id),
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','grading','passed','failed','error','canceled')),
  transcript          JSONB       NOT NULL DEFAULT '[]',
  metadata            JSONB,
  error_code          TEXT,
  error_message       TEXT,
  last_heartbeat_at   TIMESTAMPTZ,
  duration_ms         INTEGER,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  canceled_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenario_runs_test_run_id  ON scenario_runs(test_run_id);
CREATE INDEX idx_scenario_runs_scenario_id  ON scenario_runs(scenario_id);
CREATE INDEX idx_scenario_runs_status       ON scenario_runs(status);
-- Partial index for in-progress scenarios (heartbeat polling)
CREATE INDEX idx_scenario_runs_heartbeat    ON scenario_runs(last_heartbeat_at)
  WHERE status IN ('running', 'grading');

-- ---------------------------------------------------------------------------
-- Gradings
-- ---------------------------------------------------------------------------
-- criteria_results JSONB shape: [ { criterion, points, max_points, passed, decision, rationale } ]
CREATE TABLE gradings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_run_id  UUID        NOT NULL REFERENCES scenario_runs(id) ON DELETE CASCADE,
  passed           BOOLEAN,
  total_points     REAL        NOT NULL DEFAULT 0,
  max_points       REAL        NOT NULL DEFAULT 0,
  score_percent    REAL        NOT NULL DEFAULT 0,
  summary          TEXT,
  criteria_results JSONB       NOT NULL DEFAULT '[]',
  triage_result    TEXT,          -- benchmark: extracted triage (Emergency/Clinician/Home care)
  gold_standard    TEXT,          -- benchmark: expected triage
  triage_correct   BOOLEAN,       -- benchmark: whether triage matches gold standard
  graded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gradings_scenario_run_latest ON gradings(scenario_run_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Test Run Events  (SSE / real-time feed)
-- ---------------------------------------------------------------------------
CREATE TABLE test_run_events (
  id           BIGSERIAL   PRIMARY KEY,
  test_run_id  UUID        NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_run_events_test_run_id ON test_run_events(test_run_id);
CREATE INDEX idx_test_run_events_created_at  ON test_run_events(created_at DESC);

-- NOTE: test_run_events grows unbounded. Schedule periodic cleanup:
-- DELETE FROM test_run_events WHERE created_at < NOW() - INTERVAL '30 days';

-- =============================================================================
-- Functions & Triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at auto-maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_agents
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_browser_profiles
  BEFORE UPDATE ON browser_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_scenarios
  BEFORE UPDATE ON scenarios
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_test_runs
  BEFORE UPDATE ON test_runs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- merge_agent_config RPC
-- Atomically merges a JSONB patch into agents.config using the || operator,
-- avoiding read-merge-write race conditions.
-- Usage: SELECT merge_agent_config('agent-uuid', '{"key":"value"}');
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_agent_config(
  p_agent_id  UUID,
  p_patch     JSONB
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE agents
  SET    config     = config || p_patch,
         updated_at = NOW()
  WHERE  id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent % not found', p_agent_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- NOTIFY trigger for SSE / real-time subscriptions
-- Fires on INSERT into test_run_events and publishes a pg_notify so the
-- server-sent-events layer can push incremental updates without polling.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_test_run_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'db_changes',
    json_build_object(
      'table',       'test_run_events',
      'event_type',  NEW.event_type,
      'test_run_id', NEW.test_run_id,
      'payload',     NEW.payload,
      'id',          NEW.id
    )::TEXT
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_test_run_event
  AFTER INSERT ON test_run_events
  FOR EACH ROW EXECUTE FUNCTION notify_test_run_event();

-- ---------------------------------------------------------------------------
-- NOTIFY trigger for scenario_runs status changes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_scenario_run_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'db_changes',
      json_build_object(
        'table',           'scenario_runs',
        'id',              NEW.id,
        'test_run_id',     NEW.test_run_id,
        'scenario_id',     NEW.scenario_id,
        'status',          NEW.status,
        'prev_status',     OLD.status
      )::TEXT
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_scenario_run_status
  AFTER UPDATE ON scenario_runs
  FOR EACH ROW EXECUTE FUNCTION notify_scenario_run_status();

-- ---------------------------------------------------------------------------
-- NOTIFY trigger for test_runs status changes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_test_run_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'db_changes',
      json_build_object(
        'table',       'test_runs',
        'id',          NEW.id,
        'test_run_id', NEW.test_run_id,
        'status',      NEW.status,
        'prev_status', OLD.status
      )::TEXT
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_on_test_run_status
  AFTER UPDATE ON test_runs
  FOR EACH ROW EXECUTE FUNCTION notify_test_run_status();

-- ---------------------------------------------------------------------------
-- Migrations (idempotent — safe to re-run on existing databases)
-- ---------------------------------------------------------------------------
ALTER TABLE browser_profiles ADD COLUMN IF NOT EXISTS login_actions JSONB;
