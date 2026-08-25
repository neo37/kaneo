import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    insertedValues: [] as Record<string, unknown>[],
    conflictTargets: [] as unknown[],
    conflictSets: [] as Record<string, unknown>[],
    // The unique constraint lives in Postgres, so the mock stands in for it:
    // an upsert on an already-seen dedupe key mutates the stored row instead of
    // appending, which is exactly what the constraint does in production.
    rows: new Map<string, Record<string, unknown>>(),
    nextId: 0,
  },
}));

vi.mock("../../../apps/api/src/database", async () => {
  const schema = await import("../../../apps/api/src/database/schema");

  let pending: Record<string, unknown> = {};
  let pendingSet: Record<string, unknown> = {};

  const insertChain = {
    values(values: Record<string, unknown>) {
      pending = values;
      pendingSet = {};
      state.insertedValues.push(values);
      return insertChain;
    },
    onConflictDoUpdate(config: {
      target: unknown;
      set: Record<string, unknown>;
    }) {
      state.conflictTargets.push(config.target);
      state.conflictSets.push(config.set);
      pendingSet = config.set;
      return insertChain;
    },
    async returning() {
      const key = `${pending.taskId}:${pending.externalSource}:${pending.externalUrl}`;
      const existing = state.rows.get(key);

      if (existing) {
        Object.assign(existing, pendingSet);
        return [existing];
      }

      state.nextId += 1;
      const row = {
        id: `activity-${state.nextId}`,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        ...pending,
      };
      state.rows.set(key, row);
      return [row];
    },
  };

  return {
    default: { insert: () => insertChain },
    schema,
  };
});

const publishEvent = vi.fn();
vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => publishEvent(...args),
}));

const { default: recordAgentActivity } = await import(
  "../../../apps/api/src/agent-activity/controllers/record-agent-activity"
);
const { activityTable } = await import("../../../apps/api/src/database/schema");

const BASE = {
  taskId: "task-1",
  projectId: "project-1",
  agent: "капсула s03 · постановщик",
  agentId: "capsule-s03",
  state: "started" as const,
  reportedByUserId: "user-1",
};

beforeEach(() => {
  state.insertedValues.length = 0;
  state.conflictTargets.length = 0;
  state.conflictSets.length = 0;
  state.rows.clear();
  state.nextId = 0;
  publishEvent.mockClear();
});

describe("recordAgentActivity", () => {
  it("writes an activity row with the external-source fields filled in", async () => {
    const activity = await recordAgentActivity({
      ...BASE,
      message: "cloning repo",
      progress: 5,
      avatarUrl: "https://example.test/a.png",
      url: "https://capsules.test/s03/live",
    });

    const [values] = state.insertedValues;
    expect(values).toMatchObject({
      taskId: "task-1",
      type: "agent_status",
      content: "cloning repo",
      externalUserName: "капсула s03 · постановщик",
      externalUserAvatar: "https://example.test/a.png",
      externalSource: "agent",
      externalUrl: "agent:capsule-s03",
    });
    expect(values?.eventData).toMatchObject({
      agentId: "capsule-s03",
      agentKey: "capsule-s03",
      state: "started",
      progress: 5,
      url: "https://capsules.test/s03/live",
      reportedByUserId: "user-1",
    });

    expect(activity).toMatchObject({
      id: "activity-1",
      taskId: "task-1",
      projectId: "project-1",
      agent: "капсула s03 · постановщик",
      agentId: "capsule-s03",
      agentKey: "capsule-s03",
      state: "started",
      message: "cloning repo",
      progress: 5,
      url: "https://capsules.test/s03/live",
    });
  });

  it("upserts on (taskId, externalSource, externalUrl)", async () => {
    await recordAgentActivity(BASE);

    expect(state.conflictTargets[0]).toEqual([
      activityTable.taskId,
      activityTable.externalSource,
      activityTable.externalUrl,
    ]);
  });

  it("keeps one row per agent across repeated ticks", async () => {
    await recordAgentActivity({ ...BASE, message: "tick 1", progress: 10 });
    await recordAgentActivity({
      ...BASE,
      state: "progress",
      message: "tick 2",
      progress: 40,
    });
    const third = await recordAgentActivity({
      ...BASE,
      state: "finished",
      message: "done",
      progress: 100,
    });

    expect(state.rows.size).toBe(1);
    expect(third.id).toBe("activity-1");
    expect(third.state).toBe("finished");
    expect(third.message).toBe("done");
    expect(third.progress).toBe(100);
  });

  it("keeps the dedupe key stable when the live session url rotates", async () => {
    await recordAgentActivity({ ...BASE, url: "https://capsules.test/run/1" });
    await recordAgentActivity({
      ...BASE,
      state: "progress",
      url: "https://capsules.test/run/2",
    });

    expect(state.rows.size).toBe(1);
    expect(state.insertedValues.map((values) => values.externalUrl)).toEqual([
      "agent:capsule-s03",
      "agent:capsule-s03",
    ]);
  });

  it("gives two agents on the same task two rows", async () => {
    await recordAgentActivity(BASE);
    await recordAgentActivity({
      ...BASE,
      agent: "капсула s07 · ревьюер",
      agentId: "capsule-s07",
    });

    expect(state.rows.size).toBe(2);
    expect(state.insertedValues.map((values) => values.externalUrl)).toEqual([
      "agent:capsule-s03",
      "agent:capsule-s07",
    ]);
  });

  it("falls back to the display name when no agentId is sent", async () => {
    const activity = await recordAgentActivity({
      ...BASE,
      agentId: undefined,
    });

    expect(activity.agentId).toBeNull();
    expect(activity.agentKey).toBe("капсула-s03-постановщик");
    expect(state.insertedValues[0]?.externalUrl).toBe(
      "agent:капсула-s03-постановщик",
    );
  });

  it("publishes agent-activity.updated with the full payload", async () => {
    await recordAgentActivity({
      ...BASE,
      state: "blocked",
      message: "waiting for review",
      progress: 60,
      url: "https://capsules.test/s03/live",
    });

    expect(publishEvent).toHaveBeenCalledTimes(1);
    const [eventName, payload] = publishEvent.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(eventName).toBe("agent-activity.updated");
    expect(payload).toEqual({
      activityId: "activity-1",
      taskId: "task-1",
      projectId: "project-1",
      agent: "капсула s03 · постановщик",
      agentId: "capsule-s03",
      agentKey: "capsule-s03",
      state: "blocked",
      message: "waiting for review",
      progress: 60,
      avatarUrl: null,
      url: "https://capsules.test/s03/live",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    // The posting user is auditable in the row but must not leak to watchers.
    expect(payload).not.toHaveProperty("reportedByUserId");
  });
});
