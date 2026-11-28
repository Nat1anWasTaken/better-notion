import { describe, expect, it } from "vitest";
import type { BlockValue, Pointer } from "./internals";
import { indentOps, insertAboveOps, mergeOps, outdentOps, splitOps } from "./structure";

const SPACE = "space";
const at = (id: string): Pointer => ({ table: "block", id, spaceId: SPACE });
const block = (id: string, type = "text", extra: Partial<BlockValue> = {}): BlockValue => ({
  id,
  type,
  parent_id: "page",
  parent_table: "block",
  ...extra,
});
const NEW = { id: "new", userId: "me", now: 1 };

describe("structure", () => {
  it("splits a block, continuing lists", () => {
    const ops = splitOps(at("a"), block("a", "to_do"), NEW, [["left"]], [["right"]]);
    expect(ops.map((op) => [op.pointer.id, op.command, op.path.join(".")])).toEqual([
      ["a", "set", "properties.title"],
      ["new", "set", ""],
      ["new", "update", ""],
      ["page", "listAfter", "content"],
    ]);
    expect(ops[1]?.args).toMatchObject({ type: "to_do", properties: { title: [["right"]] } });
    expect(ops[3]?.args).toEqual({ after: "a", id: "new" });
  });

  it("starts a heading's next block as text", () => {
    const ops = splitOps(at("a"), block("a", "sub_header"), NEW, [["x"]], []);
    expect(ops[1]?.args).toMatchObject({ type: "text" });
    expect(ops[1]?.args).not.toHaveProperty("properties");
  });

  it("adds an empty block above", () => {
    const ops = insertAboveOps(at("a"), block("a"), NEW);
    expect(ops.at(-1)?.args).toEqual({ before: "a", id: "new" });
  });

  it("merges a block into another", () => {
    const ops = mergeOps(at("a"), [["ab"]], at("b"), block("b"));
    expect(ops.map((op) => [op.pointer.id, op.command, op.args])).toEqual([
      ["a", "set", [["ab"]]],
      ["b", "update", { alive: false }],
      ["page", "listRemove", { id: "b" }],
    ]);
  });

  it("indents into the block above, after its children", () => {
    const ops = indentOps(at("b"), block("b"), block("a", "bulleted_list", { content: ["c1"] }));
    expect(ops?.map((op) => [op.pointer.id, op.command, op.args])).toEqual([
      ["page", "listRemove", { id: "b" }],
      ["b", "update", { parent_id: "a", parent_table: "block" }],
      ["a", "listAfter", { after: "c1", id: "b" }],
    ]);
    expect(indentOps(at("b"), block("b"), block("a", "image"))).toBeNull();
  });

  it("outdents, taking the blocks after it along as children", () => {
    const parent = block("p", "bulleted_list", { parent_id: "page", content: ["b", "c"] });
    const child = block("b", "bulleted_list", { parent_id: "p" });
    const after = block("c", "bulleted_list", { parent_id: "p" });
    const ops = outdentOps(at("b"), child, parent, [after]);
    expect(ops?.map((op) => [op.pointer.id, op.command, op.args])).toEqual([
      ["p", "listRemove", { id: "c" }],
      ["c", "update", { parent_id: "b", parent_table: "block" }],
      ["b", "listAfter", { id: "c" }],
      ["p", "listRemove", { id: "b" }],
      ["b", "update", { parent_id: "page", parent_table: "block" }],
      ["page", "listAfter", { after: "p", id: "b" }],
    ]);
  });

  it("never outdents out of the page", () => {
    const page = block("page", "page", { parent_id: "ws", parent_table: "space" });
    expect(outdentOps(at("b"), block("b"), page, [])).toBeNull();
  });
});
