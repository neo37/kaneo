import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentPresence } from "@/types/agent";
import SpatialBoards, { type SpatialBoard } from "./SpatialBoards";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function board(id: string, name: string): SpatialBoard {
  return {
    id,
    name,
    columns: [
      {
        id: `${id}-todo`,
        name: "To do",
        tasks: [
          {
            id: `${id}-t1`,
            title: "Фильтр по тегам",
            number: 1,
            priority: "medium",
          },
          {
            id: `${id}-t2`,
            title: "Массовый перенос",
            number: 2,
            priority: "low",
          },
        ],
      },
      { id: `${id}-done`, name: "Done", tasks: [] },
    ],
  };
}

function agent(overrides: Partial<AgentPresence> = {}): AgentPresence {
  return {
    agentId: "s03",
    name: "Аналитик s03",
    capsule: "s03",
    taskId: "a-t1",
    state: "editing",
    message: "правлю фильтр",
    updatedAt: "2026-08-25T21:00:00.000Z",
    ...overrides,
  };
}

afterEach(cleanup);

describe("SpatialBoards", () => {
  it("рисует каждую выбранную доску", () => {
    const { container } = render(
      <SpatialBoards
        boards={[board("a", "Студия"), board("b", "Платформа")]}
        presence={{}}
      />,
    );
    expect(screen.getByText("Студия")).toBeVisible();
    expect(screen.getByText("Платформа")).toBeVisible();
    expect(container.querySelectorAll("[data-spatial-board]")).toHaveLength(2);
  });

  it("разводит доски по разным точкам пространства", () => {
    // Иначе две доски встанут друг в друга и экран потеряет смысл.
    const { container } = render(
      <SpatialBoards
        boards={[board("a", "Студия"), board("b", "Платформа")]}
        presence={{}}
      />,
    );
    const boards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-spatial-board]"),
    );
    const xs = boards.map((el) => el.style.transform);
    expect(xs[0]).not.toEqual(xs[1]);
    expect(xs[0]).toContain("translate3d(");
  });

  it("ставит маркер агента над колонкой с его задачей", () => {
    const { container } = render(
      <SpatialBoards
        boards={[board("a", "Студия")]}
        presence={{ a: [agent()] }}
      />,
    );
    const marker = container.querySelector("[data-spatial-agent='s03']");
    expect(marker).not.toBeNull();
    const column = marker?.closest("[data-spatial-column]");
    expect(column?.getAttribute("data-spatial-column")).toBe("a-todo");
  });

  it("отправляет агента без задачи на причал под доской", () => {
    const { container } = render(
      <SpatialBoards
        boards={[board("a", "Студия")]}
        presence={{ a: [agent({ taskId: null, state: "waiting" })] }}
      />,
    );
    const dock = container.querySelector("[data-spatial-dock]");
    expect(dock?.querySelector("[data-spatial-agent='s03']")).not.toBeNull();
  });

  it("отправляет на причал и агента с задачей, которой нет на доске", () => {
    // Задачу могли перенести в другой проект: маркер не должен исчезать молча.
    const { container } = render(
      <SpatialBoards
        boards={[board("a", "Студия")]}
        presence={{ a: [agent({ taskId: "чужая-задача" })] }}
      />,
    );
    expect(
      container.querySelector("[data-spatial-dock] [data-spatial-agent='s03']"),
    ).not.toBeNull();
  });

  it("подсвечивает карточку, за которую взялся агент", () => {
    const { container } = render(
      <SpatialBoards
        boards={[board("a", "Студия")]}
        presence={{ a: [agent()] }}
      />,
    );
    const busy = container.querySelector("[data-spatial-task='a-t1']");
    const idle = container.querySelector("[data-spatial-task='a-t2']");
    expect(busy?.className).toContain("emerald");
    expect(idle?.className).not.toContain("emerald");
  });

  it("сообщает о клике по карточке доской и задачей", () => {
    const onOpenTask = vi.fn();
    const { container } = render(
      <SpatialBoards
        boards={[board("a", "Студия")]}
        presence={{}}
        onOpenTask={onOpenTask}
      />,
    );
    const card = container.querySelector("[data-spatial-task='a-t1']");
    if (!(card instanceof HTMLElement)) throw new Error("нет карточки");
    fireEvent.click(card);
    expect(onOpenTask).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ id: "a-t1" }),
    );
  });

  it("не падает без агентов", () => {
    const { container } = render(
      <SpatialBoards boards={[board("a", "Студия")]} presence={{}} />,
    );
    expect(container.querySelectorAll("[data-spatial-agent]")).toHaveLength(0);
    expect(container.querySelector("[data-spatial-dock]")).toBeNull();
  });
});
