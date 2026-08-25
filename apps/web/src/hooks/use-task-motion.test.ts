import { describe, expect, it } from "vitest";
import {
  diffPlacements,
  type PlacementMap,
  placementsOf,
} from "./use-task-motion";


function board(id: string, columns: Array<{ id: string; taskIds: string[] }>) {
  return {
    id,
    name: id,
    columns: columns.map((c) => ({
      id: c.id,
      name: c.id,
      tasks: c.taskIds.map((taskId) => ({ id: taskId, title: `задача ${taskId}` })),
    })),
  };
}

describe("placementsOf", () => {
  it("сопоставляет задаче доску и номер колонки", () => {
    const map = placementsOf([
      board("p1", [
        { id: "todo", taskIds: ["a"] },
        { id: "done", taskIds: ["b", "c"] },
      ]),
    ]);
    expect(map.get("a")).toEqual({ projectId: "p1", columnIndex: 0 });
    expect(map.get("c")).toEqual({ projectId: "p1", columnIndex: 1 });
  });
});

describe("diffPlacements", () => {
  const titles = new Map([["a", "задача a"]]);

  it("замечает переезд между колонками", () => {
    const prev: PlacementMap = new Map([["a", { projectId: "p1", columnIndex: 0 }]]);
    const next: PlacementMap = new Map([["a", { projectId: "p1", columnIndex: 2 }]]);
    const moves = diffPlacements(prev, next, titles, 100);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ taskId: "a", fromColumn: 0, toColumn: 2 });
  });

  it("молчит, когда ничего не двигалось", () => {
    const same: PlacementMap = new Map([["a", { projectId: "p1", columnIndex: 1 }]]);
    expect(diffPlacements(same, same, titles, 100)).toEqual([]);
  });

  it("не считает переездом новые задачи", () => {
    // Иначе первая загрузка выбросила бы анимацию на каждую карточку.
    const prev: PlacementMap = new Map();
    const next: PlacementMap = new Map([["a", { projectId: "p1", columnIndex: 0 }]]);
    expect(diffPlacements(prev, next, titles, 100)).toEqual([]);
  });

  it("не считает переездом смену доски", () => {
    // Перенос между проектами анимировать в рамках одной доски нечем.
    const prev: PlacementMap = new Map([["a", { projectId: "p1", columnIndex: 0 }]]);
    const next: PlacementMap = new Map([["a", { projectId: "p2", columnIndex: 1 }]]);
    expect(diffPlacements(prev, next, titles, 100)).toEqual([]);
  });
});
