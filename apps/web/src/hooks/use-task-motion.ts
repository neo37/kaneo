import { useEffect, useRef, useState } from "react";
import type { SpatialBoard } from "@/components/spatial-boards/SpatialBoards";

/**
 * Замечает переезды задач между колонками, чтобы их было видно на сцене.
 *
 * Сервер шлёт TASK_MOVED без «откуда», а список задач приезжает перезапросом,
 * поэтому направление приходится выводить самим: сравнением расположения до и
 * после. Зато это работает и для правок, сделанных мимо websocket — например
 * при возврате на вкладку.
 */

export type Placement = { projectId: string; columnIndex: number };
export type PlacementMap = Map<string, Placement>;

export type TaskMove = {
  taskId: string;
  title: string;
  projectId: string;
  fromColumn: number;
  toColumn: number;
  /** Метка времени начала; по ней переезд снимается со сцены. */
  startedAt: number;
};

export const MOVE_LIFETIME_MS = 1600;

/** Расположение всех задач: задача → доска и номер колонки. */
export function placementsOf(boards: SpatialBoard[]): PlacementMap {
  const map: PlacementMap = new Map();
  for (const board of boards) {
    board.columns.forEach((column, columnIndex) => {
      for (const task of column.tasks) {
        map.set(task.id, { projectId: board.id, columnIndex });
      }
    });
  }
  return map;
}

/**
 * Переезды между двумя снимками расположения.
 *
 * Задачи, которых не было раньше, переездом не считаются: иначе первая же
 * загрузка выбросила бы на сцену анимацию каждой карточки.
 */
export function diffPlacements(
  prev: PlacementMap,
  next: PlacementMap,
  titles: Map<string, string>,
  now: number,
): TaskMove[] {
  const moves: TaskMove[] = [];
  for (const [taskId, placement] of next) {
    const before = prev.get(taskId);
    if (!before) continue;
    if (before.projectId !== placement.projectId) continue;
    if (before.columnIndex === placement.columnIndex) continue;
    moves.push({
      taskId,
      title: titles.get(taskId) ?? "",
      projectId: placement.projectId,
      fromColumn: before.columnIndex,
      toColumn: placement.columnIndex,
      startedAt: now,
    });
  }
  return moves;
}

export function useTaskMotion(boards: SpatialBoard[]): TaskMove[] {
  const [moves, setMoves] = useState<TaskMove[]>([]);
  const previousRef = useRef<PlacementMap | null>(null);

  useEffect(() => {
    const next = placementsOf(boards);
    const titles = new Map<string, string>();
    for (const board of boards) {
      for (const column of board.columns) {
        for (const task of column.tasks) titles.set(task.id, task.title);
      }
    }

    const previous = previousRef.current;
    previousRef.current = next;
    if (!previous) return;

    const fresh = diffPlacements(previous, next, titles, Date.now());
    if (fresh.length === 0) return;

    setMoves((current) => [...current, ...fresh]);
    const timer = setTimeout(() => {
      const cutoff = Date.now() - MOVE_LIFETIME_MS;
      setMoves((current) => current.filter((m) => m.startedAt > cutoff));
    }, MOVE_LIFETIME_MS + 50);
    return () => clearTimeout(timer);
  }, [boards]);

  return moves;
}
