import type { SettingsStore } from "./settings/store";
import type { StatusBoard } from "./status";
import type { Tweak, TweakContext } from "./tweaks/types";

interface Running {
  cleanup?: () => void;
  optionListeners: Set<() => void>;
}

function attempt(tweak: Tweak, action: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.error(`[better-notion] tweak "${tweak.id}" failed to ${action}`, error);
  }
}

/**
 * Runs every enabled tweak and starts or stops tweaks as their settings change. Failures are
 * isolated so one broken tweak can't take down the rest.
 */
export function runTweaks(
  tweaks: readonly Tweak[],
  store: SettingsStore,
  status: StatusBoard,
): void {
  const running = new Map<Tweak, Running>();

  const start = (tweak: Tweak) => {
    const state: Running = { optionListeners: new Set() };
    const ctx: TweakContext = {
      getOption: (key) => store.getOption(tweak, key),
      onOptionChange: (listener) => {
        state.optionListeners.add(listener);
        return () => state.optionListeners.delete(listener);
      },
      setNotice: (notice) => {
        if (running.get(tweak) === state) status.set(tweak.id, notice);
      },
    };
    running.set(tweak, state);
    attempt(tweak, "start", () => {
      state.cleanup = tweak.run(ctx);
    });
  };

  const stop = (tweak: Tweak) => {
    const state = running.get(tweak);
    running.delete(tweak);
    if (!state) return;
    status.set(tweak.id, null);
    state.optionListeners.clear();
    if (state.cleanup) attempt(tweak, "stop", state.cleanup);
    else console.info(`[better-notion] tweak "${tweak.id}" stops after a reload`);
  };

  const sync = () => {
    for (const tweak of tweaks) {
      const enabled = store.isEnabled(tweak);
      const state = running.get(tweak);
      if (enabled && !state) start(tweak);
      else if (!enabled && state) stop(tweak);
      else if (state) {
        for (const listener of state.optionListeners) {
          attempt(tweak, "apply settings", listener);
        }
      }
    }
  };

  store.subscribe(sync);
  sync();
}
