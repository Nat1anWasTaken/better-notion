/**
 * Edits go through Notion's own shortcuts and menus rather than the DOM, so they sync, land in
 * undo history and keep Notion's data consistent.
 */

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

export function digitKey(digit: number, extra: Partial<KeyInit> = {}): KeyInit {
  return { key: String(digit), code: `Digit${digit}`, keyCode: 48 + digit, ...extra };
}

export const ESCAPE: KeyInit = { key: "Escape", code: "Escape", keyCode: 27, mod: false };

/** Notion's menus react to pointer events, not just `click`. */
export function press(el: Element): void {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Event = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, view: window }));
  }
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

/** Replaces the selected range with plain text, through the browser's own editing path. */
export function replaceWithText(range: Range, text: string): void {
  select(range);
  document.execCommand("insertText", false, text);
}

/** Removes a link with the "Remove link" item (trash icon) in Notion's ⌘K link editor. */
export async function removeLink(leaf: HTMLElement, range: Range): Promise<boolean> {
  select(range);
  sendKey(leaf, letterKey("k"));
  const remove = await waitFor(() =>
    document
      .querySelector("[role=dialog] svg.trash")
      ?.closest("[role=option], [role=menuitem], [role=button]"),
  );
  if (remove) press(remove);
  else sendKey(document.activeElement ?? leaf, ESCAPE);
  return remove !== null;
}

/**
 * Sets the default background through the colour menu of Notion's selection toolbar. The menu's
 * swatches have no labels; the default background is the item just before the grey one.
 */
export async function removeHighlight(leaf: HTMLElement, range: Range): Promise<boolean> {
  select(range);
  const bold = await waitFor(() => document.querySelector("[role=button] svg.textBold"));
  const boldButton = bold?.closest("[role=button]");
  let toolbar = boldButton?.parentElement;
  while (toolbar && toolbar.querySelectorAll("[role=button]").length < 4) {
    toolbar = toolbar.parentElement;
  }
  if (!boldButton || !toolbar) return false;
  const buttons = [...toolbar.querySelectorAll("[role=button]")];
  const colour = buttons[buttons.indexOf(boldButton) - 1];
  if (!colour) return false;
  press(colour);

  const swatch = await waitFor(() => {
    const items = [...document.querySelectorAll("[role=menuitem], [role=option]")];
    const grey = items.findIndex((item) => item.querySelector('[style*="--c-graBacSec"]'));
    return grey > 0 ? items[grey - 1] : null;
  });
  if (swatch) press(swatch);
  sendKey(document.activeElement ?? leaf, ESCAPE);
  return swatch !== null;
}

/** Closes an open equation editor and waits for it to go. */
export async function closeEditor(editor: HTMLElement): Promise<void> {
  sendKey(editor, ESCAPE);
  await waitFor(() => !editor.isConnected);
}
