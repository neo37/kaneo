import { beforeEach, describe, expect, it } from "vitest";
import { MAX_BOARDS, useBoardSpaceStore } from "./board-space";

describe("board space selection", () => {
  beforeEach(() => {
    useBoardSpaceStore.setState({ boardsByWorkspace: {} });
  });

  it("keeps a selection per workspace", () => {
    const { toggleBoard } = useBoardSpaceStore.getState();
    toggleBoard("ws-1", "project-a");
    toggleBoard("ws-2", "project-b");

    const { boardsByWorkspace } = useBoardSpaceStore.getState();
    expect(boardsByWorkspace["ws-1"]).toEqual(["project-a"]);
    expect(boardsByWorkspace["ws-2"]).toEqual(["project-b"]);
  });

  it("toggles a board off again", () => {
    const { toggleBoard } = useBoardSpaceStore.getState();
    toggleBoard("ws-1", "project-a");
    toggleBoard("ws-1", "project-a");
    expect(useBoardSpaceStore.getState().boardsByWorkspace["ws-1"]).toEqual([]);
  });

  it("refuses to grow past the render budget", () => {
    const { toggleBoard } = useBoardSpaceStore.getState();
    for (let i = 0; i < MAX_BOARDS + 3; i++) {
      toggleBoard("ws-1", `project-${i}`);
    }
    expect(
      useBoardSpaceStore.getState().boardsByWorkspace["ws-1"],
    ).toHaveLength(MAX_BOARDS);
  });

  it("caps a whole selection set at once", () => {
    const { setBoards } = useBoardSpaceStore.getState();
    setBoards(
      "ws-1",
      Array.from({ length: MAX_BOARDS + 4 }, (_, i) => `project-${i}`),
    );
    expect(
      useBoardSpaceStore.getState().boardsByWorkspace["ws-1"],
    ).toHaveLength(MAX_BOARDS);
  });
});
