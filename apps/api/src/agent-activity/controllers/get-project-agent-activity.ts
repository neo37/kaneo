import { and, desc, eq } from "drizzle-orm";
import db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { AGENT_ACTIVITY_TYPE, AGENT_EXTERNAL_SOURCE } from "../constants";
import { type AgentActivity, toAgentActivity } from "../normalize";

/**
 * Board views hydrate from this before the first WebSocket tick arrives;
 * without it an agent that already reported `blocked` and went quiet would be
 * invisible until it ticks again.
 */
const MAX_AGENT_LANES = 200;

async function getProjectAgentActivity(
  projectId: string,
): Promise<AgentActivity[]> {
  const rows = await db
    .select({
      id: activityTable.id,
      taskId: activityTable.taskId,
      content: activityTable.content,
      eventData: activityTable.eventData,
      externalUserName: activityTable.externalUserName,
      externalUserAvatar: activityTable.externalUserAvatar,
      createdAt: activityTable.createdAt,
      updatedAt: activityTable.updatedAt,
    })
    .from(activityTable)
    .innerJoin(taskTable, eq(activityTable.taskId, taskTable.id))
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(activityTable.externalSource, AGENT_EXTERNAL_SOURCE),
        eq(activityTable.type, AGENT_ACTIVITY_TYPE),
      ),
    )
    .orderBy(desc(activityTable.updatedAt))
    .limit(MAX_AGENT_LANES);

  return rows.map((row) => toAgentActivity(row, projectId));
}

export default getProjectAgentActivity;
