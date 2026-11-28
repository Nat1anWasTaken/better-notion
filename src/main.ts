import { runTweaks } from "./runner";
import { gmBackend } from "./settings/gm-backend";
import { mountSettingsSection } from "./settings/settings-section";
import { SettingsStore } from "./settings/store";
import { tweaks } from "./tweaks";

const store = new SettingsStore(gmBackend);
runTweaks(tweaks, store);

try {
  mountSettingsSection(tweaks, store);
} catch (error) {
  console.error("[better-notion] settings section failed", error);
}
