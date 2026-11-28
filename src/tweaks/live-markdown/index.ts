import type { Tweak } from "../types";
import { blockMarker, headingLevel } from "./block-markers";
import {
  closeEditor,
  digitKey,
  letterKey,
  removeHighlight,
  removeLink,
  replaceWithText,
  select,
  sendKey,
  waitFor,
} from "./commands";
import { decorationCss, equationEditorCss, type Placement } from "./decorate";
import { blockType, type Format, tokenFormats } from "./detect";
import { closers, findRuns, markersFor, openers, type Run, type Token } from "./inline-markers";
import { rangeAt, textOffset } from "./text";

interface TokenSpan extends Token {
  el: Element;
  start: number;
  end: number;
}

/** What the caret is on in a text block, recomputed on every caret move or edit. */
interface Active {
  leaf: HTMLElement;
  block: HTMLElement;
  caret: number;
  tokens: TokenSpan[];
  revealed: Run[];
}

/** Notion's popup editor for an equation's TeX, with the equation it edits. */
interface EquationEditor {
  leaf: HTMLElement;
  caret: number;
  /**
   * The equation block being edited, or where an inline equation's token is. Notion re-renders
   * tokens freely, so it's kept as an address rather than a node.
   */
  target: { block: HTMLElement } | { blockId: string; index: string };
}

interface Armed {
  run: Run;
  side: "before" | "after";
}

/** Notion's toggle shortcuts for formats that have one. */
const FORMAT_SHORTCUTS: Partial<Record<Format, { key: string; shift?: boolean }>> = {
  bold: { key: "b" },
  italic: { key: "i" },
  underline: { key: "u" },
  strike: { key: "s", shift: true },
  code: { key: "e" },
};

/** Formats whose markers can be deleted. The rest go through Notion's menus. */
const EDITABLE = new Set<Format>([
  ...(Object.keys(FORMAT_SHORTCUTS) as Format[]),
  "link",
  "highlight",
  "equation",
]);

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

/** The TeX source KaTeX keeps in the rendered equation. */
function texOf(equation: Element): string {
  return equation.querySelector("annotation")?.textContent ?? "";
}

function hasModifiers(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

function consume(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
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
        "Step over a marker with the arrow keys and press Backspace or Delete to remove the formatting, link, highlight or equation. Backspace at the start of a heading, list item, quote, toggle or equation turns it into text, and # at the start of a heading makes it smaller.",
      default: true,
    },
  ],
  run: (ctx) => {
    const style = document.createElement("style");
    style.dataset.betterNotion = "live-markdown";
    (document.head ?? document.documentElement).append(style);

    let active: Active | null = null;
    let editor: EquationEditor | null = null;
    let armed: Armed | null = null;
    let busy = false;
    let observed: Element | null = null;
    let scheduled = false;

    const observer = new MutationObserver(() => schedule());

    const hiddenFormats = () => {
      const hidden = new Set<Format>();
      if (!ctx.getOption<boolean>("showHighlight")) hidden.add("highlight");
      if (!ctx.getOption<boolean>("showUnderline")) hidden.add("underline");
      return hidden;
    };

    const focusedLeaf = () => {
      const selection = document.getSelection();
      const node = selection?.focusNode;
      if (!selection || !node) return null;
      const el = node instanceof Element ? node : node.parentElement;
      const leaf = el?.closest<HTMLElement>("[data-content-editable-leaf]");
      if (!leaf?.isContentEditable) return null;
      return { leaf, caret: textOffset(leaf, node, selection.focusOffset) };
    };

    /**
     * Notion edits an equation's TeX in a popup. A block equation marks its button as expanded;
     * an inline equation being edited gets a selection background.
     */
    const readEditor = (leaf: HTMLElement, caret: number): EquationEditor | null => {
      if (!leaf.closest("[role=dialog]")) return null;
      const block = document
        .querySelector(".notion-equation-block [aria-haspopup=dialog][aria-expanded=true]")
        ?.closest<HTMLElement>("[data-block-id]");
      if (block) return { leaf, caret, target: { block } };
      const token = [...document.querySelectorAll(".notion-text-equation-token")].find((t) =>
        /background/.test(t.getAttribute("style") ?? ""),
      );
      const blockId = token?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
      const index = token?.getAttribute("data-token-index");
      return blockId && index ? { leaf, caret, target: { blockId, index } } : null;
    };

    const readActive = (leaf: HTMLElement, caret: number): Active | null => {
      const block = leaf.closest<HTMLElement>("[data-block-id]");
      if (!block) return null;
      const hidden = hiddenFormats();
      const tokens: TokenSpan[] =
        blockType(block) === "code"
          ? []
          : [...leaf.querySelectorAll("[data-token-index]")].map((el) => {
              const formats = tokenFormats(el);
              for (const format of hidden) formats.delete(format);
              const start = textOffset(leaf, el, 0);
              return {
                el,
                index: Number(el.getAttribute("data-token-index")),
                formats,
                start,
                end: start + (el.textContent?.length ?? 0),
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
      if (editor) {
        style.textContent = equationEditorCss(
          "block" in editor.target ? { blockId: editor.target.block.dataset.blockId ?? "" } : {},
        );
        return;
      }
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
      const focused = focusedLeaf();
      editor = focused && readEditor(focused.leaf, focused.caret);
      active = focused && !editor ? readActive(focused.leaf, focused.caret) : null;
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

    /** Runs an edit that spans several frames, ignoring keys until it's done. */
    const perform = async (edit: () => Promise<unknown>) => {
      busy = true;
      try {
        await edit();
      } catch (error) {
        console.error("[better-notion] live-markdown edit failed", error);
      } finally {
        busy = false;
        schedule();
      }
    };

    /** Removes a run's formatting the way Notion would, so it lands in undo history. */
    const removeFormat = async (state: Active, run: Run) => {
      const first = state.tokens[run.start];
      const last = state.tokens[run.end];
      if (!first || !last) return;
      const range = rangeAt(state.leaf, first.start, last.end);
      const shortcut = FORMAT_SHORTCUTS[run.format];
      let caret = state.caret;

      if (shortcut) {
        select(range);
        sendKey(state.leaf, letterKey(shortcut.key, { shift: shortcut.shift }));
      } else if (run.format === "link") {
        await removeLink(state.leaf, range);
      } else if (run.format === "highlight") {
        await removeHighlight(state.leaf, range);
      } else if (run.format === "equation") {
        // Deleting a $ leaves the TeX behind as text, like breaking the delimiters in markdown.
        const tex = texOf(first.el);
        const range = document.createRange();
        range.setStartBefore(first.el);
        range.setEndAfter(first.el);
        replaceWithText(range, tex);
        caret = first.start + (caret > first.start ? tex.length : 0);
      }

      // Notion re-renders the leaf; put the caret back once it has.
      await waitFor(() => !document.querySelector("[role=dialog] [role=menuitem]"), 500);
      requestAnimationFrame(() => {
        if (!state.leaf.isConnected) return;
        state.leaf.focus();
        select(rangeAt(state.leaf, caret));
      });
    };

    /** Turns an equation back into its TeX source as plain text. */
    const removeEquation = async (current: EquationEditor) => {
      const tex = current.leaf.textContent?.trim() ?? "";
      await closeEditor(current.leaf);
      if ("block" in current.target) {
        // Closing the editor leaves the block selected; turn it into a text block, which keeps
        // the TeX.
        sendKey(document.activeElement ?? document.body, digitKey(0, { alt: true }));
        return;
      }
      const { blockId, index } = current.target;
      const fresh = await waitFor(() =>
        document.querySelector(
          `[data-block-id="${blockId}"] .notion-text-equation-token[data-token-index="${index}"]`,
        ),
      );
      const leaf = fresh?.closest<HTMLElement>("[data-content-editable-leaf]");
      if (!fresh || !leaf) return;
      leaf.focus();
      const range = document.createRange();
      range.setStartBefore(fresh);
      range.setEndAfter(fresh);
      replaceWithText(range, tex);
    };

    /** The editable runs whose marker sits at the caret on the given side, in stepping order. */
    const runsAtCaret = (state: Active, side: "before" | "after"): Run[] => {
      const editable = state.revealed.filter((run) => EDITABLE.has(run.format));
      if (side === "after") {
        return closers(editable).filter((run) => state.tokens[run.end]?.end === state.caret);
      }
      return openers(editable)
        .reverse()
        .filter((run) => state.tokens[run.start]?.start === state.caret);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted || !ctx.getOption<boolean>("editable")) return;
      if (busy) {
        consume(event);
        return;
      }
      const selection = document.getSelection();
      if (!selection?.isCollapsed) return;

      // Backspace at the start of an equation's TeX deletes its opening $ or $$.
      if (editor?.leaf.contains(selection.focusNode)) {
        if (event.key === "Backspace" && !hasModifiers(event) && editor.caret === 0) {
          consume(event);
          const current = editor;
          void perform(() => removeEquation(current));
        }
        return;
      }

      const state = active;
      if (!state) return;
      if (!state.leaf.contains(selection.focusNode)) return;

      // Typing # at the start of a heading makes it one level smaller, like adding a # in markdown.
      if (event.key === "#" && !event.metaKey && !event.ctrlKey && state.caret === 0) {
        const level = headingLevel(state.block);
        if (level && level < 3) {
          consume(event);
          sendKey(state.leaf, digitKey(level + 1, { alt: true }));
          return;
        }
      }

      // Backspace at the start deletes the block syntax, like in markdown: the block becomes
      // text. Notion would merge it into the block above instead.
      if (event.key === "Backspace" && !hasModifiers(event) && state.caret === 0 && !armed) {
        if (PREFIX_TYPES.has(blockType(state.block) ?? "")) {
          consume(event);
          sendKey(state.leaf, digitKey(0, { alt: true }));
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
          consume(event);
          const run = armed.run;
          armed = null;
          void perform(() => removeFormat(state, run));
        }
        return;
      }

      // Arrow keys step over each marker at the caret before moving on, like real characters.
      const runs = runsAtCaret(state, side);
      const next = armed?.side === side ? runs[runs.indexOf(armed.run) + 1] : runs[0];
      if (next) {
        consume(event);
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
