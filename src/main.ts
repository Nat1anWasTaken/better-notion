import { runTweaks } from "./runner";
import { gmBackend } from "./settings/gm-backend";
import { SettingsStore } from "./settings/store";
import { tweaks } from "./tweaks";

const store = new SettingsStore(gmBackend);
runTweaks(tweaks, store);
