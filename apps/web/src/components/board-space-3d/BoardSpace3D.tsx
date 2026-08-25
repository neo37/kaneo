import { Radio, RotateCcw } from "lucide-react";
import { type ReactElement, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type Camera,
  PERSPECTIVE,
  useBoardCamera,
} from "@/hooks/use-board-camera";
import { getPriorityIcon } from "@/lib/priority";
import type { ProjectWithTasks } from "@/types/project";
import { useTaskFlights } from "./use-task-flights";

export type BoardSpaceBoard = {
  projectId: string;
  name: string;
  project?: ProjectWithTasks;
  isLoading: boolean;
  isError: boolean;
};

type BoardSpace3DProps = {
  boards: BoardSpaceBoard[];
  onOpenTask?: (projectId: string, taskId: string) => void;
};

const COLUMN_WIDTH = 260;
const COLUMN_GAP = 36;
const BOARD_GAP = 280;
const PLACEHOLDER_COLUMNS = 4;
// Beyond this a column stops listing cards and starts counting them: the
// scene is meant to show movement across boards, and a column scrolled to its
// hundredth card shows nothing at a distance anyway.
const VISIBLE_TASKS = 8;

type PlacedBoard = {
  board: BoardSpaceBoard;
  x: number;
  width: number;
  ry: number;
  z: number;
};

function boardWidth(board: BoardSpaceBoard): number {
  const columns = board.project?.columns.length ?? PLACEHOLDER_COLUMNS;
  return columns * COLUMN_WIDTH + Math.max(0, columns - 1) * COLUMN_GAP;
}

/** Lays the boards out left to right and turns each one toward the camera. */
function placeBoards(boards: BoardSpaceBoard[]): {
  placed: PlacedBoard[];
  totalWidth: number;
} {
  const widths = boards.map(boardWidth);
  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, boards.length - 1) * BOARD_GAP;

  let cursor = -totalWidth / 2;
  const placed = boards.map((board, index) => {
    const width = widths[index];
    const x = cursor + width / 2;
    cursor += width + BOARD_GAP;
    // Outer boards recede and rotate inward, so the row reads as a room
    // rather than a flat strip: without it the far boards are unreadable.
    const center = (boards.length - 1) / 2;
    const offset = boards.length > 1 ? (index - center) / center : 0;
    return { board, x, width, ry: -offset * 22, z: -Math.abs(offset) * 260 };
  });
  return { placed, totalWidth };
}

function BoardSpace3D({ boards, onOpenTask }: BoardSpace3DProps): ReactElement {
  const { t } = useTranslation();

  const { placed, totalWidth } = useMemo(() => placeBoards(boards), [boards]);

  const initialCamera = useCallback((): Camera => {
    // Pull back far enough that the whole row fits, and no further.
    const fit = -(totalWidth + 600) * (window.innerWidth < 768 ? 1.6 : 0.85);
    return {
      x: 0,
      y: 0,
      z: Math.min(-1200, Math.max(-9000, fit)),
      rx: 14,
      ry: 0,
    };
  }, [totalWidth]);

  const { viewportRef, worldRef, reset, flyTo } = useBoardCamera({
    initial: initialCamera,
  });

  // A card that changed column changes this string, and that is exactly when
  // the flight animation has something to show.
  const placement = useMemo(
    () =>
      boards
        .flatMap(
          (board) =>
            board.project?.columns.flatMap((column) =>
              column.tasks.map((task) => `${task.id}@${column.id}`),
            ) ?? [],
        )
        .join(","),
    [boards],
  );
  useTaskFlights(viewportRef, placement);

  const focusBoard = useCallback(
    (x: number) => flyTo({ x, y: 0, z: -1600, ry: 0 }),
    [flyTo],
  );

  const taskCount = useMemo(
    () =>
      boards.reduce(
        (sum, board) =>
          sum +
          (board.project?.columns.reduce(
            (columnSum, column) => columnSum + column.tasks.length,
            0,
          ) ?? 0),
        0,
      ),
    [boards],
  );

  return (
    <div
      ref={viewportRef}
      data-board3d-viewport
      data-boardspace
      className="relative h-full w-full cursor-grab select-none overflow-hidden bg-background"
      style={{ perspective: `${PERSPECTIVE}px` }}
    >
      <div
        ref={worldRef}
        data-board3d-world
        className="pointer-events-none absolute h-full w-full transition-transform duration-100 ease-out"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{ transformStyle: "preserve-3d" }}
        >
          {placed.map(({ board, x, width, ry, z }) => (
            <div
              key={board.projectId}
              data-board-group={board.projectId}
              className="absolute"
              style={{
                transform: `translate3d(${x}px, 0px, ${z}px) rotateY(${ry}deg)`,
                transformStyle: "preserve-3d",
              }}
            >
              <div
                className="pointer-events-auto absolute -translate-x-1/2 rounded-lg border border-border/70 bg-card/90 px-4 py-2 text-center shadow-lg backdrop-blur-sm"
                style={{ transform: "translate3d(0px, -260px, 40px)" }}
              >
                <div className="text-sm font-medium text-foreground">
                  {board.name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {board.isError
                    ? t("tasks:boardSpace.boardError")
                    : board.isLoading
                      ? t("tasks:boardSpace.boardLoading")
                      : t("tasks:boardSpace.boardTasks", {
                          count:
                            board.project?.columns.reduce(
                              (sum, column) => sum + column.tasks.length,
                              0,
                            ) ?? 0,
                        })}
                </div>
              </div>

              {(board.project?.columns ?? []).map((column, index) => {
                const columnCount = board.project?.columns.length ?? 1;
                const columnX = index * (COLUMN_WIDTH + COLUMN_GAP) - width / 2;
                const center = (columnCount - 1) / 2;
                const offset = index - center;
                const visible = column.tasks.slice(0, VISIBLE_TASKS);
                const hidden = column.tasks.length - visible.length;
                return (
                  <div
                    key={column.id}
                    className="pointer-events-auto absolute flex max-h-[520px] w-[260px] flex-col rounded-xl border border-border/70 bg-muted/40 shadow-lg backdrop-blur-sm dark:bg-card/90"
                    style={{
                      transform: `translate3d(${columnX}px, -150px, ${-Math.abs(offset) * 30}px) rotateY(${-offset * 4}deg)`,
                      transformStyle: "preserve-3d",
                    }}
                  >
                    <div className="shrink-0 border-b border-border/60 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {column.name}
                        </span>
                        <span className="rounded bg-accent px-1.5 text-xs text-muted-foreground">
                          {column.tasks.length}
                        </span>
                      </div>
                    </div>
                    <div
                      data-board3d-scroll
                      className="min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto px-2 py-2"
                    >
                      {visible.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          data-task-card
                          data-task-id={task.id}
                          data-column-key={`${board.projectId}:${column.id}`}
                          onClick={() => onOpenTask?.(board.projectId, task.id)}
                          className="w-full rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-ring/40 hover:bg-accent/40"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 shrink-0">
                              {getPriorityIcon(task.priority ?? "")}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-[11px] text-muted-foreground">
                                {task.number != null && `#${task.number}`}
                              </div>
                              <div className="line-clamp-2 text-xs text-foreground">
                                {task.title}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                      {hidden > 0 && (
                        <div className="px-2 py-1 text-center text-[11px] text-muted-foreground">
                          {t("tasks:boardSpace.more", { count: hidden })}
                        </div>
                      )}
                      {column.tasks.length === 0 && (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute top-3 left-3 flex max-w-[70%] flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
          <Radio className="h-3 w-3 text-emerald-500" />
          {t("tasks:boardSpace.live", { count: taskCount })}
        </span>
        {placed.map(({ board, x }) => (
          <button
            key={board.projectId}
            type="button"
            onClick={() => focusBoard(x)}
            className="pointer-events-auto inline-flex h-6 max-w-[160px] items-center rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <span className="truncate">{board.name}</span>
          </button>
        ))}
      </div>

      <div className="absolute right-3 bottom-3 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          {t("tasks:board3d.reset")}
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
        {t("tasks:board3d.hint")}
      </div>
    </div>
  );
}

export default BoardSpace3D;
