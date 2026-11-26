export interface Tweak {
  /** Stable identifier, used in logs. */
  id: string;
  description: string;
  run: () => void;
}
