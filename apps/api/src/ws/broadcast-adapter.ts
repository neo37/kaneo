import * as v from "valibot";
import { AGENT_ACTIVITY_STATES } from "../agent-activity/constants";

/**
 * Agent status is the one broadcast that carries state instead of a
 * "something changed, refetch" hint: a board renders the badge straight from
 * this payload, because refetching a task on every agent tick would be far too
 * chatty. Validated on the way out of Redis so cross-instance delivery keeps
 * the payload instead of silently dropping unknown keys.
 */
export const agentActivityBroadcastSchema = v.object({
  activityId: v.string(),
  taskId: v.string(),
  projectId: v.string(),
  agent: v.string(),
  agentId: v.nullable(v.string()),
  agentKey: v.string(),
  state: v.picklist(AGENT_ACTIVITY_STATES),
  message: v.nullable(v.string()),
  progress: v.nullable(v.number()),
  avatarUrl: v.nullable(v.string()),
  url: v.nullable(v.string()),
  updatedAt: v.string(),
});

export type AgentActivityBroadcastPayload = v.InferOutput<
  typeof agentActivityBroadcastSchema
>;

export type ProjectBroadcastMessage = {
  type: string;
  projectId: string;
  taskId?: string;
  sourceTaskId?: string;
  targetTaskId?: string;
  agentActivity?: AgentActivityBroadcastPayload;
};

export type BroadcastMessage = {
  projectId: string;
  message: ProjectBroadcastMessage;
  excludeInitiatorId?: string;
};

export type BroadcastAdapter = {
  /** Publish a message to all instances watching this project */
  publish(msg: BroadcastMessage): Promise<void>;

  /** Subscribe to messages for delivery to local connections */
  subscribe(handler: (msg: BroadcastMessage) => void): Promise<void>;

  /** Cleanup on shutdown */
  shutdown(): Promise<void>;
};
