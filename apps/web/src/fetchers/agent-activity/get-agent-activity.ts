import type { AgentPresence } from "@/types/agent";
import { getApiUrl } from "../get-api-url";

/**
 * Снимок агентов проекта.
 *
 * Нужен только при первом рендере: дальше состав приезжает по WebSocket
 * сообщением AGENT_PRESENCE. Без снимка экран был бы пустым до первого
 * отчёта агента, а это до полутора минут.
 */
async function getAgentActivity(projectId: string): Promise<AgentPresence[]> {
  const response = await fetch(
    getApiUrl(`agent-activity/${encodeURIComponent(projectId)}`),
    { credentials: "include" },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as AgentPresence[];
}

export default getAgentActivity;
