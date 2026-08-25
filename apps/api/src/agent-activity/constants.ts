/**
 * Shared vocabulary for the agent connector.
 *
 * Kept dependency-free so both the HTTP module and the WebSocket broadcast
 * adapter can import it without creating a cycle.
 */

export const AGENT_ACTIVITY_STATES = [
  "started",
  "progress",
  "blocked",
  "finished",
  "failed",
] as const;

export type AgentActivityState = (typeof AGENT_ACTIVITY_STATES)[number];

/** `activity.external_source` value that marks a row as an agent run. */
export const AGENT_EXTERNAL_SOURCE = "agent";

/** `activity.type` value for agent runs. */
export const AGENT_ACTIVITY_TYPE = "agent_status";

/** WebSocket message type carrying an agent status payload. */
export const AGENT_ACTIVITY_MESSAGE_TYPE = "AGENT_ACTIVITY";

const AGENT_KEY_MAX_LENGTH = 120;

/**
 * Stable identity of one agent on one task.
 *
 * `agentId` is what a caller should send (a capsule id, a run id); the display
 * name is only a fallback so a minimal integration still deduplicates. Two
 * agents whose display names differ solely in stripped punctuation would
 * collapse onto one key, which is why `agentId` is the documented path.
 */
export function toAgentKey(
  agentId: string | undefined | null,
  agent: string,
): string {
  const normalized = (agentId ?? agent)
    .trim()
    .toLowerCase()
    // Any run of separators or unsupported characters collapses to one dash so
    // "капсула s03 · постановщик" and "капсула s03 — постановщик" do not become
    // two different keys through stray punctuation.
    .replace(/[^\p{L}\p{N}._:-]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return (normalized || AGENT_EXTERNAL_SOURCE).slice(0, AGENT_KEY_MAX_LENGTH);
}

/**
 * Value stored in `activity.external_url`, which together with
 * `(task_id, external_source)` forms the existing unique constraint and is
 * therefore the idempotency key for agent ticks. It is intentionally synthetic
 * rather than the agent's live-session URL: that URL can rotate between ticks
 * of the same run, and a rotating key would defeat deduplication. The real link
 * lives in `event_data.url`.
 */
export function toAgentDedupeUrl(agentKey: string): string {
  return `agent:${agentKey}`;
}
