export type AgentState =
  | "thinking"
  | "editing"
  | "running"
  | "waiting"
  | "review"
  | "done"
  | "failed";

/** Чем занят агент прямо сейчас. Приходит снимком, а не дельтой. */
export type AgentPresence = {
  agentId: string;
  name: string;
  capsule?: string;
  taskId: string | null;
  state: AgentState;
  message?: string;
  updatedAt: string;
};
