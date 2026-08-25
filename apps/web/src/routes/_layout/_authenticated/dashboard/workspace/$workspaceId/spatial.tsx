import { useQueries } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Boxes, Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import SpatialBoards, {
  type SpatialBoard,
  type SpatialTask,
} from "@/components/spatial-boards/SpatialBoards";
import getTasks from "@/fetchers/task/get-tasks";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { flattenPresence, useAgentPresence } from "@/hooks/use-agent-presence";


/**
 * Пространственный экран: несколько досок сразу, живая работа агентов.
 *
 * Набор досок выбирает пользователь и он же хранится локально: это настройка
 * рабочего места, а не свойство рабочего пространства — у соседа за тем же
 * столом набор будет другим.
 */

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/spatial",
)({
  component: RouteComponent,
});

function storageKey(workspaceId: string) {
  return `kaneo:spatial-boards:${workspaceId}`;
}

function loadSelection(workspaceId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    // Приватное окно или испорченное значение — начинаем с пустого набора.
    return [];
  }
}

function saveSelection(workspaceId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(ids));
  } catch {
    // Не сохранилось — экран продолжает работать, просто забудет выбор.
  }
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { data: projects, isLoading } = useGetProjects({ workspaceId });
  const [selected, setSelected] = useState<string[]>(() => loadSelection(workspaceId));
  const [pickerOpen, setPickerOpen] = useState(false);

  // Первый заход: показываем первые несколько досок, иначе экран встречает
  // пустотой и непонятно, что он вообще делает.
  useEffect(() => {
    if (!projects || projects.length === 0) return;
    setSelected((current) => {
      const alive = current.filter((id) => projects.some((p) => p.id === id));
      if (alive.length > 0) return alive.length === current.length ? current : alive;
      return projects.slice(0, 3).map((p) => p.id);
    });
  }, [projects]);

  useEffect(() => {
    saveSelection(workspaceId, selected);
  }, [workspaceId, selected]);

  const boardQueries = useQueries({
    queries: selected.map((projectId) => ({
      queryKey: ["tasks", projectId],
      queryFn: () => getTasks(projectId),
      enabled: !!projectId,
    })),
  });

  const boards = useMemo(
    () =>
      boardQueries
        .map((query) => query.data)
        .filter((data): data is NonNullable<typeof data> => Boolean(data)),
    [boardQueries],
  );

  const presence = useAgentPresence(selected);
  const agents = useMemo(() => flattenPresence(presence), [presence]);

  const toggle = useCallback((projectId: string) => {
    setSelected((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }, []);

  const openTask = useCallback(
    (projectId: string, task: SpatialTask) => {
      navigate({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
        params: { workspaceId, projectId },
        search: { taskId: task.id },
      });
    },
    [navigate, workspaceId],
  );

  const busyAgents = agents.filter((agent) => agent.taskId).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageTitle title={t("tasks:spatial.title")} />

      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {t("tasks:spatial.title")}
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            {t("tasks:spatial.boardsSelected", { count: selected.length })}
            <ChevronDown className="h-3 w-3" />
          </button>

          {pickerOpen && (
            <div className="absolute top-8 left-0 z-50 max-h-80 w-72 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
              {isLoading && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {t("tasks:spatial.loadingList")}
                </div>
              )}
              {projects?.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {t("tasks:spatial.noBoards")}
                </div>
              )}
              {projects?.map((project) => {
                const checked = selected.includes(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => toggle(project.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent/60"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{project.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {agents.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="tabular-nums">
                {t("tasks:spatial.agentsBusy", {
                  busy: busyAgents,
                  total: agents.length,
                })}
              </span>
            </span>
          ) : (
            <span>{t("tasks:spatial.agentsIdle")}</span>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {selected.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm">
              <p className="text-sm font-medium text-foreground">
                {t("tasks:spatial.emptyTitle")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks:spatial.emptyHint")}
              </p>
            </div>
          </div>
        ) : boards.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("tasks:spatial.loadingBoards")}
          </div>
        ) : (
          <SpatialBoards
            boards={boards as SpatialBoard[]}
            presence={presence}
            onOpenTask={openTask}
          />
        )}
      </div>
    </div>
  );
}
