import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { subscriptions } = vi.hoisted(() => ({
  subscriptions: new Map<string, ((data: unknown) => Promise<void>)[]>(),
}));

// ws/index.ts registers its subscriptions at import time; capturing the
// handlers lets us drive the event -> broadcast path without a real event bus.
vi.mock("../../../apps/api/src/events", () => ({
  subscribeToEvent: vi.fn(
    async (type: string, handler: (data: unknown) => Promise<void>) => {
      const existing = subscriptions.get(type) ?? [];
      existing.push(handler);
      subscriptions.set(type, existing);
    },
  ),
  publishEvent: vi.fn(),
}));

import {
  addConnection,
  initializeWebSocketAdapter,
  removeConnection,
  shutdownWebSocketAdapter,
} from "../../../apps/api/src/ws/index";

type FakeWs = { send: ReturnType<typeof vi.fn> };

function makeFakeWs() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    raw: undefined,
    url: null,
    protocol: null,
  } as never;
}

function sentMessages(ws: unknown) {
  return (ws as FakeWs).send.mock.calls.map(([raw]) => JSON.parse(raw));
}

async function emitAgentActivity(overrides: Record<string, unknown> = {}) {
  const handlers = subscriptions.get("agent-activity.updated") ?? [];
  expect(handlers).toHaveLength(1);
  for (const handler of handlers) {
    await handler({
      activityId: "activity-1",
      taskId: "task-1",
      projectId: "proj-1",
      agent: "капсула s03 · постановщик",
      agentId: "capsule-s03",
      agentKey: "capsule-s03",
      state: "progress",
      message: "running tests",
      progress: 42,
      avatarUrl: null,
      url: "https://capsules.test/s03/live",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    });
  }
}

const tracked: Array<{
  projectId: string;
  conn: ReturnType<typeof addConnection>;
}> = [];

function connect(projectId: string, initiatorId: string) {
  const ws = makeFakeWs();
  const conn = addConnection(projectId, ws, "user-1", initiatorId);
  tracked.push({ projectId, conn });
  return ws;
}

beforeEach(async () => {
  delete process.env.REDIS_URL;
  await initializeWebSocketAdapter();
});

afterEach(async () => {
  for (const { projectId, conn } of tracked) {
    removeConnection(projectId, conn);
  }
  tracked.length = 0;
  await shutdownWebSocketAdapter();
});

describe("AGENT_ACTIVITY broadcast", () => {
  it("delivers the full agent payload, not a refetch hint", async () => {
    const ws = connect("proj-1", "init-1");

    await emitAgentActivity();

    await vi.waitFor(
      () => expect((ws as unknown as FakeWs).send).toHaveBeenCalled(),
      { timeout: 300 },
    );

    expect(sentMessages(ws)).toEqual([
      {
        type: "AGENT_ACTIVITY",
        projectId: "proj-1",
        taskId: "task-1",
        agentActivity: {
          activityId: "activity-1",
          taskId: "task-1",
          projectId: "proj-1",
          agent: "капсула s03 · постановщик",
          agentId: "capsule-s03",
          agentKey: "capsule-s03",
          state: "progress",
          message: "running tests",
          progress: 42,
          avatarUrl: null,
          url: "https://capsules.test/s03/live",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ]);
  });

  it("collapses repeated ticks of one agent to the latest state", async () => {
    const ws = connect("proj-1", "init-1");

    await emitAgentActivity({ state: "started", progress: 0 });
    await emitAgentActivity({ state: "progress", progress: 50 });
    await emitAgentActivity({ state: "finished", progress: 100 });

    await vi.waitFor(
      () => expect((ws as unknown as FakeWs).send).toHaveBeenCalled(),
      { timeout: 300 },
    );

    const messages = sentMessages(ws);
    expect(messages).toHaveLength(1);
    expect(messages[0].agentActivity).toMatchObject({
      state: "finished",
      progress: 100,
    });
  });

  it("does not merge ticks from different agents on the same task", async () => {
    const ws = connect("proj-1", "init-1");

    await emitAgentActivity({ agentKey: "capsule-s03", state: "progress" });
    await emitAgentActivity({
      activityId: "activity-2",
      agentId: "capsule-s07",
      agentKey: "capsule-s07",
      agent: "капсула s07 · ревьюер",
      state: "blocked",
    });

    await vi.waitFor(
      () => expect((ws as unknown as FakeWs).send.mock.calls.length).toBe(2),
      { timeout: 300 },
    );

    const messages = sentMessages(ws);
    expect(
      messages.map((message) => message.agentActivity.agentKey).sort(),
    ).toEqual(["capsule-s03", "capsule-s07"]);
  });

  it("does not collide with plain task messages for the same task", async () => {
    const ws = connect("proj-1", "init-1");
    const { broadcastToProject } = await import(
      "../../../apps/api/src/ws/index"
    );

    broadcastToProject("proj-1", {
      type: "TASK_UPDATED",
      projectId: "proj-1",
      taskId: "task-1",
    });
    await emitAgentActivity();

    await vi.waitFor(
      () => expect((ws as unknown as FakeWs).send.mock.calls.length).toBe(2),
      { timeout: 300 },
    );

    expect(
      sentMessages(ws)
        .map((message) => message.type)
        .sort(),
    ).toEqual(["AGENT_ACTIVITY", "TASK_UPDATED"]);
  });

  it("reaches every watcher, including the event's initiator", async () => {
    // An observing 3D board is never the initiator of an agent tick, and the
    // agent's own API-key identity owns no socket, so nothing may be excluded.
    const watcher = connect("proj-1", "user-1");
    const otherWatcher = connect("proj-1", "user-1:window-9");

    await emitAgentActivity({ initiatorId: "user-1" });

    await vi.waitFor(
      () => {
        expect((watcher as unknown as FakeWs).send).toHaveBeenCalled();
        expect((otherWatcher as unknown as FakeWs).send).toHaveBeenCalled();
      },
      { timeout: 300 },
    );
  });

  it("ignores events without a project or task", async () => {
    const ws = connect("proj-1", "init-1");

    await emitAgentActivity({ projectId: "" });
    await emitAgentActivity({ taskId: "" });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((ws as unknown as FakeWs).send).not.toHaveBeenCalled();
  });
});
