import { type RefObject, useCallback, useEffect, useRef } from "react";

/**
 * Камера CSS-3D сцены: панорама, вращение и наезд колесом.
 *
 * Вынесена из KanbanBoard3D, чтобы одну доску и пространственный экран с
 * несколькими досками не разносило по управлению: жесты обязаны совпадать,
 * иначе переключение между экранами каждый раз переучивает руки.
 */

export type Camera = {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
};

export const DEFAULT_PERSPECTIVE = 1200;

type UseSpatialCameraOptions = {
  /**
   * Начальное положение. Получает фактическую ширину области просмотра —
   * она уже ширины окна на сайдбар и поля, а кадрировать надо по ней.
   */
  initial: (viewportWidth: number) => Camera;
  perspective?: number;
  /** Насколько далеко можно отъехать. Многодосочной сцене нужно дальше. */
  minZ?: number;
};

export type SpatialCamera = {
  viewportRef: RefObject<HTMLDivElement | null>;
  worldRef: RefObject<HTMLDivElement | null>;
  resetCamera: () => void;
  perspective: number;
};

export function useSpatialCamera({
  initial,
  perspective = DEFAULT_PERSPECTIVE,
  minZ = -10000,
}: UseSpatialCameraOptions): SpatialCamera {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const measure = () =>
    viewportRef.current?.clientWidth ||
    (typeof window === "undefined" ? 1280 : window.innerWidth);
  const cameraRef = useRef<Camera>(initial(measure()));
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const dragRef = useRef<{
    mode: "pan" | "rotate" | null;
    lastX: number;
    lastY: number;
  }>({ mode: null, lastX: 0, lastY: 0 });

  const applyCamera = useCallback(() => {
    const camera = cameraRef.current;
    if (!worldRef.current) return;
    worldRef.current.style.transform = `translate3d(${-camera.x}px, ${-camera.y}px, ${camera.z}px) rotateX(${camera.rx}deg) rotateY(${camera.ry}deg)`;
  }, []);

  // Пересоздаётся при каждом изменении initial: сцена меняет состав, и
  // «сбросить камеру» должно означать новый кадр, а не старый.
  const resetCamera = useCallback(() => {
    cameraRef.current = initialRef.current(
      viewportRef.current?.clientWidth ||
        (typeof window === "undefined" ? 1280 : window.innerWidth),
    );
    applyCamera();
  }, [applyCamera]);

  useEffect(() => {
    applyCamera();
  }, [applyCamera]);

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
      if (!drag.mode) return;
      const camera = cameraRef.current;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (drag.mode === "pan") {
        const sensitivity = camera.z / -perspective;
        camera.x -= dx * sensitivity;
        camera.y -= dy * sensitivity;
      } else {
        camera.ry += dx * 0.3;
        camera.rx -= dy * 0.3;
        camera.rx = Math.min(80, Math.max(-80, camera.rx));
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      applyCamera();
    };

    const endDrag = () => {
      dragRef.current.mode = null;
      viewport.style.cursor = "grab";
    };

    const onWheel = (event: WheelEvent) => {
      // колесо над прокручиваемым списком листает список; камера наезжает
      // только когда список дальше в эту сторону не прокручивается
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
      camera.z += event.deltaY * 2;
      camera.z = Math.min(-200, Math.max(minZ, camera.z));
      applyCamera();
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
  }, [applyCamera, perspective, minZ]);

  return { viewportRef, worldRef, resetCamera, perspective };
}
