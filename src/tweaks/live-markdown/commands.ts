/** Keys and selections handed to Notion's editor, which reacts to synthetic key events. */

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

export interface KeyInit {
  key: string;
  code: string;
  keyCode: number;
  /** ⌘ on macOS, Ctrl elsewhere. Defaults to true. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export function sendKey(target: EventTarget, init: KeyInit): void {
  const mod = init.mod ?? true;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: init.key,
      code: init.code,
      keyCode: init.keyCode,
      which: init.keyCode,
      metaKey: mod && IS_MAC,
      ctrlKey: mod && !IS_MAC,
      shiftKey: init.shift ?? false,
      altKey: init.alt ?? false,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

export function letterKey(letter: string, extra: Partial<KeyInit> = {}): KeyInit {
  const upper = letter.toUpperCase();
  return { key: letter, code: `Key${upper}`, keyCode: upper.charCodeAt(0), ...extra };
}

export const ESCAPE: KeyInit = { key: "Escape", code: "Escape", keyCode: 27, mod: false };

/** Waits for the next animation frames, letting Notion render. */
export async function frames(count = 1): Promise<void> {
  for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls once per frame until `find` returns something, or gives up after `timeout` ms. */
export function waitFor<T>(find: () => T | null | undefined, timeout = 1000): Promise<T | null> {
  const deadline = performance.now() + timeout;
  return new Promise((resolve) => {
    const check = () => {
      const found = find();
      if (found) resolve(found);
      else if (performance.now() > deadline) resolve(null);
      else requestAnimationFrame(check);
    };
    check();
  });
}

export function select(range: Range): void {
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Closes an open equation editor and waits for it to go. */
export async function closeEditor(editor: HTMLElement): Promise<void> {
  sendKey(editor, ESCAPE);
  await waitFor(() => !editor.isConnected);
}
