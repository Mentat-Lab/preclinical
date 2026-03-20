// Summary breakdown types for test run charts
export interface BreakdownBucket {
  passed: number;
  failed: number;
  total: number;
}

export interface SummaryBreakdown {
  by_urgency: {
    emergent: BreakdownBucket;
    conditionally_emergent: BreakdownBucket;
    non_emergent: BreakdownBucket;
  };
  by_axis: {
    accuracy: BreakdownBucket;
    completeness: BreakdownBucket;
    context_awareness: BreakdownBucket;
  };
  by_severity: {
    HIGH: BreakdownBucket;
    MEDIUM: BreakdownBucket;
    LOW: BreakdownBucket;
  };
  by_category?: {
    cardiac: BreakdownBucket;
    respiratory: BreakdownBucket;
    mental_health: BreakdownBucket;
    pediatric: BreakdownBucket;
    neurological: BreakdownBucket;
    gastrointestinal: BreakdownBucket;
    musculoskeletal: BreakdownBucket;
    dermatological: BreakdownBucket;
    infectious: BreakdownBucket;
    other: BreakdownBucket;
  };
  by_age_group?: {
    infant: BreakdownBucket;
    child: BreakdownBucket;
    adolescent: BreakdownBucket;
    adult: BreakdownBucket;
    elderly: BreakdownBucket;
    unknown: BreakdownBucket;
  };
}

export interface TestRun {
  id: string;
  test_run_id: string;
  test_suite_id: string;
  agent_id: string;
  agent_name?: string;
  agent_type: AgentProvider | 'custom';
  name?: string;
  status: 'pending' | 'running' | 'grading' | 'completed' | 'failed' | 'canceled' | 'scheduled';
  suite_label: string;
  max_turns: number;
  concurrency_limit?: number;
  total_scenarios: number;
  passed_count: number;
  failed_count: number;
  error_count: number;
  pass_rate: number;
  started_at: string;
  completed_at?: string;
  canceled_at?: string;
  created_at: string;
  updated_at?: string;
  summary_breakdown?: SummaryBreakdown | null;
}

export interface ScenarioRunResult {
  id: string;
  scenario_id: string;
  scenario_name: string;
  status: 'pending' | 'running' | 'grading' | 'passed' | 'failed' | 'error' | 'canceled';
  error_code?: string;
  error_message?: string;
  passed?: boolean;
  grade_summary?: string;
  criteria_results?: CriteriaResult[];
  transcript: TranscriptEntry[];
  duration_ms?: number;
}

export interface TranscriptEntry {
  turn: number;
  role: 'target' | 'attacker';
  content: string;
  timestamp?: string;
  latency_ms?: number;
}

export interface CriteriaResult {
  // Legacy shape
  id?: string;
  name?: string;
  passed?: boolean;
  explanation?: string;
  // Current backend shape
  criterion?: string;
  criterion_index?: number;
  decision?: 'MET' | 'PARTIALLY MET' | 'NOT MET';
  rationale?: string;
  evidence?: string[];
  points_awarded?: number;
  points_possible?: number;
  overridden?: boolean;
}

export interface Scenario {
  id: string;
  scenario_id: string;
  name: string;
  category?: string;
  content?: Record<string, unknown>;
  rubric_criteria?: Array<Record<string, unknown>>;
  is_active?: boolean;
  approved?: boolean;
  scenario_type?: string;
  triage_level?: string;
  priority?: number;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export type AgentProvider = 'vapi' | 'livekit' | 'pipecat' | 'openai' | 'browser';

export interface Agent {
  id: string;
  provider: AgentProvider;
  name: string;
  description?: string;
  config: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ProviderMetadata {
  id: AgentProvider;
  name: string;
  description: string;
  capabilities?: ('text' | 'voice' | 'webrtc' | 'telephony')[];
  fields: {
    key: string;
    label: string;
    type: 'text' | 'password' | 'select' | 'number';
    placeholder?: string;
    required?: boolean;
    advanced?: boolean;
    options?: { label: string; value: string }[];
  }[];
}

export interface HealthCheck {
  status: 'ok' | 'warning' | 'error';
  detail: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  error?: string;
  checks: {
    database: HealthCheck;
    tester_model: HealthCheck;
    grader_model: HealthCheck;
    browser_provider: HealthCheck;
  };
  setup: {
    tester_model: string;
    grader_model: string;
    worker_concurrency: number;
  };
}
