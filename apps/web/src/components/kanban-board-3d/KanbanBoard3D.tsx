import { useNavigate } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { type ReactElement, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { type Camera, useSpatialCamera } from "@/hooks/use-spatial-camera";
import { getPriorityIcon } from "@/lib/priority";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";

type KanbanBoard3DProps = {
  project: ProjectWithTasks;
};

const COLUMN_WIDTH = 300;
const COLUMN_GAP = 60;

function defaultCamera(viewportWidth: number): Camera {
  return {
    x: 0,
    y: 0,
    z: viewportWidth < 768 ? -2200 : -1200,
    rx: 12,
    ry: -18,
  };
}

function KanbanBoard3D({ project }: KanbanBoard3DProps): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { viewportRef, worldRef, resetCamera, perspective } = useSpatialCamera({
    initial: defaultCamera,
  });

  const openTask = useCallback(
    (task: Task) => {
      navigate({
        to: ".",
        search: { taskId: task.id },
        replace: true,
      });
    },
    [navigate],
  );

  const columns = project.columns;
  const totalWidth =
    columns.length * COLUMN_WIDTH + (columns.length - 1) * COLUMN_GAP;

  return (
    <div
      ref={viewportRef}
      data-board3d-viewport
      className="relative h-full w-full overflow-hidden bg-background cursor-grab select-none"
      style={{ perspective: `${perspective}px` }}
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
          {columns.map((column, index) => {
            const x = index * (COLUMN_WIDTH + COLUMN_GAP) - totalWidth / 2;
            // slight arc: outer columns recede and turn toward the camera
            const center = (columns.length - 1) / 2;
            const offset = index - center;
            const z = -Math.abs(offset) * 40;
            const ry = -offset * 6;
            return (
              <div
                key={column.id}
                className="pointer-events-auto absolute flex max-h-[560px] w-[300px] flex-col rounded-xl border border-border/70 bg-muted/40 shadow-lg backdrop-blur-sm dark:bg-card/90"
                style={{
                  transform: `translate3d(${x}px, -150px, ${z}px) rotateY(${ry}deg)`,
                  transformStyle: "preserve-3d",
                }}
              >
                <div className="shrink-0 border-b border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
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
                  {column.tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      data-task-card
                      onClick={() => openTask(task)}
                      className="w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-ring/40 hover:bg-accent/40"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0">
                          {getPriorityIcon(task.priority ?? "")}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-xs text-muted-foreground">
                            {task.number != null && `#${task.number}`}
                          </div>
                          <div className="line-clamp-3 text-sm text-foreground">
                            {task.title}
                          </div>
                          {task.assigneeName && (
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {task.assigneeName}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
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
      </div>

      <div className="absolute right-3 bottom-3 flex items-center gap-2">
        <button
          type="button"
          onClick={resetCamera}
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

export default KanbanBoard3D;
