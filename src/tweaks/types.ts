interface OptionBase {
  key: string;
  label: string;
  description?: string;
}

export interface ToggleOption extends OptionBase {
  type: "toggle";
  default: boolean;
}

export interface SelectOption extends OptionBase {
  type: "select";
  default: string;
  choices: readonly { value: string; label: string }[];
}

/** A user-facing option, rendered in the Better Notion settings section. */
export type OptionDef = ToggleOption | SelectOption;

export interface TweakContext {
  /** Current value of one of the tweak's options, falling back to its default. */
  getOption: <T = unknown>(key: string) => T;
  /** Calls `listener` whenever the settings change while the tweak runs. Returns an unsubscribe. */
  onOptionChange: (listener: () => void) => () => void;
}

export interface Tweak {
  /** Stable identifier, used in logs and as the settings key. */
  id: string;
  /** Short name shown in the settings section. */
  name: string;
  description: string;
  /** Whether the tweak runs before the user changes it in settings. Defaults to `true`. */
  defaultEnabled?: boolean;
  options?: readonly OptionDef[];
  /**
   * Starts the tweak. Return a cleanup to let it be turned off without a reload; it should undo
   * everything the tweak changed.
   */
  run: (ctx: TweakContext) => (() => void) | undefined;
}
