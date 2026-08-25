import { type RefObject, useCallback, useEffect, useRef } from "react";

export type Camera = {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
};

export const PERSPECTIVE = 1200;

const MIN_Z = -200;
const MAX_Z = -10000;
const MAX_TILT = 80;

type UseBoardCameraOptions = {
  /**
   * Where the camera sits when the scene opens and after a reset. It is a
   * function because the answer depends on the viewport size and on how wide
   * the scene turned out to be.
   */
  initial: () => Camera;
};

export type BoardCamera = {
  viewportRef: RefObject<HTMLDivElement | null>;
  worldRef: RefObject<HTMLDivElement | null>;
  /** Puts the camera back where it started. */
  reset: () => void;
  /** Flies the camera to a place in the scene, keeping the current angles. */
  flyTo: (target: Partial<Camera>) => void;
};

/**
 * Drives a CSS 3D scene: drag to pan, right button or a modifier to orbit,
 * wheel to zoom.
 *
 * The camera lives in a ref and is written straight to the DOM instead of
 * going through state: a re-render per pointer move would drop frames on a
 * scene that already carries hundreds of cards. React only ever sees the
 * scene contents, never the camera.
 */
export function useBoardCamera({
  initial,
}: UseBoardCameraOptions): BoardCamera {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const dragRef = useRef<{
    mode: "pan" | "rotate" | null;
    lastX: number;
    lastY: number;
  }>({ mode: null, lastX: 0, lastY: 0 });

  const apply = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera || !worldRef.current) return;
    worldRef.current.style.transform = `translate3d(${-camera.x}px, ${-camera.y}px, ${camera.z}px) rotateX(${camera.rx}deg) rotateY(${camera.ry}deg)`;
  }, []);

  const reset = useCallback(() => {
    cameraRef.current = initialRef.current();
    apply();
  }, [apply]);

  const flyTo = useCallback(
    (target: Partial<Camera>) => {
      const camera = cameraRef.current ?? initialRef.current();
      cameraRef.current = { ...camera, ...target };
      apply();
    },
    [apply],
  );

  useEffect(() => {
    if (!cameraRef.current) cameraRef.current = initialRef.current();
    apply();
  }, [apply]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("button")) return;
      dragRef.current = {
        mode:
          event.button === 2 || event.ctrlKey || event.shiftKey
            ? "rotate"
            : "pan",
        lastX: event.clientX,
        lastY: event.clientY,
      };
      viewport.setPointerCapture?.(event.pointerId);
      viewport.style.cursor = "grabbing";
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const camera = cameraRef.current;
      if (!drag.mode || !camera) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (drag.mode === "pan") {
        const sensitivity = camera.z / -PERSPECTIVE;
        camera.x -= dx * sensitivity;
        camera.y -= dy * sensitivity;
      } else {
        camera.ry += dx * 0.3;
        camera.rx -= dy * 0.3;
        camera.rx = Math.min(MAX_TILT, Math.max(-MAX_TILT, camera.rx));
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      apply();
    };

    const endDrag = () => {
      dragRef.current.mode = null;
      viewport.style.cursor = "grab";
    };

    const onWheel = (event: WheelEvent) => {
      // wheel over an overflowing task list scrolls the list; the camera
      // only zooms once the list cannot scroll further in that direction
      const scroller = (event.target as Element | null)?.closest?.(
        "[data-board3d-scroll]",
      );
      if (
        scroller instanceof HTMLElement &&
        scroller.scrollHeight > scroller.clientHeight
      ) {
        const atTop = scroller.scrollTop <= 0;
        const atBottom =
          scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - 1;
        if (event.deltaY < 0 ? !atTop : !atBottom) return;
      }
      event.preventDefault();
      const camera = cameraRef.current;
      if (!camera) return;
      camera.z += event.deltaY * 2;
      camera.z = Math.min(MIN_Z, Math.max(MAX_Z, camera.z));
      apply();
    };

    const onContextMenu = (event: Event) => event.preventDefault();

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("contextmenu", onContextMenu);
    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", endDrag);
      viewport.removeEventListener("pointercancel", endDrag);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("contextmenu", onContextMenu);
    };
  }, [apply]);

  return { viewportRef, worldRef, reset, flyTo };
}
