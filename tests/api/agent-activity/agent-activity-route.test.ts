import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    /** taskId -> the project/workspace it lives in */
    tasks: {
      "task-mine": { projectId: "project-1", workspaceId: "workspace-mine" },
      "task-theirs": {
        projectId: "project-2",
        workspaceId: "workspace-theirs",
      },
    } as Record<string, { projectId: string; workspaceId: string }>,
    projects: {
      "project-1": { workspaceId: "workspace-mine" },
    } as Record<string, { workspaceId: string }>,
    requiredPermissions: [] as Record<string, string[]>[],
    permissionGranted: true,
    recorded: [] as Record<string, unknown>[],
  },
}));

vi.mock("../../../apps/api/src/database", async () => {
  const schema = await import("../../../apps/api/src/database/schema");
  const { PgDialect } = await import("drizzle-orm/pg-core");

  // Same trick as tests/api/utils/workspace-access-middleware.test.ts: read the
  // bound id back through the dialect instead of poking at drizzle internals.
  const dialect = new PgDialect();
  let boundId: string | undefined;

  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
      const [id] = dialect.sqlToQuery(condition).params;
      boundId = typeof id === "string" ? id : undefined;
      return chain;
    },
    limit: async () => {
      if (!boundId) return [];
      const row = state.tasks[boundId] ?? state.projects[boundId];
      return row ? [row] : [];
    },
  };

  return { default: chain, schema };
});

vi.mock("../../../apps/api/src/utils/validate-workspace-access", async () => {
  const { HTTPException } = await import("hono/http-exception");
  return {
    validateWorkspaceAccess: async (_userId: string, workspaceId: string) => {
      if (workspaceId !== "workspace-mine") {
        throw new HTTPException(403, {
          message: "You don't have access to this workspace",
        });
      }
    },
  };
});

vi.mock(
  "../../../apps/api/src/utils/require-workspace-permission",
  async () => {
    const { HTTPException } = await import("hono/http-exception");
    return {
      requireWorkspacePermission:
        (permissions: Record<string, string[]>) =>
        async (
          _c: unknown,
          next: () => Promise<void> | void,
        ): Promise<void> => {
          state.requiredPermissions.push(permissions);
          if (!state.permissionGranted) {
            throw new HTTPException(403, {
              message: "Insufficient permissions",
            });
          }
          await next();
        },
    };
  },
);

vi.mock(
  "../../../apps/api/src/agent-activity/controllers/record-agent-activity",
  () => ({
    default: async (input: Record<string, unknown>) => {
      state.recorded.push(input);
      return {
        id: "activity-1",
        taskId: input.taskId,
        projectId: input.projectId,
        agent: input.agent,
        agentId: input.agentId ?? null,
        agentKey: "capsule-s03",
        state: input.state,
        message: input.message ?? null,
        progress: input.progress ?? null,
        avatarUrl: input.avatarUrl ?? null,
        url: input.url ?? null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    },
  }),
);

vi.mock(
  "../../../apps/api/src/agent-activity/controllers/get-project-agent-activity",
  () => ({
    default: async (projectId: string) => [
      { id: "activity-1", projectId, taskId: "task-mine" },
    ],
  }),
);

const { default: agentActivity } = await import(
  "../../../apps/api/src/agent-activity"
);

// Mirrors how the router is mounted behind `authenticateApiRequest`: the API
// key has already been resolved to the user it belongs to.
function buildApp(userId = "user-1") {
  return new Hono()
    .use("*", async (c, next) => {
      c.set("userId", userId);
      return next();
    })
    .route("/agent-activity", agentActivity);
}

function post(body: unknown, userId?: string) {
  return buildApp(userId).request("/agent-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  taskId: "task-mine",
  agent: "капсула s03 · постановщик",
  agentId: "capsule-s03",
  state: "started",
};

beforeEach(() => {
  state.requiredPermissions.length = 0;
  state.recorded.length = 0;
  state.permissionGranted = true;
});

describe("POST /agent-activity", () => {
  it("records the tick and returns the current agent state", async () => {
    const res = await post({
      ...VALID,
      message: "cloning repo",
      progress: 5,
      url: "https://capsules.test/s03/live",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: "activity-1",
      taskId: "task-mine",
      projectId: "project-1",
      agentKey: "capsule-s03",
      state: "started",
      message: "cloning repo",
      progress: 5,
      url: "https://capsules.test/s03/live",
    });

    expect(state.recorded[0]).toMatchObject({
      taskId: "task-mine",
      projectId: "project-1",
      reportedByUserId: "user-1",
    });
  });

  it("requires task update permission in the task's workspace", async () => {
    await post(VALID);
    expect(state.requiredPermissions).toEqual([{ task: ["update"] }]);
  });

  it("rejects an unknown state with 400", async () => {
    const res = await post({ ...VALID, state: "vibing" });
    expect(res.status).toBe(400);
    expect(state.recorded).toHaveLength(0);
  });

  it("rejects a missing agent name with 400", async () => {
    const res = await post({ taskId: "task-mine", state: "started" });
    expect(res.status).toBe(400);
  });

  it("rejects out-of-range progress with 400", async () => {
    const res = await post({ ...VALID, progress: 140 });
    expect(res.status).toBe(400);
  });

  it("rejects a non-url live session link with 400", async () => {
    const res = await post({ ...VALID, url: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a task that does not exist", async () => {
    const res = await post({ ...VALID, taskId: "task-missing" });
    expect(res.status).toBe(404);
    expect(state.recorded).toHaveLength(0);
  });

  it("returns 403 when the key's user has no access to the workspace", async () => {
    const res = await post({ ...VALID, taskId: "task-theirs" });
    expect(res.status).toBe(403);
    expect(state.recorded).toHaveLength(0);
    // Workspace access is denied before the permission check even runs.
    expect(state.requiredPermissions).toHaveLength(0);
  });

  it("returns 403 when the role or key scope lacks task update", async () => {
    state.permissionGranted = false;
    const res = await post(VALID);
    expect(res.status).toBe(403);
    expect(state.recorded).toHaveLength(0);
  });
});

describe("GET /agent-activity/:projectId", () => {
  it("returns the project's agent lanes", async () => {
    const res = await buildApp().request("/agent-activity/project-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "activity-1", projectId: "project-1", taskId: "task-mine" },
    ]);
    expect(state.requiredPermissions).toEqual([{ task: ["read"] }]);
  });

  it("returns 403 for a project in another workspace", async () => {
    state.projects["project-2"] = { workspaceId: "workspace-theirs" };
    const res = await buildApp().request("/agent-activity/project-2");
    expect(res.status).toBe(403);
  });
});
