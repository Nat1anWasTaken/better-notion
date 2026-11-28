import { describe, expect, it } from "vitest";
import { matchPrefix } from "./blocks";
import { carry } from "./carry";
import { parse, toModel, toSource } from "./parse";
import { fromSpans, type RichText, type Span, toSpans } from "./rich-text";
import { parseOptions, type SourceOptions, serialize } from "./serialize";

const OPTIONS: SourceOptions = { highlight: true, underline: true, quote: '"' };

function source(type: string, title: RichText): string {
  return serialize(type, toSpans(title, OPTIONS), OPTIONS);
}

function read(type: string, src: string): { type: string; title: RichText; spans: Span[] } {
  const parsed = parse(src, parseOptions(type, OPTIONS));
  return { type: parsed.type, title: fromSpans(parsed.spans), spans: parsed.spans };
}

/** The playground paragraph, as Notion stores it. */
const RICH: RichText = [
  ["Plain "],
  ["bold", [["b"]]],
  [", "],
  ["italic", [["i"]]],
  [", "],
  ["strike", [["s"]]],
  [", "],
  ["code", [["c"]]],
  [", "],
  ["u", [["_"]]],
  [", "],
  ["⁍", [["e", "E=mc^2"]]],
  [", "],
  ["a link", [["a", "https://example.com/a_(b)"]]],
  [", "],
  ["hi", [["h", "yellow_background"]]],
  [", "],
  ["bold ", [["b"]]],
  ["nested", [["b"], ["i"]]],
  [" bold", [["b"]]],
];

describe("serialize", () => {
  it("writes inline formats as markdown", () => {
    expect(source("text", RICH)).toBe(
      "Plain **bold**, *italic*, ~~strike~~, `code`, <u>u</u>, $E=mc^2$, [a link](https://example.com/a_(b)), ==hi==, **bold *nested* bold**",
    );
  });

  it("writes headings with a visible prefix and drawn blocks without one", () => {
    expect(source("sub_header", [["Title"]])).toBe("## Title");
    expect(source("header_4", [["Title"]])).toBe("#### Title");
    expect(source("bulleted_list", [["Item"]])).toBe("Item");
    expect(source("to_do", [["Task"]])).toBe("Task");
  });

  it("writes spaces at the edge of a run outside its markers", () => {
    expect(source("text", [["bold ", [["b"]]], ["x"]])).toBe("**bold** x");
  });

  it("escapes only when text would read as syntax", () => {
    expect(source("text", [["2 * 3 = 6"]])).toBe("2 * 3 = 6");
    expect(source("text", [["*not italic*"]])).toBe("\\*not italic\\*");
    expect(source("text", [["# not a heading"]])).toBe("\\# not a heading");
    expect(source("text", [["1. not a list"]])).toBe("1\\. not a list");
    // A drawn block's text isn't parsed for a prefix.
    expect(source("bulleted_list", [["# hash"]])).toBe("# hash");
  });

  it("round-trips through parse", () => {
    for (const [type, title] of [
      ["text", RICH.slice(0, -3)],
      [
        "header",
        [
          ["a", [["b"], ["i"]]],
          ["b", [["b"]]],
        ],
      ],
      ["quote", [["*x*"]]],
      ["text", [["[a](b)"]]],
      [
        "text",
        [
          ["x", [["c"]]],
          ["y", [["b"], ["c"]]],
        ],
      ],
    ] as [string, RichText][]) {
      const back = read(type, source(type, title));
      expect(back.type).toBe(type);
      expect(fromSpans(carry(toSpans(title, OPTIONS), back.spans))).toEqual(title);
    }
  });
});

describe("parse", () => {
  it("reads block prefixes", () => {
    expect(read("text", "## Title")).toMatchObject({ type: "sub_header", title: [["Title"]] });
    expect(read("sub_header", "### Title").type).toBe("sub_sub_header");
    expect(read("sub_header", "##Title")).toMatchObject({ type: "text", title: [["##Title"]] });
    expect(read("text", "- x").type).toBe("bulleted_list");
    expect(read("text", "[] x").type).toBe("to_do");
    expect(read("text", '" x').type).toBe("quote");
    expect(read("text", "> x").type).toBe("toggle");
    expect(read("bulleted_list", "## x")).toMatchObject({
      type: "bulleted_list",
      title: [["## x"]],
    });
  });

  it("follows the quote marker option", () => {
    expect(matchPrefix("> x", ">")?.type).toBe("quote");
    expect(matchPrefix('" x', ">")).toBeNull();
  });

  it("leaves unmatched markers as text", () => {
    expect(read("text", "**bold").title).toEqual([["**bold"]]);
    expect(read("text", "a * b * c").title).toEqual([["a * b * c"]]);
    expect(read("text", "[x]").title).toEqual([["[x]"]]);
    expect(read("text", "``").title).toEqual([["``"]]);
  });

  it("nests and stacks markers", () => {
    expect(read("text", "***x***").title).toEqual([["x", [["b"], ["i"]]]]);
    expect(read("text", "*a **b** c*").title).toEqual([
      ["a ", [["i"]]],
      ["b", [["b"], ["i"]]],
      [" c", [["i"]]],
    ]);
    expect(read("text", "[**x**](u)").title).toEqual([["x", [["a", "u"], ["b"]]]]);
  });

  it("maps offsets between source and plain text", () => {
    const parsed = parse("## a**b**$x$c", parseOptions("sub_header", OPTIONS));
    const { pieces } = parsed;
    // Plain text: "ab⁍c".
    expect(toSource(parsed, 0)).toBe(3);
    expect(toSource(parsed, 1)).toBe(4);
    // Between runs, outside the markers of both.
    expect(toSource(parsed, 2)).toBe(9);
    expect(toSource(parsed, 3)).toBe(12);
    expect(toModel(pieces, 0)).toBe(0);
    expect(toModel(pieces, 5)).toBe(1);
    expect(toModel(pieces, 7)).toBe(2);
    expect(toModel(pieces, 9)).toBe(2);
    expect(toModel(pieces, 12)).toBe(3);
  });

  it("maps plain-text offsets outside the markers at the edges of runs", () => {
    const at = (source: string, model: number) =>
      toSource(parse(source, parseOptions("text", OPTIONS)), model);
    expect(at("**a** b", 0)).toBe(0);
    expect(at("**a** b", 1)).toBe(5);
    expect(at("**a**", 1)).toBe(5);
    expect(at("a ***b*** c", 2)).toBe(2);
    expect(at("a ***b*** c", 3)).toBe(9);
    expect(at("*a **b***", 1)).toBe(2);
    expect(at("*a **b***", 3)).toBe(9);
    expect(at("a\\*b", 1)).toBe(1);
    expect(at("a\\*b", 2)).toBe(3);
    expect(at("", 0)).toBe(0);
    const heading = (source: string, model: number) =>
      toSource(parse(source, parseOptions("header", OPTIONS)), model);
    expect(heading("# **a**", 0)).toBe(2);
    expect(heading("# ", 0)).toBe(2);
  });

  it("handles pathological input quickly", () => {
    const start = performance.now();
    read("text", "*a ".repeat(200));
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("carry", () => {
  const coloured: RichText = [
    ["red", [["h", "red"]]],
    [" and "],
    ["‣", [["u", "user-id"]]],
    [" ok ", [["m", "comment"]]],
    ["mark", [["h", "blue_background"]]],
  ];

  it("keeps colours, mentions, comments and highlight colours through an edit", () => {
    // One edit at a time, as the editor sees them.
    const typed = carry(toSpans(coloured, OPTIONS), read("text", "redd and ‣ ok ==mark==").spans);
    expect(fromSpans(carry(typed, read("text", "redd and ‣ ok ==mark==!").spans))).toEqual([
      ["redd", [["h", "red"]]],
      [" and "],
      ["‣", [["u", "user-id"]]],
      [" ok ", [["m", "comment"]]],
      ["mark", [["h", "blue_background"]]],
      ["!"],
    ]);
  });

  it("gives a new highlight the default colour", () => {
    const edited = read("text", "==new==");
    expect(fromSpans(carry([], edited.spans))).toEqual([["new", [["h", "yellow_background"]]]]);
  });
});
