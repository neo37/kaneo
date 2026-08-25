import { RotateCcw } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type Camera, useSpatialCamera } from "@/hooks/use-spatial-camera";
import { type TaskMove, useTaskMotion } from "@/hooks/use-task-motion";
import { getPriorityIcon } from "@/lib/priority";
import type { AgentPresence, AgentState } from "@/types/agent";

/**
 * Несколько досок в одном пространстве, с живой работой агентов.
 *
 * Доски стоят в ряд и слегка развёрнуты к камере: так с одной точки видно и
 * состав каждой, и что задачи переезжают. Агенты показаны маркерами над той
 * колонкой, где лежит их задача — привязка к самой карточке потребовала бы
 * измерять DOM на каждом кадре, а колонка даёт то же понимание дешевле.
 */

/**
 * Сцене нужно немногое: имя, колонки и карточки. Требовать полный
 * ProjectWithTasks значило бы привязать её к форме ответа конкретной ручки —
 * а данные сюда приходят из разных запросов.
 */
export type SpatialTask = {
  id: string;
  title: string;
  number?: number | null;
  priority?: string | null;
};

export type SpatialColumn = {
  id: string;
  name: string;
  tasks: SpatialTask[];
};

export type SpatialBoard = {
  id: string;
  name: string;
  columns: SpatialColumn[];
};

type SpatialBoardsProps = {
  boards: SpatialBoard[];
  presence: Record<string, AgentPresence[]>;
  onOpenTask?: (projectId: string, task: SpatialTask) => void;
};

const COLUMN_WIDTH = 240;
const COLUMN_GAP = 34;
const BOARD_GAP = 380;
const PERSPECTIVE = 1400;

const STATE_STYLE: Record<AgentState, { dot: string; chip: string }> = {
  thinking: {
    dot: "bg-amber-500",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  editing: {
    dot: "bg-sky-500",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  running: {
    dot: "bg-violet-500",
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  waiting: {
    dot: "bg-zinc-400",
    chip: "border-zinc-400/40 bg-zinc-400/10 text-zinc-600 dark:text-zinc-300",
  },
  review: {
    dot: "bg-cyan-500",
    chip: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  },
  done: {
    dot: "bg-emerald-500",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  failed: {
    dot: "bg-rose-500",
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

function boardWidth(columnCount: number): number {
  if (columnCount === 0) return COLUMN_WIDTH;
  return columnCount * COLUMN_WIDTH + (columnCount - 1) * COLUMN_GAP;
}

/** Положение колонки внутри доски: лёгкая дуга, края уходят вглубь. */
function columnTransform(index: number, count: number) {
  const total = boardWidth(count);
  const x = index * (COLUMN_WIDTH + COLUMN_GAP) - total / 2;
  const center = (count - 1) / 2;
  const offset = index - center;
  return { x, z: -Math.abs(offset) * 30, ry: -offset * 4 };
}

/**
 * Отдаление, при котором сцена целиком попадает в кадр.
 *
 * Фиксированное значение не годится: одна доска оказывается неразличимо
 * далеко, а шесть не помещаются. В CSS-3D объект на глубине z уменьшается в
 * P/(P+|z|) раз, отсюда и обратная формула.
 */
function framingZ(sceneWidth: number, viewportWidth: number): number {
  const target = Math.max(320, viewportWidth * 0.86);
  const z = -PERSPECTIVE * Math.max(0, sceneWidth / target - 1);
  return Math.min(-700, Math.max(-18000, z));
}

function defaultCamera(sceneWidth: number, viewportWidth: number): Camera {
  return {
    x: 0,
    y: 0,
    z: framingZ(sceneWidth, viewportWidth),
    rx: 14,
    ry: -14,
  };
}

function SpatialBoards({
  boards,
  presence,
  onOpenTask,
}: SpatialBoardsProps): ReactElement {
  const { t } = useTranslation();
  // Ширина сцены нужна и раскладке, и камере, поэтому считается один раз.
  const sceneWidth = useMemo(() => {
    if (boards.length === 0) return 0;
    return (
      boards.reduce((sum, b) => sum + boardWidth(b.columns.length), 0) +
      (boards.length - 1) * BOARD_GAP
    );
  }, [boards]);

  const { viewportRef, worldRef, resetCamera, perspective } = useSpatialCamera({
    initial: (viewportWidth) => defaultCamera(sceneWidth, viewportWidth),
    perspective: PERSPECTIVE,
    minZ: -20000,
  });

  // Кадр строится по ширине сцены, а она известна только после загрузки досок.
  // Зависимость именно на ширину: при обычном обновлении задач она не меняется,
  // и камеру, которую пользователь успел покрутить, никто не трогает.
  useEffect(() => {
    resetCamera();
  }, [resetCamera, sceneWidth]);

  const moves = useTaskMotion(boards);

  // Доски раскладываются по X от общего центра: сцена остаётся симметричной
  // независимо от того, сколько досок выбрано.
  const layout = useMemo(() => {
    const widths = boards.map((b) => boardWidth(b.columns.length));
    let cursor = -sceneWidth / 2;
    return boards.map((boardItem, index) => {
      const width = widths[index] ?? COLUMN_WIDTH;
      const x = cursor + width / 2;
      cursor += width + BOARD_GAP;
      return { board: boardItem, x, width };
    });
  }, [boards, sceneWidth]);

  const movesByProject = useMemo(() => {
    const grouped = new Map<string, TaskMove[]>();
    for (const move of moves) {
      const list = grouped.get(move.projectId) ?? [];
      list.push(move);
      grouped.set(move.projectId, list);
    }
    return grouped;
  }, [moves]);

  const openTask = useCallback(
    (projectId: string, task: SpatialTask) => onOpenTask?.(projectId, task),
    [onOpenTask],
  );

  return (
    <div
      ref={viewportRef}
      data-spatial-viewport
      className="relative h-full w-full cursor-grab select-none overflow-hidden bg-background"
      style={{ perspective: `${perspective}px` }}
    >
      <div
        ref={worldRef}
        data-spatial-world
        className="pointer-events-none absolute h-full w-full transition-transform duration-100 ease-out"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{ transformStyle: "preserve-3d" }}
        >
          {layout.map(({ board, x, width }) => {
            const agents = presence[board.id] ?? [];
            const taskColumn = new Map<string, number>();
            let taskCount = 0;
            board.columns.forEach((column, columnIndex) => {
              taskCount += column.tasks.length;
              for (const task of column.tasks) {
                taskColumn.set(task.id, columnIndex);
              }
            });

            const agentsByColumn = new Map<number, AgentPresence[]>();
            const idleAgents: AgentPresence[] = [];
            for (const agent of agents) {
              const columnIndex = agent.taskId
                ? taskColumn.get(agent.taskId)
                : undefined;
              if (columnIndex === undefined) {
                idleAgents.push(agent);
                continue;
              }
              const list = agentsByColumn.get(columnIndex) ?? [];
              list.push(agent);
              agentsByColumn.set(columnIndex, list);
            }

            return (
              <div
                key={board.id}
                data-spatial-board={board.id}
                className="absolute"
                style={{
                  transform: `translate3d(${x}px, 0px, 0px)`,
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Табличка доски: имя и две цифры, которые и нужны издалека */}
                <div
                  data-spatial-board-plate
                  className="pointer-events-auto absolute flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border/70 bg-card/90 px-4 py-2 shadow-lg backdrop-blur-sm"
                  style={{ transform: "translate3d(-50%, -300px, 60px)" }}
                >
                  <span className="text-sm font-medium text-foreground">
                    {board.name}
                  </span>
                  <span className="rounded bg-accent px-1.5 text-xs tabular-nums text-muted-foreground">
                    {taskCount}
                  </span>
                  {agents.length > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                      {agents.length}
                    </span>
                  )}
                </div>

                {board.columns.map((column, columnIndex) => {
                  const pos = columnTransform(
                    columnIndex,
                    board.columns.length,
                  );
                  const columnAgents = agentsByColumn.get(columnIndex) ?? [];
                  return (
                    <div
                      key={column.id}
                      data-spatial-column={column.id}
                      className="pointer-events-auto absolute flex max-h-[420px] w-[240px] flex-col rounded-xl border border-border/70 bg-muted/40 shadow-lg backdrop-blur-sm dark:bg-card/90"
                      style={{
                        transform: `translate3d(${pos.x}px, -180px, ${pos.z}px) rotateY(${pos.ry}deg)`,
                        transformStyle: "preserve-3d",
                      }}
                    >
                      {/* Агенты висят над колонкой, где лежит их задача */}
                      {columnAgents.length > 0 && (
                        <div
                          data-spatial-agents
                          className="absolute right-0 -top-2 left-0 flex flex-wrap justify-center gap-1"
                          style={{ transform: "translate3d(0, -100%, 40px)" }}
                        >
                          {columnAgents.map((agent) => (
                            <AgentChip key={agent.agentId} agent={agent} />
                          ))}
                        </div>
                      )}

                      <div className="shrink-0 border-b border-border/60 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {column.name}
                          </span>
                          <span className="rounded bg-accent px-1.5 text-xs tabular-nums text-muted-foreground">
                            {column.tasks.length}
                          </span>
                        </div>
                      </div>

                      <div
                        data-board3d-scroll
                        className="min-h-0 flex-1 touch-pan-y space-y-2 overflow-y-auto px-2 py-2"
                      >
                        {column.tasks.map((task) => {
                          const busy = columnAgents.some(
                            (agent) => agent.taskId === task.id,
                          );
                          return (
                            <button
                              key={task.id}
                              type="button"
                              data-spatial-task={task.id}
                              onClick={() => openTask(board.id, task)}
                              className={`w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition-colors hover:bg-accent/40 ${
                                busy
                                  ? "border-emerald-500/60 ring-1 ring-emerald-500/30"
                                  : "border-border hover:border-ring/40"
                              }`}
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
                          );
                        })}
                        {column.tasks.length === 0 && (
                          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                            —
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Агенты без задачи — на «причале» под доской */}
                {idleAgents.length > 0 && (
                  <div
                    data-spatial-dock
                    className="pointer-events-auto absolute flex -translate-x-1/2 flex-wrap justify-center gap-1 rounded-lg border border-border/50 bg-card/70 px-2 py-1.5 backdrop-blur-sm"
                    style={{
                      transform: "translate3d(-50%, 270px, 40px)",
                      width: `${Math.min(width, 460)}px`,
                    }}
                  >
                    {idleAgents.map((agent) => (
                      <AgentChip key={agent.agentId} agent={agent} />
                    ))}
                  </div>
                )}

                {/* Переезды: летящая метка от колонки к колонке */}
                {(movesByProject.get(board.id) ?? []).map((move) => {
                  const from = columnTransform(
                    move.fromColumn,
                    board.columns.length,
                  );
                  const to = columnTransform(
                    move.toColumn,
                    board.columns.length,
                  );
                  return (
                    <div
                      key={`${move.taskId}-${move.startedAt}`}
                      data-spatial-move={move.taskId}
                      className="pointer-events-none absolute rounded-full border border-emerald-500/60 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-emerald-700 shadow-lg backdrop-blur-sm dark:text-emerald-300"
                      style={{
                        transform: `translate3d(${to.x}px, -240px, ${to.z + 60}px)`,
                        animation: `spatial-move-${move.taskId.replace(/[^a-zA-Z0-9]/g, "")} 1.4s ease-in-out forwards`,
                      }}
                    >
                      <style>{`@keyframes spatial-move-${move.taskId.replace(/[^a-zA-Z0-9]/g, "")} {
                        0% { transform: translate3d(${from.x}px, -240px, ${from.z + 60}px) scale(0.85); opacity: 0; }
                        15% { opacity: 1; }
                        85% { opacity: 1; }
                        100% { transform: translate3d(${to.x}px, -240px, ${to.z + 60}px) scale(1); opacity: 0; }
                      }`}</style>
                      {move.title || t("tasks:spatial.task")} →
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute right-3 bottom-3 flex items-center gap-2">
        <button
          type="button"
          onClick={resetCamera}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          {t("tasks:spatial.camera")}
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
        {t("tasks:spatial.hint")}
      </div>
    </div>
  );
}

function AgentChip({ agent }: { agent: AgentPresence }): ReactElement {
  const { t } = useTranslation();
  const style = STATE_STYLE[agent.state];
  const title = [
    agent.name,
    agent.capsule,
    t(`tasks:spatial.state.${agent.state}`),
    agent.message,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      data-spatial-agent={agent.agentId}
      title={title}
      className={`inline-flex max-w-[150px] items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur-sm ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="truncate">{agent.capsule ?? agent.name}</span>
    </span>
  );
}

export default SpatialBoards;
