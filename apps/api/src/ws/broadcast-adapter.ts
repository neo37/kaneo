/** Чем занят агент прямо сейчас. */
export type AgentState =
  | "thinking"
  | "editing"
  | "running"
  | "waiting"
  | "review"
  | "done"
  | "failed";

/** Присутствие одного агента на задаче. */
export type AgentPresence = {
  agentId: string;
  name: string;
  /** Капсула, на которой работает агент: s03. */
  capsule?: string;
  /** Задача, за которую агент взялся; null — агент подключён, но простаивает. */
  taskId: string | null;
  state: AgentState;
  /** Короткая строка «что сейчас», для подписи под маркером. */
  message?: string;
  updatedAt: string;
};

export type ProjectBroadcastMessage = {
  type: string;
  projectId: string;
  taskId?: string;
  sourceTaskId?: string;
  targetTaskId?: string;
  /**
   * Полный снимок присутствия агентов проекта — не дельта.
   *
   * broadcastToProject схлопывает сообщения по ключу `type:taskId:...`, поэтому
   * дельты от двух агентов на одной задаче потеряли бы друг друга. Снимок
   * делает схлопывание безопасным: побеждает последний, и он полон.
   */
  agents?: AgentPresence[];
};

export type BroadcastMessage = {
  projectId: string;
  message: ProjectBroadcastMessage;
  excludeInitiatorId?: string;
};

export type BroadcastAdapter = {
  /** Publish a message to all instances watching this project */
  publish(msg: BroadcastMessage): Promise<void>;

  /** Subscribe to messages for delivery to local connections */
  subscribe(handler: (msg: BroadcastMessage) => void): Promise<void>;

  /** Cleanup on shutdown */
  shutdown(): Promise<void>;
};
