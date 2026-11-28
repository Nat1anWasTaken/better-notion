import { ESCAPE, type KeyInit, letterKey, select, sendKey } from "../commands";
import { cssString } from "../equation";
import { DRAWN } from "../model/blocks";
import { carry } from "../model/carry";
import { type Parsed, parse, toModel, toSource } from "../model/parse";
import { fromSpans, MENTION_CHAR, type Span, toSpans } from "../model/rich-text";
import { parseOptions, type SourceOptions, serialize } from "../model/serialize";
import type { BlockStore, BlockValue, Internals } from "../notion/internals";
import { atomLabels, findLeaf, LEAF } from "../notion/leaf";
import { rangeAt, textOffset } from "../text";
import { renderSource, revealMarkers } from "./render";

export type Direction = "up" | "down" | "left" | "right";

export interface SessionOptions {
  source: SourceOptions;
  /** Show the markers of the run under the caret only, or of the whole block. */
  reveal: "token" | "block";
}

/** What a session needs from the tweak around it. */
export interface SessionHost {
  options(): SessionOptions;
  /**
   * Closes the session, puts the caret back in Notion's text at a plain-text offset, and runs
   * `then` there, for keys and input Notion handles (Enter, Tab, `/`, undo, …).
   */
  handoff(session: Session, model: number, then?: (leaf: HTMLElement) => void): void;
  /**
   * Closes the session and puts the caret in Notion's text at once, during a key press, so the
   * key's own input goes to Notion.
   */
  release(session: Session, model: number, event: KeyboardEvent): void;
  /** Closes the session and moves the caret to the neighbouring block. */
  navigate(session: Session, direction: Direction, x: number): void;
  closed(session: Session): void;
  /** Saves, then changes the page's structure from this block: Enter, Backspace, Tab, … */
  restructure(session: Session, change: Restructure): void;
}

export type Restructure = "split" | "mergeUp" | "mergeDown" | "indent" | "outdent";

/** Style properties copied from Notion's text, so the source lines up with it. */
const BLOCK = "[data-block-id]";

/** How long after the user's last edit to wait before taking in edits made elsewhere, in ms. */
const REMOTE_QUIET = 1500;

const COPIED_STYLES = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "color",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "text-align",
  "caret-color",
];

/** Markdown for Notion's formatting shortcuts, applied around the selection. */
const WRAPS: Record<
  string,
  { open: string; close: string; shift?: boolean; syntax?: keyof SourceOptions }
> = {
  b: { open: "**", close: "**" },
  i: { open: "*", close: "*" },
  e: { open: "`", close: "`" },
  s: { open: "~~", close: "~~", shift: true },
  u: { open: "<u>", close: "</u>", syntax: "underline" },
  h: { open: "==", close: "==", shift: true, syntax: "highlight" },
  k: { open: "[", close: "]()" },
};

/** Shortcuts the browser handles in the editor itself. */
const NATIVE_SHORTCUTS = new Set(["a", "c", "x", "v"]);

function key(span: Span): string {
  return JSON.stringify(span.extras);
}

/**
 * A markdown editor in place of one block's text. It sits over Notion's text, which stays in the
 * page (hidden) so the layout and Notion's own state are kept, and writes every change back to
 * the block through Notion's transactions.
 */
export class Session {
  private currentBlockId = "";
  readonly el: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private currentType: string;
  private currentSpans: Span[];
  private source = "";
  private parsed: Parsed;
  /** Mention labels, by the mention's decorations. */
  private readonly labels = new Map<string, string>();
  /** The block's value as last seen, to tell remote edits from ours. */
  private seen: { title: unknown; type: string };
  private dirty = false;
  private composing = false;
  private closed = false;
  private frame = 0;
  private missing = 0;
  private styledFor = "";
  private height = -1;
  /** Titles this session saved recently, so Notion's echoes of them aren't taken as edits. */
  private readonly saved: string[] = [];
  /** When the user last edited, to hold off taking in other edits mid-typing. */
  private lastEdit = 0;
  /** The mouse over the editor, if it is. */
  private pointer: { x: number; y: number } | null = null;
  /** What's under the mouse beneath the editor, innermost first, and where the block was. */
  private hovered: Element[] = [];
  private lastRect = "";

  private readonly scroller: Element | null;

  constructor(
    private readonly host: SessionHost,
    private readonly internals: Internals,
    private currentStore: BlockStore,
    block: HTMLElement,
    leaf: HTMLElement,
    caret: number,
  ) {
    this.currentType = "";
    this.currentSpans = [];
    this.seen = { title: undefined, type: "" };
    this.parsed = parse("", parseOptions("text", host.options().source));
    this.load(leaf);

    this.el = document.createElement("div");
    this.el.className = "bn-md-editor";
    this.el.spellcheck = true;
    try {
      this.el.contentEditable = "plaintext-only";
    } catch {
      this.el.contentEditable = "true";
    }
    Object.assign(this.el.style, {
      position: "fixed",
      zIndex: "1",
      boxSizing: "border-box",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      outline: "none",
      margin: "0",
    });
    this.style = document.createElement("style");
    this.style.dataset.betterNotion = "live-markdown-session";
    this.scroller = this.findScroller(leaf);
    document.head.append(this.style);
    document.body.append(this.el);

    this.listen();
    this.position(block, leaf);
    // Notion keeps its caret in this block and puts it back, with focus, whenever it re-renders
    // the block (as it does when the type changes). Clearing it first keeps the caret here.
    document.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.el.focus({ preventScroll: true });
    this.render(toSource(this.parsed.pieces, caret));
    this.frame = requestAnimationFrame(this.tick);
  }

  get blockId(): string {
    return this.currentBlockId;
  }

  get store(): BlockStore {
    return this.currentStore;
  }

  /** Reads the block's value into the editor's source. */
  private load(leaf: Element | null) {
    const value = this.currentStore.getValue();
    const { source } = this.host.options();
    this.currentBlockId = this.currentStore.pointer.id;
    this.currentType = value?.type ?? "text";
    this.currentSpans = toSpans(value?.properties?.title, source);
    this.seen = { title: value?.properties?.title, type: this.currentType };
    if (leaf) {
      const labels = atomLabels(leaf);
      let model = 0;
      for (const span of this.currentSpans) {
        if (span.text === MENTION_CHAR) this.labels.set(key(span), labels.get(model) ?? "@");
        model += span.text.length;
      }
    }
    this.source = serialize(this.currentType, this.currentSpans, source);
    this.parsed = parse(this.source, parseOptions(this.currentType, source));
  }

  /**
   * Moves the editor to another block, keeping focus so the caret never leaves it, as after
   * Enter or a merge. Notion may not have rendered the block yet; the editor follows once it has.
   */
  moveTo(store: BlockStore, model: number) {
    this.flush();
    this.currentStore = store;
    this.load(findLeaf(store.pointer.id));
    this.styledFor = "";
    this.height = -1;
    this.missing = 0;
    // Shown again once it's over the block.
    this.el.style.opacity = "0";
    this.render(toSource(this.parsed.pieces, model));
  }

  /** Puts the caret at an offset in the block's plain text. */
  placeCaret(model: number) {
    this.render(toSource(this.parsed.pieces, model));
  }

  private findScroller(leaf: Element): Element | null {
    for (let el = leaf.parentElement; el; el = el.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    }
    return null;
  }

  private listen() {
    const el = this.el;
    el.addEventListener("keydown", this.onKeyDown);
    el.addEventListener("input", () => this.onInput());
    el.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    el.addEventListener("compositionend", () => {
      this.composing = false;
      this.onInput();
    });
    el.addEventListener("paste", this.onPaste);
    el.addEventListener("pointermove", (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
      this.hover();
    });
    el.addEventListener("pointerleave", () => {
      this.pointer = null;
      this.hovered = [];
    });

    el.addEventListener("blur", (event) => {
      // Switching windows blurs too; the caret should still be here when the user comes back.
      if (!document.hasFocus() || this.closed) return;
      const model = toModel(this.parsed.pieces, this.caret());
      this.close();
      // If focus went nowhere, give the caret back to Notion's text, so keys keep editing text
      // instead of acting on a selected block.
      if (event.relatedTarget === null) {
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) this.host.handoff(this, model);
        });
      }
    });
    // Notion listens on the document for these; they belong to this editor. Hover goes to Notion
    // through `hover`, as if from the block under the editor.
    for (const type of [
      "keypress",
      "keyup",
      "beforeinput",
      "input",
      "copy",
      "cut",
      "paste",
      "pointerover",
      "pointerout",
      "pointermove",
      "mouseover",
      "mouseout",
      "mousemove",
    ]) {
      el.addEventListener(type, (event) => event.stopPropagation());
    }
  }

  /** The block's type, as edited. */
  get type(): string {
    return this.currentType;
  }

  /** The block's text, as edited. */
  get spans(): readonly Span[] {
    return this.currentSpans;
  }

  /** The caret's offset in the block's plain text. */
  get model(): number {
    return toModel(this.parsed.pieces, this.caret());
  }

  /** The caret's offset in the source, or the end if the selection isn't in the editor. */
  caret(): number {
    const selection = document.getSelection();
    const node = selection?.focusNode;
    if (!selection || !node || !this.el.contains(node)) return this.source.length;
    return textOffset(this.el, node, selection.focusOffset);
  }

  private label = (model: number): string => {
    let at = 0;
    for (const span of this.currentSpans) {
      if (model < at + span.text.length) return this.labels.get(key(span)) ?? "@";
      at += span.text.length;
    }
    return "@";
  };

  private render(caret: number) {
    renderSource(this.el, { source: this.source, parsed: this.parsed, label: this.label });
    if (document.activeElement === this.el) select(rangeAt(this.el, caret));
    this.reveal(caret);
  }

  private reveal(caret = this.caret()) {
    const scope = this.host.options().reveal;
    revealMarkers(this.el, this.parsed.runs, scope === "block" ? null : caret);
  }

  /** The caret moved inside the editor. */
  selectionChanged() {
    this.reveal();
  }

  private options() {
    return this.host.options().source;
  }

  private onInput() {
    if (this.composing || this.closed) return;
    let caret = this.caret();
    let source = this.el.textContent ?? "";
    let parsed = parse(source, parseOptions(this.currentType, this.options()));
    const typeChanged = parsed.type !== this.currentType;
    if (typeChanged && DRAWN.has(parsed.type)) {
      // Notion draws this block's marker, so its markdown prefix leaves the source.
      source = source.slice(parsed.prefix);
      caret = Math.max(0, caret - parsed.prefix);
      parsed = parse(source, parseOptions(parsed.type, this.options()));
    }
    this.currentType = parsed.type;
    this.update(source, parsed, caret);
  }

  private update(source: string, parsed: Parsed, caret: number) {
    this.currentSpans = carry(this.currentSpans, parsed.spans);
    this.source = source;
    this.parsed = parsed;
    this.dirty = true;
    this.lastEdit = performance.now();
    this.render(caret);
    // Save every edit at once, like Notion does, so its text is current whenever a key is handed
    // to it. Notion groups edits made close together into one undo step.
    this.flush();
  }

  /** Deletes the hidden prefix of a drawn block (bullet, checkbox, …), turning it into text. */
  private dropPrefix() {
    this.currentType = "text";
    this.update(this.source, parse(this.source, parseOptions("text", this.options())), 0);
  }

  /** Writes the source back to the block, if it changed. */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const value = this.currentStore.getValue();
    if (!value) return;
    const title = fromSpans(this.currentSpans);
    const changes: [string[], unknown][] = [];
    if (JSON.stringify(title) !== JSON.stringify(value.properties?.title ?? [])) {
      changes.push([["properties", "title"], title]);
    }
    if (this.currentType !== value.type) changes.push([["type"], this.currentType]);
    if (!changes.length) return;
    try {
      this.internals.commit(this.currentStore, changes);
    } catch (error) {
      console.error("[better-notion] live-markdown couldn't save the block", error);
    }
    this.saved.push(JSON.stringify(title));
    if (this.saved.length > 50) this.saved.shift();
    const after = this.currentStore.getValue();
    this.seen = { title: after?.properties?.title, type: after?.type ?? this.currentType };
  }

  /** Whether a value of the block is one this session saved, or what it shows now. */
  private isOurs(value: BlockValue): boolean {
    const title = JSON.stringify(fromSpans(toSpans(value.properties?.title, this.options())));
    const current = JSON.stringify(fromSpans(this.currentSpans));
    return title === current || this.saved.includes(title);
  }

  /** Takes in an edit made elsewhere (another tab, a collaborator, Notion's undo). */
  private reload(value: BlockValue) {
    const model = toModel(this.parsed.pieces, this.caret());
    this.currentType = value.type;
    this.currentSpans = toSpans(value.properties?.title, this.options());
    const source = serialize(this.currentType, this.currentSpans, this.options());
    if (source === this.source) return;
    this.source = source;
    this.parsed = parse(source, parseOptions(this.currentType, this.options()));
    this.render(toSource(this.parsed.pieces, model));
  }

  private tick = () => {
    if (this.closed) return;
    this.frame = requestAnimationFrame(this.tick);
    const leaf = findLeaf(this.blockId);
    const block = leaf?.closest<HTMLElement>("[data-block-id]");
    if (!block || !leaf) {
      // Notion renders a new or moved block a frame or two later. Keep focus meanwhile, but
      // don't show the editor where the block isn't; give up only if it stays gone.
      this.el.style.opacity = "0";
      if (++this.missing > 60) this.close();
      return;
    }
    this.missing = 0;
    this.el.style.opacity = "";
    this.position(block, leaf);
    // When the block moves or re-renders under a still mouse (Tab, Enter), Notion doesn't know:
    // its handle would stay where the block was.
    const rect = leaf.getBoundingClientRect();
    const where = `${rect.left},${rect.top}`;
    const stale = this.hovered.some((el) => !el.isConnected);
    if (where !== this.lastRect || stale) {
      this.lastRect = where;
      this.hover(true);
    }
    const value = this.currentStore.getValue();
    if (value && (value.properties?.title !== this.seen.title || value.type !== this.seen.type)) {
      // Notion echoes saves back (locally, then from the server), sometimes an older one after
      // a newer one. Only take in edits made elsewhere, and not while the user is typing.
      const typing = performance.now() - this.lastEdit < REMOTE_QUIET;
      if (this.dirty || this.composing || typing) return;
      this.seen = { title: value.properties?.title, type: value.type };
      if (!this.isOurs(value) || value.type !== this.currentType) this.reload(value);
    }
  };

  /**
   * Passes the mouse on to the Notion block under the editor. Notion shows a block's drag handle
   * and + button from hover events, which the editor would otherwise catch.
   */
  private hover(moved = false) {
    if (!this.pointer) return;
    const { x, y } = this.pointer;
    const target = document
      .elementsFromPoint(x, y)
      .find((el) => el !== this.el && !this.el.contains(el));
    if (!target) return;
    const init = { clientX: x, clientY: y, view: window };
    // Notion listens to pointer events; mouse events go too, for anything that doesn't.
    const send = (el: Element, type: string, extra: MouseEventInit = {}) => {
      el.dispatchEvent(new PointerEvent(`pointer${type}`, { ...init, ...extra }));
      el.dispatchEvent(new MouseEvent(`mouse${type}`, { ...init, ...extra }));
    };
    const previous = this.hovered.at(0) ?? null;
    if (moved && target === previous && this.hovered.every((el) => el.isConnected)) {
      send(target, "move", { bubbles: true });
      return;
    }
    if (moved || target !== previous) {
      const chain: Element[] = [];
      for (let el: Element | null = target; el; el = el.parentElement) chain.push(el);
      // After the block moves, Notion has re-rendered it and needs to be told again.
      const kept = new Set(
        this.hovered.filter((el) => chain.includes(el) && !(moved && el.closest(BLOCK))),
      );
      if (previous?.isConnected) send(previous, "out", { bubbles: true, relatedTarget: target });
      for (const el of this.hovered) {
        if (!kept.has(el) && el.isConnected) send(el, "leave", { relatedTarget: target });
      }
      send(target, "over", { bubbles: true, relatedTarget: previous });
      // Notion shows a block's handle on enter, which doesn't bubble: each element gets its own.
      for (const el of [...chain].reverse()) {
        if (!kept.has(el)) send(el, "enter", { relatedTarget: previous });
      }
      this.hovered = chain;
    }
    send(target, "move", { bubbles: true });
  }

  /** Places the editor over Notion's text and hides that text, keeping room for the source. */
  private position(block: HTMLElement, leaf: HTMLElement) {
    if (block.className !== this.styledFor) {
      this.styledFor = block.className;
      const computed = getComputedStyle(leaf);
      for (const name of COPIED_STYLES) {
        this.el.style.setProperty(name, computed.getPropertyValue(name));
      }
    }
    const rect = leaf.getBoundingClientRect();
    Object.assign(this.el.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
    });
    const bounds = this.scroller?.getBoundingClientRect();
    if (bounds) {
      const top = Math.max(0, bounds.top - rect.top);
      const bottom = Math.max(0, rect.top + this.el.offsetHeight - bounds.bottom);
      this.el.style.clipPath = `inset(${top}px -100vw ${bottom}px -100vw)`;
    }
    const height = this.el.offsetHeight;
    if (height !== this.height) {
      this.height = height;
      const id = cssString(this.blockId);
      // This block's text only, not that of blocks nested in it.
      this.style.textContent = `[data-block-id=${id}] ${LEAF}:not([data-block-id=${id}] [data-block-id] *) {
        visibility: hidden !important; min-height: ${height}px !important; }`;
    }
  }

  private handoffKey(init: KeyInit) {
    const model = toModel(this.parsed.pieces, this.caret());
    this.host.handoff(this, model, (leaf) => sendKey(leaf, init));
  }

  private wrap(open: string, close: string) {
    const selection = document.getSelection();
    const text = selection?.toString() ?? "";
    const start = Math.min(this.caret(), this.anchor());
    document.execCommand("insertText", false, `${open}${text}${close}`);
    // The caret goes after the text, or into the URL of a new link.
    const caret = start + open.length + text.length + (close === "]()" ? 2 : 0);
    select(rangeAt(this.el, caret));
    this.reveal(caret);
  }

  private anchor(): number {
    const selection = document.getSelection();
    const node = selection?.anchorNode;
    if (!selection || !node || !this.el.contains(node)) return this.caret();
    return textOffset(this.el, node, selection.anchorOffset);
  }

  /** Arrow keys past the first or last line leave the block, like in Notion. */
  private watchVertical(direction: "up" | "down") {
    const before = caretRect(this.el);
    requestAnimationFrame(() => {
      const after = caretRect(this.el);
      if (!this.closed && before && after && Math.abs(after.top - before.top) < 3) {
        this.host.navigate(this, direction, before.left);
      }
    });
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && event.key.length === 1) {
      const letter = event.key.toLowerCase();
      if (letter === "z" || letter === "y") {
        handled();
        this.flush();
        this.handoffKey(letterKey(letter, { shift: event.shiftKey }));
        return;
      }
      const wrap = WRAPS[letter];
      if (
        wrap &&
        !!wrap.shift === event.shiftKey &&
        (!wrap.syntax || this.options()[wrap.syntax])
      ) {
        handled();
        this.wrap(wrap.open, wrap.close);
      }
      // Selecting and the clipboard act on this editor; other shortcuts go on to Notion.
      if (NATIVE_SHORTCUTS.has(letter)) event.stopPropagation();
      return;
    }
    // Everything else, including ⌘← and other movement, belongs to this editor. Notion would
    // apply it to its own selection elsewhere on the page.
    event.stopPropagation();
    if (mod || event.altKey) return;

    const selection = document.getSelection();
    const collapsed = selection?.isCollapsed ?? true;
    const caret = this.caret();
    switch (event.key) {
      case "Enter":
        handled();
        if (event.shiftKey) document.execCommand("insertText", false, "\n");
        else this.host.restructure(this, "split");
        return;
      case "Tab":
        handled();
        this.host.restructure(this, event.shiftKey ? "outdent" : "indent");
        return;
      case "Escape":
        handled();
        this.handoffKey(ESCAPE);
        return;
      case "Backspace":
        if (!collapsed || caret !== 0 || event.shiftKey) return;
        handled();
        // Like deleting `- ` in markdown. Otherwise the block merges into the one above.
        if (DRAWN.has(this.currentType)) this.dropPrefix();
        else this.host.restructure(this, "mergeUp");
        return;
      case "Delete":
        if (!collapsed || caret !== this.source.length) return;
        handled();
        this.host.restructure(this, "mergeDown");
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        const left = event.key === "ArrowLeft";
        if (!collapsed || event.shiftKey || caret !== (left ? 0 : this.source.length)) return;
        handled();
        this.host.navigate(this, left ? "left" : "right", 0);
        return;
      }
      case "ArrowUp":
      case "ArrowDown":
        if (!event.shiftKey) this.watchVertical(event.key === "ArrowUp" ? "up" : "down");
        return;
      case "/":
      case "@":
        // Notion opens its menus when these are typed into its own text, so the key press
        // itself goes on to Notion's text.
        this.host.release(this, this.model, event);
        return;
      case "[":
        // The second `[` of `[[` opens Notion's page link menu.
        if (!collapsed || this.source[caret - 1] !== "[") return;
        this.host.release(this, this.model, event);
        return;
    }
  };

  private onPaste = (event: ClipboardEvent) => {
    const data = event.clipboardData;
    if (!data) return;
    const text = data.getData("text/plain");
    // Several lines or rich content become blocks and formatting, which is Notion's job.
    if (!text.includes("\n") && !data.types.includes("text/html")) return;
    event.preventDefault();
    const copy = new DataTransfer();
    for (const type of data.types) copy.setData(type, data.getData(type));
    const model = toModel(this.parsed.pieces, this.caret());
    this.host.handoff(this, model, (leaf) => {
      leaf.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: copy, bubbles: true, cancelable: true }),
      );
    });
  };

  close() {
    if (this.closed) return;
    this.flush();
    this.closed = true;
    cancelAnimationFrame(this.frame);
    this.el.remove();
    this.style.remove();
    this.host.closed(this);
  }
}

function caretRect(root: HTMLElement): DOMRect | null {
  const selection = document.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return rect.height ? rect : root.getBoundingClientRect();
}
