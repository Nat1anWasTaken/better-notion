import type { Tweak } from "./tweaks/types";

/** Runs every tweak, isolating failures so one broken tweak can't take down the rest. */
export function runTweaks(tweaks: readonly Tweak[]): void {
  for (const tweak of tweaks) {
    try {
      tweak.run();
    } catch (error) {
      console.error(`[better-notion] tweak "${tweak.id}" failed`, error);
    }
  }
}
