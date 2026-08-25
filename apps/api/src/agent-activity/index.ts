import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { projectTable, taskTable } from "../database/schema";
import { agentActivitySchema } from "../schemas";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { AGENT_ACTIVITY_STATES } from "./constants";
import getProjectAgentActivity from "./controllers/get-project-agent-activity";
import recordAgentActivity from "./controllers/record-agent-activity";

const agentActivityRequestSchema = v.object({
  taskId: v.pipe(v.string(), v.trim(), v.minLength(1)),
  agent: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  agentId: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  ),
  avatarUrl: v.optional(v.pipe(v.string(), v.trim(), v.url())),
  url: v.optional(v.pipe(v.string(), v.trim(), v.url())),
  state: v.picklist(AGENT_ACTIVITY_STATES),
  message: v.optional(v.pipe(v.string(), v.maxLength(2000))),
  progress: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
});

const agentActivity = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
    agentTaskProjectId: string;
  };
}>()
  .post(
    "/",
    describeRoute({
      operationId: "recordAgentActivity",
      tags: ["Agent Activity"],
      description:
        "Report the current state of an external agent working on a task. Ticks from the same agent update a single activity row instead of appending history, and are broadcast to project WebSocket clients as AGENT_ACTIVITY.",
      responses: {
        200: {
          description: "Current agent state for the task",
          content: {
            "application/json": { schema: resolver(agentActivitySchema) },
          },
        },
        400: { description: "Invalid payload" },
        401: { description: "Missing or invalid credentials" },
        403: { description: "No access to the task's workspace" },
        404: { description: "Task not found" },
      },
    }),
    validator("json", agentActivityRequestSchema),
    // Resolving the task first turns an unknown id into 404 rather than the
    // generic 400 the workspace middleware would raise, and caches the
    // projectId the broadcast needs. It does mean an authenticated caller can
    // tell "no such task" (404) from "not your workspace" (403); task ids are
    // unguessable cuid2 values, so this is an accepted trade for a usable
    // agent-facing error contract.
    async (c, next) => {
      const { taskId } = c.req.valid("json");

      const [task] = await db
        .select({ projectId: taskTable.projectId })
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .where(eq(taskTable.id, taskId))
        .limit(1);

      if (!task) {
        throw new HTTPException(404, { message: "Task not found" });
      }

      c.set("agentTaskProjectId", task.projectId);
      return next();
    },
    // The agent authenticates with an API key bound to a user, so access is
    // resolved exactly as it is for that person: no agent-specific bypass.
    workspaceAccess.fromTaskId(),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const body = c.req.valid("json");

      const activity = await recordAgentActivity({
        ...body,
        projectId: c.get("agentTaskProjectId"),
        reportedByUserId: c.get("userId"),
      });

      return c.json(activity);
    },
  )
  .get(
    "/:projectId",
    describeRoute({
      operationId: "getProjectAgentActivity",
      tags: ["Agent Activity"],
      description:
        "Current state of every agent reporting on tasks in a project. Used to hydrate a board before the first AGENT_ACTIVITY WebSocket message.",
      responses: {
        200: {
          description: "Agent states for the project",
          content: {
            "application/json": {
              schema: resolver(v.array(agentActivitySchema)),
            },
          },
        },
        401: { description: "Missing or invalid credentials" },
        403: { description: "No access to the project's workspace" },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const activities = await getProjectAgentActivity(projectId);
      return c.json(activities);
    },
  );

export default agentActivity;
