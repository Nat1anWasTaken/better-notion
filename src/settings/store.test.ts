import { describe, expect, it } from "vitest";
import type { Tweak } from "../tweaks/types";
import { memoryBackend, SettingsStore } from "./store";

const tweak: Tweak = {
  id: "demo",
  name: "Demo",
  description: "",
  options: [
    {
      type: "select",
      key: "mode",
      label: "Mode",
      default: "a",
      choices: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    },
  ],
  run: () => undefined,
};

describe("SettingsStore", () => {
  it("falls back to defaults", () => {
    const store = new SettingsStore(memoryBackend());
    expect(store.isEnabled(tweak)).toBe(true);
    expect(store.getOption(tweak, "mode")).toBe("a");
  });

  it("ignores malformed stored values", () => {
    const store = new SettingsStore(memoryBackend({ demo: "nope", other: 3 }));
    expect(store.isEnabled(tweak)).toBe(true);
  });

  it("persists changes and keeps other options", () => {
    const backend = memoryBackend({ demo: { options: { other: 1 } } });
    const store = new SettingsStore(backend);
    store.setOption(tweak, "mode", "b");
    store.setEnabled(tweak, false);

    expect(backend.read()).toEqual({ demo: { enabled: false, options: { other: 1, mode: "b" } } });
    expect(new SettingsStore(backend).getOption(tweak, "mode")).toBe("b");
  });

  it("notifies subscribers until they unsubscribe", () => {
    const store = new SettingsStore(memoryBackend());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.setEnabled(tweak, false);
    unsubscribe();
    store.setEnabled(tweak, true);
    expect(calls).toBe(1);
  });
});
