import { useTranslation } from "react-i18next";
import type { AgentPresence, AgentState } from "@/hooks/use-agent-activity";
import { cn } from "@/lib/cn";

const VISIBLE_AGENTS = 3;

/**
 * Colour carries the state, so a wall of boards can be read at a distance
 * without reading any text: something is stuck, something failed, the rest is
 * running.
 */
const STATE_STYLES: Record<AgentState, string> = {
  started: "bg-sky-500",
  progress: "bg-emerald-500",
  blocked: "bg-amber-500",
  finished: "bg-muted-foreground",
  failed: "bg-red-500",
};

export function agentStateLabel(state: AgentState): string {
  return `tasks:agents.state.${state}`;
}

/** The badges that sit on a task card while agents work on it. */
function AgentMarkers({ agents }: { agents: AgentPresence[] }) {
  const { t } = useTranslation();
  if (agents.length === 0) return null;

  const shown = agents.slice(0, VISIBLE_AGENTS);
  const hidden = agents.length - shown.length;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {shown.map((agent) => (
        <span
          key={agent.agentKey}
          title={`${agent.agent} — ${t(agentStateLabel(agent.state))}${
            agent.message ? `: ${agent.message}` : ""
          }`}
          className={cn(
            "inline-flex max-w-[110px] items-center gap-1 rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] leading-none",
            agent.isQuiet && "opacity-50",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              STATE_STYLES[agent.state],
              !agent.isQuiet &&
                (agent.state === "started" || agent.state === "progress") &&
                "animate-pulse",
            )}
          />
          <span className="truncate text-muted-foreground">{agent.agent}</span>
          {agent.progress != null && (
            <span className="shrink-0 text-muted-foreground/80">
              {agent.progress}%
            </span>
          )}
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
          +{hidden}
        </span>
      )}
    </div>
  );
}

export { STATE_STYLES };
export default AgentMarkers;
