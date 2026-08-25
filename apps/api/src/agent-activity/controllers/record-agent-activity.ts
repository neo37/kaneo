import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  AGENT_ACTIVITY_TYPE,
  AGENT_EXTERNAL_SOURCE,
  type AgentActivityState,
  toAgentDedupeUrl,
  toAgentKey,
} from "../constants";
import { type AgentActivity, toAgentActivity } from "../normalize";

export type RecordAgentActivityInput = {
  taskId: string;
  projectId: string;
  agent: string;
  agentId?: string;
  avatarUrl?: string;
  url?: string;
  state: AgentActivityState;
  message?: string;
  progress?: number;
  reportedByUserId: string;
};

/**
 * Records the current state of one agent on one task.
 *
 * Idempotency: agents tick every few seconds, so appending a row per tick would
 * turn a task's history into thousands of lines and make the activity feed
 * useless. Instead every agent keeps exactly one row per task — its live lane —
 * upserted on the existing `(task_id, external_source, external_url)` unique
 * constraint. `created_at` stays at the first tick so the lane holds its place
 * in the feed, `updated_at` moves with every tick, and the WebSocket carries the
 * transitions that are not worth persisting individually. Two agents on the same
 * task get two rows because their dedupe URLs differ; a rerun by the same agent
 * reuses its lane rather than stacking a new one.
 */
async function recordAgentActivity(
  input: RecordAgentActivityInput,
): Promise<AgentActivity> {
  const agentKey = toAgentKey(input.agentId, input.agent);
  const externalUrl = toAgentDedupeUrl(agentKey);

  const eventData = {
    agentId: input.agentId ?? null,
    agentKey,
    state: input.state,
    progress: input.progress ?? null,
    url: input.url ?? null,
    // Audit only: which member's API key posted this. Never broadcast or
    // returned, so an agent lane cannot be used to enumerate workspace members.
    reportedByUserId: input.reportedByUserId,
  };

  const values = {
    taskId: input.taskId,
    type: AGENT_ACTIVITY_TYPE,
    content: input.message ?? null,
    externalUserName: input.agent,
    externalUserAvatar: input.avatarUrl ?? null,
    externalSource: AGENT_EXTERNAL_SOURCE,
    externalUrl,
    eventData,
  };

  const [row] = await db
    .insert(activityTable)
    .values(values)
    .onConflictDoUpdate({
      target: [
        activityTable.taskId,
        activityTable.externalSource,
        activityTable.externalUrl,
      ],
      set: {
        content: values.content,
        externalUserName: values.externalUserName,
        externalUserAvatar: values.externalUserAvatar,
        eventData: values.eventData,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new HTTPException(500, {
      message: "Failed to record agent activity",
    });
  }

  const agentActivity = toAgentActivity(row, input.projectId);

  await publishEvent("agent-activity.updated", {
    activityId: agentActivity.id,
    taskId: agentActivity.taskId,
    projectId: agentActivity.projectId,
    agent: agentActivity.agent,
    agentId: agentActivity.agentId,
    agentKey: agentActivity.agentKey,
    state: agentActivity.state,
    message: agentActivity.message,
    progress: agentActivity.progress,
    avatarUrl: agentActivity.avatarUrl,
    url: agentActivity.url,
    updatedAt: agentActivity.updatedAt.toISOString(),
  });

  return agentActivity;
}

export default recordAgentActivity;
