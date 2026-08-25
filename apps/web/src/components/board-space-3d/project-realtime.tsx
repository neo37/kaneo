import { useProjectWebSocket } from "@/hooks/use-project-websocket";

/**
 * Keeps one project's live updates flowing while the board space is open.
 *
 * The websocket hook is scoped to a single project, and hooks cannot be called
 * in a loop, so watching several boards means mounting one of these per board.
 * It renders nothing: its whole job is the subscription.
 */
function ProjectRealtime({
  projectId,
  onMessage,
}: {
  projectId: string;
  onMessage?: (message: { type?: string } & Record<string, unknown>) => void;
}) {
  useProjectWebSocket(projectId, { onMessage });
  return null;
}

export default ProjectRealtime;
