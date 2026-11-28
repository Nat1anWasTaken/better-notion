import type { Tweak } from "../types";
import { blockMarker, headingLevel } from "./block-markers";
import { decorationCss, type Placement } from "./decorate";
import { blockType, type Format, tokenFormats } from "./detect";
import { closers, findRuns, markersFor, openers, type Run, type Token } from "./inline-markers";
import { rangeAt, textOffset } from "./text";

interface TokenSpan extends Token {
  start: number;
  end: number;
}

/** What the caret is on, recomputed on every caret move or edit. */
interface Active {
  leaf: HTMLElement;
  block: HTMLElement;
  caret: number;
  tokens: TokenSpan[];
  revealed: Run[];
}

interface Armed {
  run: Run;
  side: "before" | "after";
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/** Notion's own shortcuts for formats that can be removed from a marker. */
const FORMAT_SHORTCUTS: Partial<Record<Format, { key: string; shift?: boolean }>> = {
  bold: { key: "b" },
  italic: { key: "i" },
  underline: { key: "u" },
  strike: { key: "s", shift: true },
  code: { key: "e" },
};

/** Blocks whose syntax Backspace removes, turning them into text. */
const PREFIX_TYPES = new Set([
  "header",
  "sub_header",
  "sub_sub_header",
  "header_4",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "quote",
]);

function sendShortcut(
  target: Element,
  init: { key: string; code: string; keyCode: number; shift?: boolean; alt?: boolean },
): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: init.key,
      code: init.code,
      keyCode: init.keyCode,
      which: init.keyCode,
      metaKey: IS_MAC,
      ctrlKey: !IS_MAC,
      shiftKey: init.shift ?? false,
      altKey: init.alt ?? false,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

function hasModifiers(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

export const liveMarkdown: Tweak = {
  id: "live-markdown",
  name: "Live markdown",
  description:
    "Shows the markdown syntax of the text under the caret, like Obsidian's Live Preview, and lets you delete it to remove the formatting.",
  options: [
    {
      type: "select",
      key: "revealScope",
      label: "Reveal",
      description: "How much syntax to show around the caret.",
      default: "token",
      choices: [
        { value: "token", label: "Formatting under the caret" },
        { value: "block", label: "Everything in the block" },
      ],
    },
    {
      type: "select",
      key: "blockMarkers",
      label: "Block syntax",
      description: "Where to show markers like ## and - [ ].",
      default: "inline",
      choices: [
        { value: "inline", label: "Before the text" },
        { value: "gutter", label: "In the margin" },
      ],
    },
    {
      type: "select",
      key: "quoteMarker",
      label: "Quote marker",
      default: '"',
      choices: [
        { value: '"', label: '" (Notion)' },
        { value: ">", label: "> (Markdown)" },
      ],
    },
    {
      type: "toggle",
      key: "showHighlight",
      label: "Show highlights as ==",
      default: true,
    },
    {
      type: "toggle",
      key: "showUnderline",
      label: "Show underline as <u>",
      default: false,
    },
    {
      type: "toggle",
      key: "editable",
      label: "Editable markers",
      description:
        "Step over a marker with the arrow keys and press Backspace or Delete to remove the formatting. Backspace at the start of a heading, list item, quote or toggle turns it into text, and # at the start of a heading makes it smaller.",
      default: true,
    },
  ],
  run: (ctx) => {
    const style = document.createElement("style");
    style.dataset.betterNotion = "live-markdown";
    (document.head ?? document.documentElement).append(style);

    let active: Active | null = null;
    let armed: Armed | null = null;
    let observed: Element | null = null;
    let scheduled = false;

    const observer = new MutationObserver(() => schedule());

    const hiddenFormats = () => {
      const hidden = new Set<Format>();
      if (!ctx.getOption<boolean>("showHighlight")) hidden.add("highlight");
      if (!ctx.getOption<boolean>("showUnderline")) hidden.add("underline");
      return hidden;
    };

    const readActive = (): Active | null => {
      const selection = document.getSelection();
      const node = selection?.focusNode;
      if (!selection || !node) return null;
      const el = node instanceof Element ? node : node.parentElement;
      const leaf = el?.closest<HTMLElement>("[data-content-editable-leaf]");
      const block = leaf?.closest<HTMLElement>("[data-block-id]");
      if (!leaf || !block || !leaf.isContentEditable) return null;

      const caret = textOffset(leaf, node, selection.focusOffset);
      const hidden = hiddenFormats();
      const tokens: TokenSpan[] =
        blockType(block) === "code"
          ? []
          : [...leaf.querySelectorAll("[data-token-index]")].map((token) => {
              const formats = tokenFormats(token);
              for (const format of hidden) formats.delete(format);
              const start = textOffset(leaf, token, 0);
              return {
                index: Number(token.getAttribute("data-token-index")),
                formats,
                start,
                end: start + (token.textContent?.length ?? 0),
              };
            });
      const runs = findRuns(tokens);
      const revealed =
        ctx.getOption("revealScope") === "block"
          ? runs
          : runs.filter((run) => {
              const first = tokens[run.start];
              const last = tokens[run.end];
              return first && last && first.start <= caret && caret <= last.end;
            });
      return { leaf, block, caret, tokens, revealed };
    };

    const render = () => {
      if (!active) {
        style.textContent = "";
        return;
      }
      const { block, leaf, tokens, revealed } = active;
      const markers = markersFor(tokens.length, revealed);
      const byIndex = new Map<number, (typeof markers)[number]>();
      markers.forEach((marker, pos) => {
        const token = tokens[pos];
        if (token && (marker.before || marker.after)) byIndex.set(token.index, marker);
      });
      const armedToken = armed && tokens[armed.side === "after" ? armed.run.end : armed.run.start];
      style.textContent = decorationCss({
        blockId: block.dataset.blockId ?? "",
        tokens: byIndex,
        block: blockMarker(block, leaf, { quote: ctx.getOption<string>("quoteMarker") }),
        placement: ctx.getOption<Placement>("blockMarkers"),
        armed: armed && armedToken ? { token: armedToken.index, side: armed.side } : undefined,
      });
    };

    const update = () => {
      const previous = active;
      active = readActive();
      if (!active || active.leaf !== previous?.leaf || active.caret !== previous?.caret) {
        armed = null;
      }
      if (active?.block !== observed) {
        observer.disconnect();
        observed = active?.block ?? null;
        if (observed) {
          observer.observe(observed, { childList: true, subtree: true, characterData: true });
        }
      }
      render();
    };

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        update();
      });
    }

    /** Removes a run's formatting with Notion's own shortcut, so it lands in undo history. */
    const removeFormat = (state: Active, run: Run) => {
      const shortcut = FORMAT_SHORTCUTS[run.format];
      const first = state.tokens[run.start];
      const last = state.tokens[run.end];
      const selection = document.getSelection();
      if (!shortcut || !first || !last || !selection) return;
      selection.removeAllRanges();
      selection.addRange(rangeAt(state.leaf, first.start, last.end));
      const upper = shortcut.key.toUpperCase();
      sendShortcut(state.leaf, {
        key: shortcut.key,
        code: `Key${upper}`,
        keyCode: upper.charCodeAt(0),
        shift: shortcut.shift,
      });
      // Notion re-renders the leaf; put the caret back once it has.
      requestAnimationFrame(() => {
        if (!state.leaf.isConnected) return;
        selection.removeAllRanges();
        selection.addRange(rangeAt(state.leaf, state.caret));
      });
    };

    /** The editable runs whose marker sits at the caret on the given side, in stepping order. */
    const runsAtCaret = (state: Active, side: "before" | "after"): Run[] => {
      const editable = state.revealed.filter((run) => FORMAT_SHORTCUTS[run.format]);
      if (side === "after") {
        return closers(editable).filter((run) => state.tokens[run.end]?.end === state.caret);
      }
      return openers(editable)
        .reverse()
        .filter((run) => state.tokens[run.start]?.start === state.caret);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted || !ctx.getOption<boolean>("editable")) return;
      const state = active;
      const selection = document.getSelection();
      if (!state || !selection?.isCollapsed || !state.leaf.contains(selection.focusNode)) return;

      // Typing # at the start of a heading makes it one level smaller, like adding a # in markdown.
      if (event.key === "#" && !event.metaKey && !event.ctrlKey && state.caret === 0) {
        const level = headingLevel(state.block);
        if (level && level < 3) {
          event.preventDefault();
          event.stopPropagation();
          const next = level + 1;
          sendShortcut(state.leaf, {
            key: String(next),
            code: `Digit${next}`,
            keyCode: 48 + next,
            alt: true,
          });
          return;
        }
      }

      // Backspace at the start deletes the block syntax, like in markdown: the block becomes
      // text. Notion would merge it into the block above instead.
      if (event.key === "Backspace" && !hasModifiers(event) && state.caret === 0 && !armed) {
        if (PREFIX_TYPES.has(blockType(state.block) ?? "")) {
          event.preventDefault();
          event.stopPropagation();
          sendShortcut(state.leaf, { key: "0", code: "Digit0", keyCode: 48, alt: true });
          return;
        }
      }

      const side =
        event.key === "ArrowRight" || event.key === "Backspace"
          ? "after"
          : event.key === "ArrowLeft" || event.key === "Delete"
            ? "before"
            : null;
      if (!side || hasModifiers(event)) {
        if (armed) {
          armed = null;
          render();
        }
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        if (armed?.side === side) {
          event.preventDefault();
          event.stopPropagation();
          const run = armed.run;
          armed = null;
          removeFormat(state, run);
        }
        return;
      }

      // Arrow keys step over each marker at the caret before moving on, like real characters.
      const runs = runsAtCaret(state, side);
      const next = armed?.side === side ? runs[runs.indexOf(armed.run) + 1] : runs[0];
      if (next) {
        event.preventDefault();
        event.stopPropagation();
        armed = { run: next, side };
        render();
      } else if (armed) {
        armed = null;
        render();
      }
    };

    document.addEventListener("selectionchange", schedule);
    document.addEventListener("keydown", onKeyDown, true);
    const unsubscribe = ctx.onOptionChange(update);
    update();

    return () => {
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("keydown", onKeyDown, true);
      unsubscribe();
      observer.disconnect();
      style.remove();
    };
  },
};
