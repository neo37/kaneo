import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { broadcastToProject } from "../ws";
import type { AgentPresence } from "../ws/broadcast-adapter";
import * as presence from "./presence";

/**
 * Отчёты агентов о том, чем они заняты.
 *
 * Нужны, чтобы на пространственном экране было видно живую работу: где сейчас
 * агенты, на каких задачах и в каком состоянии. Отчёт — это отметка присутствия
 * с TTL, а не запись в журнал: агент, который замолчал, должен исчезнуть сам.
 */

const agentStateSchema = v.picklist([
  "thinking",
  "editing",
  "running",
  "waiting",
  "review",
  "done",
  "failed",
]);

const agentPresenceSchema = v.object({
  agentId: v.string(),
  name: v.string(),
  capsule: v.optional(v.string()),
  taskId: v.nullable(v.string()),
  state: agentStateSchema,
  message: v.optional(v.string()),
  updatedAt: v.string(),
});

const reportSchema = v.object({
  projectId: v.string(),
  agentId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  capsule: v.optional(v.pipe(v.string(), v.maxLength(64))),
  taskId: v.optional(v.nullable(v.string())),
  state: agentStateSchema,
  message: v.optional(v.pipe(v.string(), v.maxLength(280))),
  /** Через сколько секунд считать агента отвалившимся. */
  ttlSeconds: v.optional(v.pipe(v.number(), v.minValue(5), v.maxValue(3600))),
});

/** Рассылает текущий снимок присутствия проекта. */
function publishSnapshot(projectId: string) {
  broadcastToProject(projectId, {
    type: "AGENT_PRESENCE",
    projectId,
    agents: presence.snapshot(projectId),
  });
}

// Истёкшие отметки тоже меняют картинку на экране, поэтому о них сообщаем.
presence.setExpiryHandler(publishSnapshot);

const agentActivity = new Hono<{
  Variables: { userId: string; workspaceId: string };
}>()
  .post(
    "/",
    describeRoute({
      operationId: "reportAgentActivity",
      tags: ["Agent Activity"],
      description:
        "Report what an agent is doing right now. Presence expires after ttlSeconds unless refreshed.",
      responses: {
        200: {
          description: "Current presence for the project",
          content: {
            "application/json": {
              schema: resolver(v.array(agentPresenceSchema)),
            },
          },
        },
      },
    }),
    validator("json", reportSchema),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const body = c.req.valid("json");
      const entry: AgentPresence = {
        agentId: body.agentId,
        name: body.name,
        capsule: body.capsule,
        taskId: body.taskId ?? null,
        state: body.state,
        message: body.message,
        updatedAt: new Date().toISOString(),
      };

      // Завершившийся агент не висит на доске до конца TTL: снимаем сразу.
      if (entry.state === "done" || entry.state === "failed") {
        presence.upsert(body.projectId, entry, 10_000);
      } else {
        presence.upsert(body.projectId, entry, (body.ttlSeconds ?? 90) * 1000);
      }

      publishSnapshot(body.projectId);
      return c.json(presence.snapshot(body.projectId));
    },
  )
  .delete(
    "/:agentId",
    describeRoute({
      operationId: "clearAgentActivity",
      tags: ["Agent Activity"],
      description: "Remove an agent from the board immediately.",
      responses: {
        200: {
          description: "Current presence for the project",
          content: {
            "application/json": {
              schema: resolver(v.array(agentPresenceSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ agentId: v.string() })),
    validator("query", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { agentId } = c.req.valid("param");
      const { projectId } = c.req.valid("query");
      if (presence.remove(projectId, agentId)) {
        publishSnapshot(projectId);
      }
      return c.json(presence.snapshot(projectId));
    },
  )
  .get(
    "/:projectId",
    describeRoute({
      operationId: "getAgentActivity",
      tags: ["Agent Activity"],
      description:
        "Snapshot of agents currently working in a project. Used on first render; live updates arrive over the project WebSocket.",
      responses: {
        200: {
          description: "Current presence for the project",
          content: {
            "application/json": {
              schema: resolver(v.array(agentPresenceSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      return c.json(presence.snapshot(projectId));
    },
  );

export default agentActivity;
