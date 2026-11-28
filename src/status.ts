/**
 * Notices tweaks post about themselves, shown under them in the settings section. A tweak that
 * can't work on the current version of Notion says so here, so the user knows why it does nothing.
 */
export class StatusBoard {
  private readonly notices = new Map<string, string>();
  private readonly listeners = new Set<() => void>();

  get(tweakId: string): string | undefined {
    return this.notices.get(tweakId);
  }

  set(tweakId: string, notice: string | null): void {
    if ((this.notices.get(tweakId) ?? null) === notice) return;
    if (notice === null) this.notices.delete(tweakId);
    else this.notices.set(tweakId, notice);
    for (const listener of this.listeners) listener();
  }

  /** Calls `listener` after any change. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
