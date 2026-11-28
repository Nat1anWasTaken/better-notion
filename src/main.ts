import { runTweaks } from "./runner";
import { gmBackend } from "./settings/gm-backend";
import { mountSettingsSection } from "./settings/settings-section";
import { SettingsStore } from "./settings/store";
import { StatusBoard } from "./status";
import { tweaks } from "./tweaks";

const store = new SettingsStore(gmBackend);
const status = new StatusBoard();
runTweaks(tweaks, store, status);

try {
  mountSettingsSection(tweaks, store, status);
} catch (error) {
  console.error("[better-notion] settings section failed", error);
}
