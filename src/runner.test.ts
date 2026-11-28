import { describe, expect, it, vi } from "vitest";
import { runTweaks } from "./runner";
import { memoryBackend, SettingsStore } from "./settings/store";
import { StatusBoard } from "./status";
import type { Tweak } from "./tweaks/types";

function tweak(overrides: Partial<Tweak> & Pick<Tweak, "id">): Tweak {
  return { name: overrides.id, description: "", run: () => undefined, ...overrides };
}

describe("runTweaks", () => {
  it("keeps running tweaks after one throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();

    runTweaks(
      [
        tweak({
          id: "broken",
          run: () => {
            throw new Error("boom");
          },
        }),
        tweak({ id: "after", run: after }),
      ],
      new SettingsStore(memoryBackend()),
      new StatusBoard(),
    );

    expect(after).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("skips disabled tweaks and starts them when enabled", () => {
    const run = vi.fn(() => undefined);
    const t = tweak({ id: "off", defaultEnabled: false, run });
    const store = new SettingsStore(memoryBackend());

    runTweaks([t], store, new StatusBoard());
    expect(run).not.toHaveBeenCalled();

    store.setEnabled(t, true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("calls the cleanup when a tweak is disabled", () => {
    const cleanup = vi.fn();
    const t = tweak({ id: "on", run: () => cleanup });
    const store = new SettingsStore(memoryBackend());

    runTweaks([t], store, new StatusBoard());
    store.setEnabled(t, false);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("notifies running tweaks of option changes", () => {
    const seen: unknown[] = [];
    const t = tweak({
      id: "opts",
      options: [{ type: "toggle", key: "flag", label: "Flag", default: false }],
      run: (ctx) => {
        ctx.onOptionChange(() => seen.push(ctx.getOption("flag")));
        return undefined;
      },
    });
    const store = new SettingsStore(memoryBackend());

    runTweaks([t], store, new StatusBoard());
    store.setOption(t, "flag", true);
    expect(seen).toEqual([true]);
  });

  it("shows a tweak's notice while it runs and clears it when it stops", () => {
    const t = tweak({
      id: "notice",
      run: (ctx) => {
        ctx.setNotice("Not on this Notion");
        return () => {};
      },
    });
    const store = new SettingsStore(memoryBackend());
    const status = new StatusBoard();

    runTweaks([t], store, status);
    expect(status.get("notice")).toBe("Not on this Notion");
    store.setEnabled(t, false);
    expect(status.get("notice")).toBeUndefined();
  });
});
