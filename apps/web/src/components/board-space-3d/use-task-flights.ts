import { type RefObject, useLayoutEffect, useRef } from "react";

type Placement = {
  columnKey: string;
  rect: DOMRect;
};

const FLIGHT_MS = 900;
const LANDING_MS = 1400;

/**
 * Animates a task card flying from the column it left to the column it landed
 * in, whenever the data underneath re-renders it somewhere else.
 *
 * The card itself is not animated: it lives inside a `preserve-3d` world whose
 * ancestors are rotated and pushed away from the camera, so a transform on the
 * card would move it in that skewed local space, not across the screen. A copy
 * of the card is flown in screen space above the scene instead, and it lands
 * exactly where the real card now is.
 *
 * Nothing here needs the server to say what moved: both rectangles are
 * measured on our side, before and after the render. That keeps the animation
 * working for every source of change — a colleague dragging a card, an agent
 * moving it through the API, or a plain refetch.
 */
export function useTaskFlights(
  viewportRef: RefObject<HTMLElement | null>,
  signature: string,
): void {
  const previous = useRef(new Map<string, Placement>());

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (signature === "") {
      // Ни одной карточки на экране: доски ещё грузятся или все сняты. Старые
      // прямоугольники к тому моменту, когда данные вернутся, будут врать —
      // карточка «прилетит» из места, где её давно нет.
      previous.current = new Map();
      return;
    }

    const cards = viewport.querySelectorAll<HTMLElement>(
      "[data-task-card][data-task-id]",
    );
    const current = new Map<string, Placement>();

    for (const card of cards) {
      const taskId = card.dataset.taskId;
      const columnKey = card.dataset.columnKey;
      if (!taskId || !columnKey) continue;

      const rect = card.getBoundingClientRect();
      current.set(taskId, { columnKey, rect });

      const before = previous.current.get(taskId);
      if (!before || before.columnKey === columnKey) continue;
      // A card can be measured while the scene is off-screen or collapsed;
      // flying a zero-sized ghost would only flash a dot.
      if (rect.width === 0 || before.rect.width === 0) continue;

      flyGhost(card, before.rect, rect);
      pulse(card);
    }

    previous.current = current;
  }, [viewportRef, signature]);
}

function flyGhost(card: HTMLElement, from: DOMRect, to: DOMRect): void {
  if (typeof card.animate !== "function") return;

  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-task-card");
  ghost.removeAttribute("data-task-id");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "40",
  });
  document.body.appendChild(ghost);

  const dx = to.left - from.left;
  const dy = to.top - from.top;
  // The arc lifts the card off the board so the move reads as a flight rather
  // than a slide behind the columns it passes over.
  const lift = Math.min(180, Math.max(40, Math.hypot(dx, dy) * 0.25));

  const flight = ghost.animate(
    [
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
      {
        transform: `translate3d(${dx / 2}px, ${dy / 2 - lift}px, 0) scale(1.06)`,
        opacity: 1,
        offset: 0.5,
      },
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)`,
        opacity: 0.15,
      },
    ],
    { duration: FLIGHT_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  );
  flight.addEventListener("finish", () => ghost.remove());
  flight.addEventListener("cancel", () => ghost.remove());
}

function pulse(card: HTMLElement): void {
  if (typeof card.animate !== "function") return;
  card.animate(
    [
      { boxShadow: "0 0 0 0 var(--ring, rgb(99 102 241))" },
      { boxShadow: "0 0 0 6px transparent" },
    ],
    { duration: LANDING_MS, easing: "ease-out" },
  );
}
