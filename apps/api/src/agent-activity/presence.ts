import type { AgentPresence } from "../ws/broadcast-adapter";

/**
 * Присутствие агентов в памяти процесса.
 *
 * Хранилище намеренно не в базе: это состояние живёт секунды и переживать
 * перезапуск не должно. Агент, который перестал слать отметки, исчезает сам по
 * истечении TTL — иначе на доске навсегда зависали бы призраки капсул,
 * которые давно стёрты.
 *
 * Ограничение: состояние локально для экземпляра API. При нескольких
 * экземплярах за балансировщиком каждый видит своих агентов; вещание через
 * Redis-адаптер разносит снимки, но снимок будет неполным. Для нескольких
 * экземпляров присутствие нужно переносить в Redis — отмечено в README.
 */

const DEFAULT_TTL_MS = 90_000;
const SWEEP_INTERVAL_MS = 15_000;

type Entry = { presence: AgentPresence; expiresAt: number };

const byProject = new Map<string, Map<string, Entry>>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let onExpire: ((projectId: string) => void) | null = null;

export function setExpiryHandler(handler: (projectId: string) => void) {
  onExpire = handler;
}

export function upsert(
  projectId: string,
  presence: AgentPresence,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  if (!byProject.has(projectId)) {
    byProject.set(projectId, new Map());
  }
  byProject.get(projectId)?.set(presence.agentId, {
    presence,
    expiresAt: Date.now() + ttlMs,
  });
  ensureSweeping();
}

export function remove(projectId: string, agentId: string): boolean {
  const agents = byProject.get(projectId);
  if (!agents) return false;
  const existed = agents.delete(agentId);
  if (agents.size === 0) byProject.delete(projectId);
  return existed;
}

export function snapshot(projectId: string): AgentPresence[] {
  const agents = byProject.get(projectId);
  if (!agents) return [];
  const now = Date.now();
  const live: AgentPresence[] = [];
  for (const [agentId, entry] of agents) {
    if (entry.expiresAt <= now) {
      agents.delete(agentId);
      continue;
    }
    live.push(entry.presence);
  }
  if (agents.size === 0) byProject.delete(projectId);
  // Порядок стабильный: иначе маркеры на сцене прыгали бы при каждом снимке.
  return live.sort((a, b) => a.agentId.localeCompare(b.agentId));
}

/** Убирает протухшие записи и сообщает, в каких проектах состав изменился. */
export function sweep(): string[] {
  const now = Date.now();
  const changed: string[] = [];
  for (const [projectId, agents] of byProject) {
    let removed = false;
    for (const [agentId, entry] of agents) {
      if (entry.expiresAt <= now) {
        agents.delete(agentId);
        removed = true;
      }
    }
    if (removed) changed.push(projectId);
    if (agents.size === 0) byProject.delete(projectId);
  }
  return changed;
}

function ensureSweeping() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const changed = sweep();
    for (const projectId of changed) onExpire?.(projectId);
    if (byProject.size === 0 && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, SWEEP_INTERVAL_MS);
  // Таймер не должен держать процесс живым при остановке сервера.
  sweepTimer.unref?.();
}

/** Только для тестов: полная очистка. */
export function reset(): void {
  byProject.clear();
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
