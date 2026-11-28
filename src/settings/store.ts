import type { Tweak } from "../tweaks/types";

/** Where settings persist. The userscript uses GM storage; tests use memory. */
export interface StorageBackend {
  read: () => unknown;
  write: (value: StoredSettings) => void;
  /** Calls `listener` when another tab changes the stored value. */
  subscribe: (listener: () => void) => void;
}

interface StoredTweakSettings {
  enabled?: boolean;
  options?: Record<string, unknown>;
}

/** Only values the user changed are stored; everything else comes from the tweak definitions. */
export type StoredSettings = Record<string, StoredTweakSettings>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class SettingsStore {
  private readonly listeners = new Set<() => void>();
  private settings: StoredSettings;

  constructor(private readonly backend: StorageBackend) {
    this.settings = this.load();
    backend.subscribe(() => {
      this.settings = this.load();
      this.emit();
    });
  }

  isEnabled(tweak: Tweak): boolean {
    return this.settings[tweak.id]?.enabled ?? tweak.defaultEnabled ?? true;
  }

  setEnabled(tweak: Tweak, enabled: boolean): void {
    this.update(tweak.id, (entry) => {
      entry.enabled = enabled;
    });
  }

  getOption<T = unknown>(tweak: Tweak, key: string): T {
    const stored = this.settings[tweak.id]?.options;
    if (stored && key in stored) return stored[key] as T;
    return tweak.options?.find((option) => option.key === key)?.default as T;
  }

  setOption(tweak: Tweak, key: string, value: unknown): void {
    this.update(tweak.id, (entry) => {
      entry.options = { ...entry.options, [key]: value };
    });
  }

  /** Calls `listener` after any change, local or from another tab. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): StoredSettings {
    const value = this.backend.read();
    if (!isRecord(value)) return {};
    const settings: StoredSettings = {};
    for (const [id, entry] of Object.entries(value)) {
      if (isRecord(entry)) settings[id] = entry as StoredTweakSettings;
    }
    return settings;
  }

  private update(id: string, change: (entry: StoredTweakSettings) => void): void {
    const entry = { ...this.settings[id] };
    change(entry);
    this.settings = { ...this.settings, [id]: entry };
    this.backend.write(this.settings);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("[better-notion] settings listener failed", error);
      }
    }
  }
}

/** An in-memory backend, for tests. */
export function memoryBackend(initial: unknown = {}): StorageBackend {
  let value = initial;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
    subscribe: () => {},
  };
}
