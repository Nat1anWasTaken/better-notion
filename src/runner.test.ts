import { describe, expect, it, vi } from "vitest";
import { runTweaks } from "./runner";

describe("runTweaks", () => {
  it("keeps running tweaks after one throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();

    runTweaks([
      {
        id: "broken",
        description: "",
        run: () => {
          throw new Error("boom");
        },
      },
      { id: "after", description: "", run: after },
    ]);

    expect(after).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
