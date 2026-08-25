import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import getAgentActivity from "@/fetchers/agent-activity/get-agent-activity";
import type { AgentPresence } from "@/types/agent";
import { getWsUrl } from "./use-project-websocket";

/**
 * Живое присутствие агентов на нескольких досках сразу.
 *
 * Одно соединение на доску: сервер разводит вещание по проектам, и
 * мультиплексировать их на клиенте значило бы дублировать эту логику. Экран
 * рассчитан на единицы досок, а не на сотни.
 *
 * Хук заодно обесценивает кэш задач на TASK_*: иначе карточки на сцене
 * замирали бы, пока агенты продолжают шевелиться.
 */

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const PING_INTERVAL_MS = 30_000;

type PresenceByProject = Record<string, AgentPresence[]>;

export function useAgentPresence(projectIds: string[]): PresenceByProject {
  const queryClient = useQueryClient();
  const [presence, setPresence] = useState<PresenceByProject>({});
  // Строка-ключ: массив пересоздаётся на каждом рендере родителя, и без
  // сравнения по содержимому соединения переоткрывались бы бесконечно.
  const key = projectIds.join(",");
  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setPresence({});
      return;
    }

    let disposed = false;
    const sockets: WebSocket[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const pings: ReturnType<typeof setInterval>[] = [];

    for (const projectId of ids) {
      void getAgentActivity(projectId)
        .then((agents) => {
          if (disposed) return;
          setPresence((prev) => ({ ...prev, [projectId]: agents }));
        })
        .catch(() => {
          // Снимок — удобство, а не обязательное условие: без него экран
          // наполнится с первым же сообщением по сокету.
        });

      let retries = 0;

      const connect = () => {
        if (disposed) return;
        const ws = new WebSocket(getWsUrl(projectId));
        sockets.push(ws);

        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
        pings.push(ping);

        ws.onopen = () => {
          retries = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "AGENT_PRESENCE") {
              setPresence((prev) => ({
                ...prev,
                [projectId]: (message.agents ?? []) as AgentPresence[],
              }));
              return;
            }
            if (
              typeof message.type === "string" &&
              message.type.startsWith("TASK_")
            ) {
              void queryClient.invalidateQueries({
                queryKey: ["tasks", projectId],
              });
            }
          } catch {
            // Битое сообщение не должно ронять сокет: следующее может быть целым.
          }
        };

        ws.onclose = () => {
          clearInterval(ping);
          if (disposed || retries >= MAX_RETRIES) return;
          const delay = BASE_DELAY * 2 ** retries;
          retries += 1;
          timers.push(setTimeout(connect, delay));
        };
      };

      connect();
    }

    return () => {
      disposed = true;
      for (const t of timers) clearTimeout(t);
      for (const p of pings) clearInterval(p);
      for (const ws of sockets) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [key, queryClient]);

  return presence;
}

/** Все агенты со всех досок — для сводки в шапке экрана. */
export function flattenPresence(presence: PresenceByProject): AgentPresence[] {
  return Object.values(presence).flat();
}
