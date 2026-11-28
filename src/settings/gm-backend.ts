import {
  GM_addValueChangeListener,
  GM_getValue,
  GM_setValue,
} from "vite-plugin-monkey/dist/client";
import type { StorageBackend } from "./store";

const KEY = "settings";

/** Persists settings in the userscript manager's storage, which Notion's page can't read. */
export const gmBackend: StorageBackend = {
  read: () => GM_getValue(KEY, {}),
  write: (value) => GM_setValue(KEY, value),
  subscribe: (listener) => {
    GM_addValueChangeListener(KEY, (_key, _old, _new, remote) => {
      if (remote) listener();
    });
  },
};
