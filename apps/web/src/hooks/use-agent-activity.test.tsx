import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_QUIET_AFTER_MS,
  type AgentActivity,
  useAgentActivity,
} from "./use-agent-activity";

const getProjectAgentActivity = vi.fn();

vi.mock("@/fetchers/agent-activity/get-project-agent-activity", () => ({
  default: (projectId: string) => getProjectAgentActivity(projectId),
}));

function activity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    activityId: "a1",
    taskId: "t1",
    projectId: "p1",
    agent: "капсула s03 · постановщик",
    agentId: "capsule-s03",
    agentKey: "capsule-s03",
    state: "progress",
    message: "Прогоняю тесты",
    progress: 60,
    avatarUrl: null,
    url: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAgentActivity", () => {
  beforeEach(() => {
    getProjectAgentActivity.mockReset();
    getProjectAgentActivity.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("starts from what the API already knows", async () => {
    getProjectAgentActivity.mockResolvedValue([activity()]);
    const { result } = renderHook(() => useAgentActivity(["p1"]), { wrapper });

    await waitFor(() => expect(result.current.agents).toHaveLength(1));
    expect(result.current.byTask.get("t1")?.[0].agent).toContain("s03");
    expect(result.current.working).toHaveLength(1);
  });

  // Ловушка, на которую напоролись живьём: состояние из запросов переносилось
  // в useState эффектом, а зависел он от массива результатов useQueries —
  // тот создаётся заново каждый рендер, и страница уходила в бесконечный цикл.
  it("settles instead of re-rendering forever when the API returns data", async () => {
    getProjectAgentActivity.mockResolvedValue([activity()]);
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useAgentActivity(["p1"]);
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.agents).toHaveLength(1));
    const settled = renders;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(renders - settled).toBeLessThan(3);
  });

  it("merges live ticks in place instead of piling them up", async () => {
    const { result } = renderHook(() => useAgentActivity(["p1"]), { wrapper });

    act(() => {
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: activity({ state: "started", progress: 0 }),
      });
    });
    act(() => {
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: activity({ state: "progress", progress: 80 }),
      });
    });

    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].progress).toBe(80);
  });

  it("keeps agents on one task apart", async () => {
    const { result } = renderHook(() => useAgentActivity(["p1"]), { wrapper });

    act(() => {
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: activity({ agentKey: "capsule-s03" }),
      });
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: activity({
          agentKey: "capsule-s04",
          agent: "капсула s04",
        }),
      });
    });

    expect(result.current.byTask.get("t1")).toHaveLength(2);
  });

  it("ignores messages of other types and malformed payloads", async () => {
    const { result } = renderHook(() => useAgentActivity(["p1"]), { wrapper });

    act(() => {
      result.current.applyMessage({ type: "TASK_UPDATED", taskId: "t1" });
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: { taskId: "t1", state: "теплится" },
      });
      result.current.applyMessage({ type: "AGENT_ACTIVITY" });
    });

    expect(result.current.agents).toHaveLength(0);
  });

  it("marks an agent that went silent as quiet and stops counting it as working", async () => {
    const { result } = renderHook(() => useAgentActivity(["p1"]), { wrapper });

    act(() => {
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: activity({
          updatedAt: new Date(
            Date.now() - AGENT_QUIET_AFTER_MS - 1000,
          ).toISOString(),
        }),
      });
    });

    expect(result.current.agents[0].isQuiet).toBe(true);
    expect(result.current.working).toHaveLength(0);
  });

  it("drops agents of boards that are no longer watched", async () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useAgentActivity(ids),
      { wrapper, initialProps: { ids: ["p1", "p2"] } },
    );

    act(() => {
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: activity({ projectId: "p2", taskId: "t9" }),
      });
    });
    expect(result.current.agents).toHaveLength(1);

    rerender({ ids: ["p1"] });
    expect(result.current.agents).toHaveLength(0);
  });

  it("does not count a finished agent as still working", async () => {
    const { result } = renderHook(() => useAgentActivity(["p1"]), { wrapper });
    act(() => {
      result.current.applyMessage({
        type: "AGENT_ACTIVITY",
        agentActivity: activity({ state: "finished" }),
      });
    });
    expect(result.current.agents).toHaveLength(1);
    expect(result.current.working).toHaveLength(0);
  });
});
