import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import getProjectAgentActivity from "@/fetchers/agent-activity/get-project-agent-activity";

export const AGENT_STATES = [
  "started",
  "progress",
  "blocked",
  "finished",
  "failed",
] as const;

export type AgentState = (typeof AGENT_STATES)[number];

export type AgentActivity = {
  activityId: string;
  taskId: string;
  projectId: string;
  agent: string;
  agentId: string | null;
  agentKey: string;
  state: AgentState;
  message: string | null;
  progress: number | null;
  avatarUrl: string | null;
  url: string | null;
  updatedAt: string;
};

/**
 * An agent that has said nothing for this long is shown as gone quiet rather
 * than as working. Agents tick while they run, so silence is information: a
 * capsule that died mid-task would otherwise look busy forever.
 */
export const AGENT_QUIET_AFTER_MS = 5 * 60 * 1000;

export type AgentPresence = AgentActivity & {
  /** No news for a while — drawn dimmed, never dropped. */
  isQuiet: boolean;
};

function isAgentActivity(value: unknown): value is AgentActivity {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentActivity>;
  return (
    typeof candidate.taskId === "string" &&
    typeof candidate.agentKey === "string" &&
    typeof candidate.state === "string" &&
    (AGENT_STATES as readonly string[]).includes(candidate.state)
  );
}

/** One lane per agent per task, which is exactly how the server stores them. */
function laneKey(activity: AgentActivity): string {
  return `${activity.taskId}:${activity.agentKey}`;
}

/**
 * Collects what external agents are doing on the watched boards.
 *
 * The initial state comes from the API — without it a board stays blank until
 * the next tick, and an agent that reported `blocked` and went quiet would
 * never show up at all. Live updates then arrive as websocket payloads and are
 * merged in place, without refetching the board.
 */
export function useAgentActivity(projectIds: string[]) {
  const [live, setLive] = useState<Record<string, AgentActivity>>({});
  const [now, setNow] = useState(() => Date.now());

  const initial = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ["agent-activity", projectId],
      queryFn: () => getProjectAgentActivity(projectId),
      enabled: !!projectId,
      staleTime: 30000,
    })),
  });

  // Состояние из запросов и живые тики сводятся на рендере, а не эффектом.
  // Эффект, переносивший ответ запроса в состояние, зависел от массива
  // результатов, который useQueries создаёт заново каждый раз, — и рендер
  // уходил в бесконечный цикл. Слияние на месте этой зависимости не имеет.
  const watched = new Set(projectIds);
  const lanes: Record<string, AgentActivity> = { ...live };
  for (const result of initial) {
    for (const item of (result.data ?? []) as unknown[]) {
      if (!isAgentActivity(item)) continue;
      const key = laneKey(item);
      const existing = lanes[key];
      // Тик, пришедший по вебсокету, новее ответа, с которым он разошёлся.
      if (existing && existing.updatedAt >= item.updatedAt) continue;
      lanes[key] = item;
    }
  }

  const agents: AgentPresence[] = Object.values(lanes)
    .filter((activity) => watched.has(activity.projectId))
    .map((activity) => ({
      ...activity,
      isQuiet:
        now - new Date(activity.updatedAt).getTime() > AGENT_QUIET_AFTER_MS,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const byTask = new Map<string, AgentPresence[]>();
  for (const agent of agents) {
    const list = byTask.get(agent.taskId);
    if (list) list.push(agent);
    else byTask.set(agent.taskId, [agent]);
  }

  const working = agents.filter(
    (agent) =>
      !agent.isQuiet &&
      (agent.state === "started" ||
        agent.state === "progress" ||
        agent.state === "blocked"),
  );

  // Молчание — это тоже сведение, но о нём никто не присылает сообщения,
  // поэтому у него собственные часы.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const applyMessage = useCallback(
    (message: { type?: string } & Record<string, unknown>) => {
      if (message.type !== "AGENT_ACTIVITY") return;
      const activity = message.agentActivity;
      if (!isAgentActivity(activity)) return;
      setLive((current) => ({ ...current, [laneKey(activity)]: activity }));
      setNow(Date.now());
    },
    [],
  );

  return { agents, byTask, working, applyMessage };
}
