import { describe, expect, it, vi } from "vitest";

const { redis } = vi.hoisted(() => {
  const handlers: ((pattern: string, channel: string, data: string) => void)[] =
    [];

  return {
    redis: {
      handlers,
      async psubscribe() {},
      async punsubscribe() {},
      on(event: string, handler: (typeof handlers)[number]) {
        if (event === "pmessage") handlers.push(handler);
      },
      off(event: string, handler: (typeof handlers)[number]) {
        if (event !== "pmessage") return;
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      },
      async publish(channel: string, data: string) {
        for (const handler of [...handlers]) {
          handler("kaneo:ws:*:broadcast", channel, data);
        }
      },
    },
  };
});

vi.mock("../../../apps/api/src/redis", () => ({
  getRedisPub: () => redis,
  getRedisSub: () => redis,
  closeRedis: async () => {},
  isRedisConfigured: () => true,
}));

import type { BroadcastMessage } from "../../../apps/api/src/ws/broadcast-adapter";
import { RedisBroadcastAdapter } from "../../../apps/api/src/ws/redis-broadcast-adapter";

const AGENT_MESSAGE: BroadcastMessage = {
  projectId: "proj-1",
  message: {
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
      state: "blocked",
      message: "waiting for review",
      progress: 60,
      avatarUrl: null,
      url: "https://capsules.test/s03/live",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
};

describe("RedisBroadcastAdapter agent payload", () => {
  it("keeps the agent payload across instances", async () => {
    // The subscriber validates with valibot, which drops unknown keys: without
    // agentActivity in the schema every instance but the publisher would
    // deliver an empty badge.
    const adapter = new RedisBroadcastAdapter();
    const received: BroadcastMessage[] = [];
    await adapter.subscribe((msg) => {
      received.push(msg);
    });

    await adapter.publish(AGENT_MESSAGE);

    expect(received).toEqual([AGENT_MESSAGE]);

    await adapter.shutdown();
  });

  it("drops a message whose agent state is not part of the vocabulary", async () => {
    const adapter = new RedisBroadcastAdapter();
    const received: BroadcastMessage[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await adapter.subscribe((msg) => {
      received.push(msg);
    });

    await adapter.publish({
      ...AGENT_MESSAGE,
      message: {
        ...AGENT_MESSAGE.message,
        agentActivity: {
          ...AGENT_MESSAGE.message.agentActivity,
          state: "vibing",
        },
      },
    } as unknown as BroadcastMessage);

    expect(received).toHaveLength(0);
    errorSpy.mockRestore();
    await adapter.shutdown();
  });
});
