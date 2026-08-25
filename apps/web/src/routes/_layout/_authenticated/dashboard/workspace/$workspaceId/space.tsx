import { useQueries } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Boxes, LayoutGrid } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import BoardSpace3D, {
  type BoardSpaceBoard,
} from "@/components/board-space-3d/BoardSpace3D";
import ProjectRealtime from "@/components/board-space-3d/project-realtime";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import getTasks from "@/fetchers/task/get-tasks";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useAgentActivity } from "@/hooks/use-agent-activity";
import { MAX_BOARDS, useBoardSpaceStore } from "@/store/board-space";
import type { ProjectWithTasks } from "@/types/project";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/space",
)({
  component: RouteComponent,
});

// Опрос оставлен как подстраховка на случай оборванного вебсокета — тот же
// интервал, что и у обычной доски, чтобы экран не расходился с ней в
// поведении.
const REFETCH_MS = 30000;

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: projects } = useGetProjects({ workspaceId });
  const selection = useBoardSpaceStore(
    (state) => state.boardsByWorkspace[workspaceId],
  );
  const toggleBoard = useBoardSpaceStore((state) => state.toggleBoard);
  const setBoards = useBoardSpaceStore((state) => state.setBoards);
  const clearBoards = useBoardSpaceStore((state) => state.clearBoards);

  // Ни разу не настраивал — показываем первые доски воркспейса, чтобы экран
  // не встречал пустотой. Осознанно очищенный выбор (пустой массив) уважаем.
  const activeIds = useMemo(() => {
    if (selection) return selection;
    return (projects ?? []).slice(0, 3).map((project) => project.id);
  }, [selection, projects]);

  const results = useQueries({
    queries: activeIds.map((projectId) => ({
      queryKey: ["tasks", projectId],
      queryFn: () => getTasks(projectId),
      refetchInterval: REFETCH_MS,
      enabled: !!projectId,
    })),
  });

  const boards: BoardSpaceBoard[] = useMemo(
    () =>
      activeIds.map((projectId, index) => {
        const result = results[index];
        const project = result?.data as ProjectWithTasks | undefined;
        return {
          projectId,
          name:
            project?.name ??
            projects?.find((candidate) => candidate.id === projectId)?.name ??
            projectId,
          project,
          isLoading: result?.isLoading ?? true,
          isError: result?.isError ?? false,
        };
      }),
    [activeIds, results, projects],
  );

  const { byTask, working, applyMessage } = useAgentActivity(activeIds);

  const openTask = (projectId: string, taskId: string) => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: { workspaceId, projectId },
      search: { taskId },
    });
  };

  return (
    <>
      <PageTitle title={t("tasks:boardSpace.title")} />
      <WorkspaceLayout
        title={t("tasks:boardSpace.title")}
        headerActions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="xs" className="gap-1">
                  <LayoutGrid className="h-3 w-3" />
                  {t("tasks:boardSpace.configure", {
                    count: activeIds.length,
                  })}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                {t("tasks:boardSpace.pick", { max: MAX_BOARDS })}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(projects ?? []).map((project) => {
                const checked = activeIds.includes(project.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={project.id}
                    checked={checked}
                    closeOnClick={false}
                    disabled={!checked && activeIds.length >= MAX_BOARDS}
                    onCheckedChange={() => {
                      // Первое же переключение превращает подставленный по
                      // умолчанию набор в явный выбор человека.
                      if (!selection) {
                        setBoards(
                          workspaceId,
                          checked
                            ? activeIds.filter((id) => id !== project.id)
                            : [...activeIds, project.id],
                        );
                        return;
                      }
                      toggleBoard(workspaceId, project.id);
                    }}
                  >
                    {project.name}
                  </DropdownMenuCheckboxItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => clearBoards(workspaceId)}>
                {t("tasks:boardSpace.clear")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {activeIds.map((projectId) => (
          <ProjectRealtime
            key={projectId}
            projectId={projectId}
            onMessage={applyMessage}
          />
        ))}
        {boards.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Boxes />
              </EmptyMedia>
              <EmptyTitle>{t("tasks:boardSpace.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("tasks:boardSpace.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="h-full w-full">
            <BoardSpace3D
              boards={boards}
              agentsByTask={byTask}
              workingAgents={working}
              onOpenTask={openTask}
            />
          </div>
        )}
      </WorkspaceLayout>
    </>
  );
}
