import { HEADINGS } from "../model/blocks";
import type { RichText } from "../model/rich-text";
import type { BlockValue, Operation, Pointer } from "./internals";

/**
 * Operations for changes to the page's structure: splitting, merging and moving blocks. They are
 * the operations Notion's editor sends for Enter, Backspace and Tab, with the text set as a whole.
 */

/** Blocks whose type carries on to the block Enter creates after them, like in Notion. */
const CONTINUED = new Set(["bulleted_list", "numbered_list", "to_do", "toggle"]);

/** Blocks Tab can move another block into. */
const PARENTS = new Set([
  "text",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "quote",
  "callout",
]);

/** Blocks Shift-Tab can move a block out of: those Tab moves into, and toggle headings. */
const NESTING = new Set([...PARENTS, ...HEADINGS]);

export interface NewBlock {
  id: string;
  userId: string;
  now: number;
}

function pointer(table: string | undefined, id: string | undefined, spaceId?: string): Pointer {
  return { table: table ?? "block", id: id ?? "", spaceId };
}

function parentOf(value: BlockValue, spaceId?: string): Pointer {
  return pointer(value.parent_table, value.parent_id, spaceId);
}

function titleOps(at: Pointer, title: RichText): Operation {
  return { pointer: at, path: ["properties", "title"], command: "set", args: title };
}

/** The type Enter gives the new block after a block of `type`. */
export function continuedType(type: string): string {
  return CONTINUED.has(type) ? type : "text";
}

function createOps(
  at: Pointer,
  value: BlockValue,
  block: NewBlock,
  type: string,
  title: RichText,
): Operation[] {
  const created: Pointer = { table: "block", id: block.id, spaceId: at.spaceId };
  const record: Record<string, unknown> = {
    id: block.id,
    type,
    space_id: at.spaceId,
    created_time: block.now,
    created_by_table: "notion_user",
    created_by_id: block.userId,
    last_edited_time: block.now,
    last_edited_by_table: "notion_user",
    last_edited_by_id: block.userId,
  };
  if (title.length) record.properties = { title };
  return [
    { pointer: created, path: [], command: "set", args: record },
    {
      pointer: created,
      path: [],
      command: "update",
      args: { parent_id: value.parent_id, parent_table: value.parent_table, alive: true },
    },
  ];
}

/** Splits a block in two at the caret: `before` stays, `after` moves to a new block below it. */
export function splitOps(
  at: Pointer,
  value: BlockValue,
  block: NewBlock,
  before: RichText,
  after: RichText,
): Operation[] {
  return [
    titleOps(at, before),
    ...createOps(at, value, block, continuedType(value.type), after),
    {
      pointer: parentOf(value, at.spaceId),
      path: ["content"],
      command: "listAfter",
      args: { after: value.id, id: block.id },
    },
  ];
}

/** Adds an empty block above, as Enter does at the start of a block. */
export function insertAboveOps(at: Pointer, value: BlockValue, block: NewBlock): Operation[] {
  return [
    ...createOps(at, value, block, continuedType(value.type), []),
    {
      pointer: parentOf(value, at.spaceId),
      path: ["content"],
      command: "listBefore",
      args: { before: value.id, id: block.id },
    },
  ];
}

/**
 * Appends a block's text to another block's and removes it. Its children take its place in its
 * parent, as in Notion.
 */
export function mergeOps(
  into: Pointer,
  title: RichText,
  from: Pointer,
  fromValue: BlockValue,
): Operation[] {
  const parent = parentOf(fromValue, from.spaceId);
  const children = (fromValue.content ?? []).flatMap((id): Operation[] => {
    const child = pointer("block", id, from.spaceId);
    return [
      {
        pointer: child,
        path: [],
        command: "update",
        args: { parent_id: fromValue.parent_id, parent_table: fromValue.parent_table, alive: true },
      },
      {
        pointer: parent,
        path: ["content"],
        command: "listBefore",
        args: { before: fromValue.id, id },
      },
      { pointer: from, path: ["content"], command: "listRemove", args: { id } },
    ];
  });
  return [
    titleOps(into, title),
    ...children,
    { pointer: from, path: [], command: "update", args: { alive: false } },
    { pointer: parent, path: ["content"], command: "listRemove", args: { id: fromValue.id } },
  ];
}

function moveOps(
  at: Pointer,
  value: BlockValue,
  to: Pointer,
  position: { after?: string },
): Operation[] {
  return [
    {
      pointer: parentOf(value, at.spaceId),
      path: ["content"],
      command: "listRemove",
      args: { id: value.id },
    },
    {
      pointer: at,
      path: [],
      command: "update",
      args: { parent_id: to.id, parent_table: to.table },
    },
    { pointer: to, path: ["content"], command: "listAfter", args: { ...position, id: value.id } },
  ];
}

/** Moves a block into the end of the block above it, as Tab does. */
export function indentOps(
  at: Pointer,
  value: BlockValue,
  previous: BlockValue,
): Operation[] | null {
  if (!PARENTS.has(previous.type)) return null;
  const to = pointer("block", previous.id, at.spaceId);
  return moveOps(at, value, to, { after: previous.content?.at(-1) });
}

/**
 * Moves a block out of its parent to just after it, as Shift-Tab does. The blocks after it in
 * the parent go with it, as its children, so the order on the page doesn't change.
 */
export function outdentOps(
  at: Pointer,
  value: BlockValue,
  parent: BlockValue,
  siblings: readonly BlockValue[],
): Operation[] | null {
  // Only out of blocks nested in the page's text, never out of the page or a column.
  if (!NESTING.has(parent.type) || parent.parent_table !== "block" || !parent.parent_id)
    return null;
  const grandparent = pointer("block", parent.parent_id, at.spaceId);
  const ops: Operation[] = [];
  let last = value.content?.at(-1);
  for (const sibling of siblings) {
    ops.push(
      ...moveOps(
        pointer("block", sibling.id, at.spaceId),
        sibling,
        at,
        last ? { after: last } : {},
      ),
    );
    last = sibling.id;
  }
  ops.push(...moveOps(at, value, grandparent, { after: parent.id }));
  return ops;
}
