import {
  AGENT_ACTIVITY_STATES,
  type AgentActivityState,
  toAgentKey,
} from "./constants";

export type AgentActivity = {
  id: string;
  taskId: string;
  projectId: string;
  agent: string;
  agentId: string | null;
  agentKey: string;
  state: AgentActivityState;
  message: string | null;
  progress: number | null;
  avatarUrl: string | null;
  url: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ActivityRow = {
  id: string;
  taskId: string;
  content: string | null;
  eventData: unknown;
  externalUserName: string | null;
  externalUserAvatar: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function readEventData(eventData: unknown): Record<string, unknown> {
  return eventData && typeof eventData === "object" && !Array.isArray(eventData)
    ? (eventData as Record<string, unknown>)
    : {};
}

function readState(value: unknown): AgentActivityState {
  return AGENT_ACTIVITY_STATES.includes(value as AgentActivityState)
    ? (value as AgentActivityState)
    : "progress";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readProgress(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * `event_data` is untyped jsonb, so rows written by an older build (or by hand)
 * must still produce a well-formed payload rather than throwing on a live board.
 */
export function toAgentActivity(
  row: ActivityRow,
  projectId: string,
): AgentActivity {
  const eventData = readEventData(row.eventData);
  const agent = row.externalUserName ?? "Agent";
  const agentId = readString(eventData.agentId);

  return {
    id: row.id,
    taskId: row.taskId,
    projectId,
    agent,
    agentId,
    agentKey: readString(eventData.agentKey) ?? toAgentKey(agentId, agent),
    state: readState(eventData.state),
    message: row.content,
    progress: readProgress(eventData.progress),
    avatarUrl: row.externalUserAvatar,
    url: readString(eventData.url),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
