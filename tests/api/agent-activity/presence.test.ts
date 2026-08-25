import { afterEach, describe, expect, it, vi } from "vitest";
import {
  remove,
  reset,
  snapshot,
  sweep,
  upsert,
} from "../../../apps/api/src/agent-activity/presence";
import type { AgentPresence } from "../../../apps/api/src/ws/broadcast-adapter";

function agent(overrides: Partial<AgentPresence> = {}): AgentPresence {
  return {
    agentId: "s03",
    name: "Аналитик s03",
    capsule: "s03",
    taskId: "t-1",
    state: "editing",
    updatedAt: "2026-08-25T21:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  reset();
  vi.useRealTimers();
});

describe("presence", () => {
  it("возвращает добавленного агента", () => {
    upsert("p1", agent());
    expect(snapshot("p1").map((a) => a.agentId)).toEqual(["s03"]);
  });

  it("разводит агентов по проектам", () => {
    upsert("p1", agent({ agentId: "s03" }));
    upsert("p2", agent({ agentId: "s04" }));
    expect(snapshot("p1")).toHaveLength(1);
    expect(snapshot("p2")).toHaveLength(1);
  });

  it("обновляет запись того же агента, а не плодит дубли", () => {
    upsert("p1", agent({ state: "thinking" }));
    upsert("p1", agent({ state: "running" }));
    const live = snapshot("p1");
    expect(live).toHaveLength(1);
    expect(live[0].state).toBe("running");
  });

  it("держит устойчивый порядок", () => {
    // Иначе маркеры на сцене прыгали бы при каждом снимке.
    upsert("p1", agent({ agentId: "s09" }));
    upsert("p1", agent({ agentId: "s01" }));
    expect(snapshot("p1").map((a) => a.agentId)).toEqual(["s01", "s09"]);
  });

  it("убирает агента, переставшего отмечаться", () => {
    vi.useFakeTimers();
    upsert("p1", agent(), 1000);
    expect(snapshot("p1")).toHaveLength(1);
    vi.advanceTimersByTime(1001);
    expect(snapshot("p1")).toHaveLength(0);
  });

  it("sweep сообщает, в каких проектах состав изменился", () => {
    vi.useFakeTimers();
    upsert("p1", agent(), 1000);
    upsert("p2", agent({ agentId: "s04" }), 60_000);
    vi.advanceTimersByTime(1001);
    expect(sweep()).toEqual(["p1"]);
  });

  it("снимает агента по требованию", () => {
    upsert("p1", agent());
    expect(remove("p1", "s03")).toBe(true);
    expect(remove("p1", "s03")).toBe(false);
    expect(snapshot("p1")).toHaveLength(0);
  });

  it("не знает о проекте без агентов", () => {
    expect(snapshot("никого")).toEqual([]);
  });
});
