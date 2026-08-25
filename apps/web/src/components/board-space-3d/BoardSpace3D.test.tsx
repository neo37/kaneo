import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectWithTasks } from "@/types/project";
import BoardSpace3D, { type BoardSpaceBoard } from "./BoardSpace3D";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "count" in options ? `${key}:${options.count}` : key,
  }),
}));

function makeTask(id: string, title: string, number: number) {
  return {
    id,
    title,
    number,
    description: null,
    status: "to-do",
    priority: "medium",
    startDate: null,
    dueDate: null,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: "Alex",
    projectId: "p1",
  };
}

function makeProject(
  id: string,
  name: string,
  columns: Array<{ id: string; name: string; tasks: string[] }>,
): ProjectWithTasks {
  return {
    id,
    name,
    columns: columns.map((column) => ({
      id: column.id,
      name: column.name,
      tasks: column.tasks.map((taskId, index) =>
        makeTask(taskId, `Task ${taskId}`, index + 1),
      ),
    })),
  } as unknown as ProjectWithTasks;
}

function board(
  projectId: string,
  name: string,
  project?: ProjectWithTasks,
  overrides: Partial<BoardSpaceBoard> = {},
): BoardSpaceBoard {
  return {
    projectId,
    name,
    project,
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

const cardflow = makeProject("p1", "Cardflow", [
  { id: "c1", name: "To do", tasks: ["t1", "t2"] },
  { id: "c2", name: "Done", tasks: [] },
]);
const filemanager = makeProject("p2", "Filemanager", [
  { id: "c3", name: "Backlog", tasks: ["t3"] },
]);

describe("BoardSpace3D", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows every selected board with its columns", () => {
    render(
      <BoardSpace3D
        boards={[
          board("p1", "Cardflow", cardflow),
          board("p2", "Filemanager", filemanager),
        ]}
      />,
    );

    expect(screen.getAllByText("Cardflow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Filemanager").length).toBeGreaterThan(0);
    expect(screen.getByText("To do")).toBeTruthy();
    expect(screen.getByText("Backlog")).toBeTruthy();
  });

  it("places boards side by side and never on top of each other", () => {
    const { container } = render(
      <BoardSpace3D
        boards={[
          board("p1", "Cardflow", cardflow),
          board("p2", "Filemanager", filemanager),
        ]}
      />,
    );

    const groups = container.querySelectorAll("[data-board-group]");
    expect(groups).toHaveLength(2);
    const xs = [...groups].map((group) => {
      const transform = (group as HTMLElement).style.transform;
      const match = transform.match(/translate3d\((-?[\d.]+)px/);
      return Number(match?.[1]);
    });
    expect(xs[0]).toBeLessThan(xs[1]);
  });

  it("marks each card with the board and column it sits in", () => {
    const { container } = render(
      <BoardSpace3D boards={[board("p1", "Cardflow", cardflow)]} />,
    );
    const card = container.querySelector('[data-task-id="t1"]');
    expect(card?.getAttribute("data-column-key")).toBe("p1:c1");
  });

  it("opens a task in its own board", () => {
    const onOpenTask = vi.fn();
    const { container } = render(
      <BoardSpace3D
        boards={[board("p1", "Cardflow", cardflow)]}
        onOpenTask={onOpenTask}
      />,
    );
    const card = container.querySelector('[data-task-id="t2"]');
    if (!(card instanceof HTMLElement)) throw new Error("no card");
    fireEvent.click(card);
    expect(onOpenTask).toHaveBeenCalledWith("p1", "t2");
  });

  it("counts the cards it does not draw instead of drawing all of them", () => {
    const crowded = makeProject("p3", "Crowded", [
      {
        id: "c4",
        name: "Backlog",
        tasks: Array.from({ length: 14 }, (_, i) => `x${i}`),
      },
    ]);
    const { container } = render(
      <BoardSpace3D boards={[board("p3", "Crowded", crowded)]} />,
    );
    expect(container.querySelectorAll("[data-task-card]")).toHaveLength(8);
    expect(screen.getByText("tasks:boardSpace.more:6")).toBeTruthy();
  });

  it("says what is happening with a board that has no data yet", () => {
    render(
      <BoardSpace3D
        boards={[
          board("p1", "Cardflow", undefined, { isLoading: true }),
          board("p2", "Filemanager", undefined, {
            isLoading: false,
            isError: true,
          }),
        ]}
      />,
    );
    expect(screen.getByText("tasks:boardSpace.boardLoading")).toBeTruthy();
    expect(screen.getByText("tasks:boardSpace.boardError")).toBeTruthy();
  });

  it("lets the camera be moved and put back", () => {
    const { container } = render(
      <BoardSpace3D boards={[board("p1", "Cardflow", cardflow)]} />,
    );
    const viewport = container.querySelector("[data-board3d-viewport]");
    const world = container.querySelector("[data-board3d-world]");
    if (!(viewport instanceof HTMLElement) || !(world instanceof HTMLElement)) {
      throw new Error("no scene");
    }
    const initial = world.style.transform;

    fireEvent(
      viewport,
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      }),
    );
    fireEvent(
      viewport,
      new MouseEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: 260,
        clientY: 160,
      }),
    );
    expect(world.style.transform).not.toBe(initial);

    fireEvent.click(screen.getByText("tasks:board3d.reset"));
    expect(world.style.transform).toBe(initial);
  });
});
