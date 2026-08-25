import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskFlights } from "./use-task-flights";

type Card = { taskId: string; columnKey: string; left: number; top: number };

function Scene({ cards }: { cards: Card[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  useTaskFlights(
    viewportRef,
    cards.map((card) => `${card.taskId}@${card.columnKey}`).join(","),
  );
  return (
    <div ref={viewportRef}>
      {cards.map((card) => (
        <button
          key={card.taskId}
          type="button"
          data-task-card
          data-task-id={card.taskId}
          data-column-key={card.columnKey}
          ref={(node) => {
            if (!node) return;
            node.getBoundingClientRect = () =>
              ({
                left: card.left,
                top: card.top,
                width: 240,
                height: 80,
                right: card.left + 240,
                bottom: card.top + 80,
                x: card.left,
                y: card.top,
                toJSON: () => ({}),
              }) as DOMRect;
          }}
        >
          {card.taskId}
        </button>
      ))}
    </div>
  );
}

const animate = vi.fn(() => ({ addEventListener: vi.fn() }));

describe("useTaskFlights", () => {
  beforeEach(() => {
    animate.mockClear();
    // jsdom has no Web Animations API; the hook is expected to survive that,
    // so the stub is added deliberately and only for the tests that need it.
    (Element.prototype as unknown as { animate: unknown }).animate = animate;
  });

  afterEach(() => {
    cleanup();
    for (const ghost of document.querySelectorAll('[aria-hidden="true"]')) {
      ghost.remove();
    }
  });

  it("flies a card that changed column", () => {
    const before: Card[] = [
      { taskId: "t1", columnKey: "p1:todo", left: 0, top: 0 },
    ];
    const { rerender } = render(<Scene cards={before} />);
    expect(animate).not.toHaveBeenCalled();

    rerender(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p1:done", left: 600, top: 40 }]}
      />,
    );

    // one flight for the ghost, one pulse for the card that landed
    expect(animate).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it("ignores a card that only moved inside its column", () => {
    const { rerender } = render(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p1:todo", left: 0, top: 0 }]}
      />,
    );
    rerender(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p1:todo", left: 0, top: 300 }]}
      />,
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it("follows a card across boards", () => {
    const { rerender } = render(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p1:todo", left: 0, top: 0 }]}
      />,
    );
    rerender(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p2:todo", left: 1800, top: 0 }]}
      />,
    );
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("forgets positions while the scene is empty", () => {
    const { rerender } = render(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p1:todo", left: 0, top: 0 }]}
      />,
    );
    // boards deselected, then a card comes back somewhere else: it must not
    // fly in from a place it occupied minutes ago
    rerender(<Scene cards={[]} />);
    rerender(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p1:done", left: 900, top: 0 }]}
      />,
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it("survives a browser without the animation API", () => {
    (Element.prototype as unknown as { animate?: unknown }).animate = undefined;
    const { rerender } = render(
      <Scene
        cards={[{ taskId: "t1", columnKey: "p1:todo", left: 0, top: 0 }]}
      />,
    );
    expect(() =>
      rerender(
        <Scene
          cards={[{ taskId: "t1", columnKey: "p1:done", left: 600, top: 0 }]}
        />,
      ),
    ).not.toThrow();
  });
});
