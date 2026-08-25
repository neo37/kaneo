import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Which boards a person wants to watch at once, per workspace.
 *
 * The selection is a view preference, not shared state: two people watching
 * the same workspace usually care about different boards. It therefore lives
 * next to the other view preferences in the browser rather than on the server,
 * and is keyed by workspace so switching workspaces does not carry an
 * unrelated selection along.
 */
type BoardSpaceStore = {
  boardsByWorkspace: Record<string, string[]>;
  setBoards: (workspaceId: string, projectIds: string[]) => void;
  toggleBoard: (workspaceId: string, projectId: string) => void;
  clearBoards: (workspaceId: string) => void;
};

export const MAX_BOARDS = 6;

export const useBoardSpaceStore = create<BoardSpaceStore>()(
  persist(
    (set) => ({
      boardsByWorkspace: {},

      setBoards: (workspaceId, projectIds) =>
        set((state) => ({
          boardsByWorkspace: {
            ...state.boardsByWorkspace,
            [workspaceId]: projectIds.slice(0, MAX_BOARDS),
          },
        })),

      toggleBoard: (workspaceId, projectId) =>
        set((state) => {
          const current = state.boardsByWorkspace[workspaceId] ?? [];
          const next = current.includes(projectId)
            ? current.filter((id) => id !== projectId)
            : // The cap is a rendering limit, not a matter of taste: every
              // extra board multiplies the cards the 3D scene has to compose.
              [...current, projectId].slice(0, MAX_BOARDS);
          return {
            boardsByWorkspace: {
              ...state.boardsByWorkspace,
              [workspaceId]: next,
            },
          };
        }),

      clearBoards: (workspaceId) =>
        set((state) => ({
          boardsByWorkspace: {
            ...state.boardsByWorkspace,
            [workspaceId]: [],
          },
        })),
    }),
    {
      name: "board-space",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
