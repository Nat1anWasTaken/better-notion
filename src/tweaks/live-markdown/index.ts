import type { Tweak } from "../types";
import { delay, frames, select, waitFor } from "./commands";
import { type EquationEditor, equationEditorCss, readEditor, removeEquation } from "./equation";
import { EDITABLE, type QuoteMarker } from "./model/blocks";
import { plainText } from "./model/rich-text";
import { blockStore, type Internals, loadInternals } from "./notion/internals";
import { editableLeaves, findLeaf, LEAF, leafOf, modelOffset, rangeAtModel } from "./notion/leaf";
import { EDITOR_CSS } from "./overlay/render";
import { type Direction, Session, type SessionHost, type SessionOptions } from "./overlay/session";
import { restructure } from "./restructure";
import { textOffset } from "./text";

/** How long Notion takes to pick up a selection after a mouseup, in ms. */
const SELECTION_SETTLE = 50;

const UNAVAILABLE =
  "Off for now: this version of Notion changed the editor code that live markdown relies on. It will work again once Better Notion is updated for it.";

/** Notion's menus (slash commands, mentions, link search) type into its own editor. */
const MENU = ".notion-overlay-container :is([role=menu], [role=listbox], [role=dialog])";

function makeStyle(css = ""): HTMLStyleElement {
  const style = document.createElement("style");
  style.dataset.betterNotion = "live-markdown";
  style.textContent = css;
  (document.head ?? document.documentElement).append(style);
  return style;
}

/**
 * Puts the caret in Notion's text. Notion acts on keys at its own record of the selection, which
 * it only updates from `selectionchange` after a while, but at once on a mouseup.
 */
function placeInNotion(leaf: HTMLElement, model: number) {
  leaf.focus({ preventScroll: true });
  select(rangeAtModel(leaf, model));
  leaf.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

export const liveMarkdown: Tweak = {
  id: "live-markdown",
  name: "Live markdown",
  description:
    "Edit Notion text as markdown, like Obsidian's Live Preview: the block under the caret shows its markdown, which you can edit like any text. Bullets, numbers, checkboxes, toggles and quotes keep Notion's look.",
  options: [
    {
      type: "select",
      key: "revealScope",
      label: "Reveal",
      description: "Which markdown to show in the block you're editing.",
      default: "token",
      choices: [
        { value: "token", label: "Formatting under the caret" },
        { value: "block", label: "Everything in the block" },
      ],
    },
    {
      type: "select",
      key: "quoteMarker",
      label: "Quote syntax",
      description: 'What to type for a quote. With ", typing > makes a toggle, like in Notion.',
      default: '"',
      choices: [
        { value: '"', label: '" (Notion)' },
        { value: ">", label: "> (Markdown)" },
      ],
    },
    {
      type: "toggle",
      key: "showHighlight",
      label: "Write highlights as ==",
      default: true,
    },
    {
      type: "toggle",
      key: "showUnderline",
      label: "Write underline as <u>",
      default: false,
    },
  ],
  run: (ctx) => {
    const editorStyle = makeStyle(EDITOR_CSS);
    const equationStyle = makeStyle();

    let internals: Internals | null | undefined;
    let session: Session | null = null;
    let equation: EquationEditor | null = null;
    /** Set while the caret is being handed to Notion, so the editor doesn't reopen meanwhile. */
    let handingOff = false;
    /** Set while a change to the page's structure moves the editor to another block. */
    let moving = false;
    /** Text typed meanwhile, typed into the editor once it opens. */
    let pending = "";
    let pointerDown = false;
    let scheduled = false;

    const getInternals = () => {
      if (internals === undefined) {
        internals = loadInternals();
        if (!internals) {
          console.error(
            "[better-notion] live-markdown: Notion's editor internals weren't found, so this version of Notion isn't supported.",
          );
          ctx.setNotice(UNAVAILABLE);
        }
      }
      return internals;
    };

    // Check as soon as Notion's editor is on the page, so the settings can tell the user before
    // they wonder why nothing happens. Notion's editor code has loaded by then.
    const probe = window.setInterval(() => {
      if (internals !== undefined) window.clearInterval(probe);
      else if (document.querySelector(LEAF)) getInternals();
    }, 1000);

    const options = (): SessionOptions => ({
      source: {
        highlight: ctx.getOption<boolean>("showHighlight"),
        underline: ctx.getOption<boolean>("showUnderline"),
        quote: ctx.getOption<QuoteMarker>("quoteMarker"),
      },
      reveal: ctx.getOption<"token" | "block">("revealScope"),
    });

    const host: SessionHost = {
      options,
      release: (current, model, event) => {
        const length = plainText(current.spans).length;
        const { blockId } = current;
        current.close();
        // Notion's text is current once it has rendered the session's last save.
        const ready = () => {
          const leaf = findLeaf(blockId);
          return leaf && modelOffset(leaf, leaf, leaf.childNodes.length) === length ? leaf : null;
        };
        handingOff = true;
        // Notion's menu opens a moment later; don't take the caret back before it does.
        const settle = () =>
          setTimeout(() => {
            handingOff = false;
            schedule();
          }, 300);
        const leaf = ready();
        if (leaf) {
          placeInNotion(leaf, model);
          settle();
          return;
        }
        // Notion hasn't rendered the last edit yet, so the key can't go to its text now. Type it
        // there once it has.
        event.preventDefault();
        void (async () => {
          const fresh = await waitFor(ready, 500);
          if (fresh) {
            placeInNotion(fresh, model);
            await delay(SELECTION_SETTLE);
            document.execCommand("insertText", false, event.key);
          }
          settle();
        })();
      },
      handoff: async (current, model, then) => {
        handingOff = true;
        try {
          current.close();
          // Let Notion render what the session saved before working in its text.
          await frames(2);
          const leaf = findLeaf(current.blockId);
          if (leaf) {
            placeInNotion(leaf, model);
            await delay(SELECTION_SETTLE);
            then?.(leaf);
          }
          await frames(2);
        } catch (error) {
          console.error("[better-notion] live-markdown hand-off failed", error);
        } finally {
          handingOff = false;
          schedule();
          // Notion may move the caret again once it has handled the key (undo does).
          setTimeout(schedule, 300);
        }
      },
      navigate: (current, direction: Direction, x) => {
        const from = findLeaf(current.blockId);
        current.close();
        const leaves = editableLeaves();
        const index = from ? leaves.indexOf(from) : -1;
        const back = direction === "up" || direction === "left";
        const target = leaves[index + (back ? -1 : 1)] ?? from;
        if (!target) return;
        target.focus({ preventScroll: true });
        let range: Range | null = null;
        if (target !== from && (direction === "up" || direction === "down")) {
          const rect = target.getBoundingClientRect();
          const line = Number.parseFloat(getComputedStyle(target).lineHeight) || 20;
          const y = back ? rect.bottom - line / 2 : rect.top + line / 2;
          const left = Math.min(Math.max(x, rect.left + 1), rect.right - 1);
          const point = document.caretRangeFromPoint?.(left, y);
          if (point && target.contains(point.startContainer)) range = point;
        }
        select(range ?? rangeAtModel(target, back === (target !== from) ? Infinity : 0));
        target.scrollIntoView({ block: "nearest" });
        schedule();
      },
      restructure: async (current, change) => {
        if (handingOff) return;
        const api = getInternals();
        if (!api) return;
        handingOff = true;
        moving = true;
        pending = "";
        try {
          current.flush();
          const placement = await restructure(api, current, change, options().source);
          if (!placement) return;
          current.close();
          // Wait for Notion to render the change, then edit where the caret went.
          await frames(2);
          const leaf = await waitFor(() => findLeaf(placement.blockId));
          const block = leaf?.closest<HTMLElement>("[data-block-id]");
          if (leaf && block) open(block, leaf, placement.model)?.insert(pending);
        } catch (error) {
          console.error("[better-notion] live-markdown couldn't change the page", error);
        } finally {
          handingOff = false;
          moving = false;
        }
      },
      closed: (current) => {
        if (session === current) session = null;
      },
    };

    const update = () => {
      if (handingOff) return;
      const selection = document.getSelection();
      const node = selection?.focusNode ?? null;
      if (session) {
        if (node && session.el.contains(node)) {
          session.selectionChanged();
          return;
        }
        if (document.activeElement === session.el) return;
        session.close();
      }
      const el = node instanceof Element ? node : node?.parentElement;
      const leaf = el?.closest<HTMLElement>(LEAF);
      equation = leaf ? readEditor(leaf) : null;
      equationStyle.textContent = equation ? equationEditorCss(equation) : "";

      if (pointerDown || !selection?.isCollapsed || !node || !leaf) return;
      if (
        !leaf?.isContentEditable ||
        leaf.closest("[role=dialog]") ||
        document.querySelector(MENU)
      ) {
        return;
      }
      const block = leaf.closest<HTMLElement>("[data-block-id]");
      if (!block || leafOf(block) !== leaf) return;
      open(block, leaf, modelOffset(leaf, node, selection.focusOffset));
    };

    /** Opens the editor on a block, with the caret at a plain-text offset. */
    function open(block: HTMLElement, leaf: HTMLElement, caret: number) {
      const store = blockStore(block);
      const type = store?.getValue()?.type;
      if (!store || !type || !EDITABLE.has(type)) return null;
      const api = getInternals();
      if (!api) return null;
      session = new Session(host, api, store, block, leaf, caret);
      return session;
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        try {
          update();
        } catch (error) {
          console.error("[better-notion] live-markdown failed", error);
        }
      });
    }

    const onPointerDown = () => {
      pointerDown = true;
    };
    const onPointerUp = () => {
      pointerDown = false;
      schedule();
    };

    /** Backspace at the start of an equation's TeX deletes its opening `$` or `$$`. */
    const onKeyDown = (event: KeyboardEvent) => {
      // Keep what's typed while the editor moves to another block (after Enter, say).
      if (moving && event.isTrusted) {
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.isComposing) {
          pending += event.key;
        }
        if (!event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const current = equation;
      const selection = document.getSelection();
      if (!current || !event.isTrusted || event.key !== "Backspace") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const node = selection?.focusNode;
      if (!selection?.isCollapsed || !node || !current.leaf.contains(node)) return;
      if (textOffset(current.leaf, node, selection.focusOffset) !== 0) return;
      const api = getInternals();
      if (!api) return;
      event.preventDefault();
      event.stopPropagation();
      equation = null;
      equationStyle.textContent = "";
      removeEquation(api, current).catch((error) =>
        console.error("[better-notion] live-markdown couldn't remove the equation", error),
      );
    };

    document.addEventListener("selectionchange", schedule);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keyup", schedule, true);
    document.addEventListener("keydown", onKeyDown, true);
    const unsubscribe = ctx.onOptionChange(() => session?.close());
    schedule();

    return () => {
      window.clearInterval(probe);
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keyup", schedule, true);
      document.removeEventListener("keydown", onKeyDown, true);
      unsubscribe();
      session?.close();
      editorStyle.remove();
      equationStyle.remove();
    };
  },
};
