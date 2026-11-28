import { DRAWN, EDITABLE } from "./model/blocks";
import {
  fromSpans,
  plainText,
  type Span,
  type Syntax,
  sliceSpans,
  toSpans,
} from "./model/rich-text";
import { type BlockStore, blockStore, type Internals, type Operation } from "./notion/internals";
import { findLeaf, neighbourLeaf } from "./notion/leaf";
import { indentOps, insertAboveOps, mergeOps, outdentOps, splitOps } from "./notion/structure";
import type { Restructure } from "./overlay/session";

/** Where the caret goes after a change: a block and an offset in its plain text. */
export interface Placement {
  blockId: string;
  model: number;
}

export interface Edited {
  blockId: string;
  store: BlockStore;
  type: string;
  spans: readonly Span[];
  model: number;
}

/**
 * Block ids for new blocks. Notion makes them asynchronously, so one is fetched ahead of time and
 * Enter can split a block at once.
 */
export class BlockIds {
  private readonly spare = new Map<string, string>();

  /** Fetches an id for the block's space, if there isn't one waiting. */
  prepare(store: BlockStore): void {
    const spaceId = store.pointer.spaceId;
    const creator = store.environment.idCreator;
    if (!spaceId || !creator || this.spare.has(spaceId)) return;
    creator
      .idWithSpaceId(spaceId, "block")
      .then((id) => this.spare.set(spaceId, id))
      .catch((error) =>
        console.error("[better-notion] live-markdown couldn't make a block id", error),
      );
  }

  take(store: BlockStore): string {
    const spaceId = store.pointer.spaceId ?? "";
    const id = this.spare.get(spaceId);
    this.spare.delete(spaceId);
    this.prepare(store);
    return id ?? crypto.randomUUID();
  }
}

function neighbour(blockId: string, step: -1 | 1): { store: BlockStore; leaf: HTMLElement } | null {
  const leaf = findLeaf(blockId);
  const next = leaf && neighbourLeaf(leaf, step);
  const block = next?.closest<HTMLElement>("[data-block-id]");
  const store = block && blockStore(block);
  return next && store ? { store, leaf: next } : null;
}

/**
 * Changes the page's structure from the block being edited, through Notion's transactions:
 * Enter splits the block, Backspace at its start and Delete at its end merge it with its
 * neighbour, and Tab and Shift-Tab move it in and out of the block above. Returns where the
 * caret goes, or null if nothing changed.
 */
export function restructure(
  internals: Internals,
  edited: Edited,
  change: Restructure,
  syntax: Syntax,
  ids: BlockIds,
): Placement | null {
  const { store, spans, model, blockId } = edited;
  const value = store.getValue();
  if (!value) return null;
  const at = store.pointer;
  const run = (ops: readonly Operation[] | null, placement: Placement) => {
    if (!ops) return null;
    internals.transact(store, ops);
    return placement;
  };
  const record = (id: string) => store.getRecordValue({ table: "block", id, spaceId: at.spaceId });
  const parent = value.parent_id
    ? store.getRecordValue({
        table: value.parent_table ?? "block",
        id: value.parent_id,
        spaceId: at.spaceId,
      })
    : undefined;
  const index = parent?.content?.indexOf(value.id) ?? -1;

  switch (change) {
    case "split": {
      const text = plainText(spans);
      // Enter on an empty list item ends the list, like in Notion.
      if (!text && DRAWN.has(edited.type) && edited.type !== "quote") {
        internals.commit(store, [[["type"], "text"]]);
        return { blockId, model: 0 };
      }
      const user = store.environment.currentUser?.id ?? "";
      const block = { id: ids.take(store), userId: user, now: Date.now() };
      if (model === 0 && text) return run(insertAboveOps(at, value, block), { blockId, model: 0 });
      const before = fromSpans(sliceSpans(spans, 0, model));
      const after = fromSpans(sliceSpans(spans, model));
      return run(splitOps(at, value, block, before, after), { blockId: block.id, model: 0 });
    }
    case "mergeUp": {
      const previous = neighbour(blockId, -1);
      const target = previous?.store.getValue();
      if (!previous || !target) return null;
      if (!EDITABLE.has(target.type)) return null;
      const head = toSpans(target.properties?.title, syntax);
      const title = fromSpans([...head, ...spans]);
      return run(mergeOps(previous.store.pointer, title, at, value), {
        blockId: target.id,
        model: plainText(head).length,
      });
    }
    case "mergeDown": {
      const next = neighbour(blockId, 1);
      const source = next?.store.getValue();
      if (!next || !source || !EDITABLE.has(source.type)) return null;
      const title = fromSpans([...spans, ...toSpans(source.properties?.title, syntax)]);
      return run(mergeOps(at, title, next.store.pointer, source), { blockId, model });
    }
    case "indent": {
      const previous = index > 0 ? record(parent?.content?.[index - 1] ?? "") : undefined;
      return run(previous ? indentOps(at, value, previous) : null, { blockId, model });
    }
    case "outdent": {
      if (!parent || index < 0) return null;
      const after = (parent.content ?? []).slice(index + 1).map(record);
      if (after.some((sibling) => !sibling)) return null;
      return run(outdentOps(at, value, parent, after as NonNullable<(typeof after)[number]>[]), {
        blockId,
        model,
      });
    }
  }
}
