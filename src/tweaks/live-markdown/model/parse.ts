import { matchPrefix, type QuoteMarker } from "./blocks";
import { EQUATION_CHAR, type Format, normalize, type Span, type Syntax } from "./rich-text";

/**
 * A stretch of the source. `model` is the offset in the block's plain text where it starts: text
 * maps one to one, an equation's TeX (`atom`) is one character, and markers take no room.
 */
export interface Piece {
  start: number;
  end: number;
  kind: "text" | "marker" | "atom";
  model: number;
  /** The run a marker opens or closes, as an index into `Parsed.runs`; -1 for other pieces. */
  run: number;
  /** Formats applying to the piece, including the run a marker belongs to. */
  formats: ReadonlyMap<Format, string>;
}

export interface Parsed {
  type: string;
  /** Length of the block prefix (`## `, `- `, …) at the start of the source. */
  prefix: number;
  spans: Span[];
  pieces: Piece[];
  /** Source range of each formatted run, from its opening marker to its closing one. */
  runs: [number, number][];
}

export interface ParseOptions extends Syntax {
  /** The block's type, kept when `prefix` is off or nothing else matches. */
  type: string;
  /** Whether the source starts with block syntax. Off for blocks whose prefix is hidden. */
  prefix: boolean;
  quote: QuoteMarker;
}

type Range = readonly [number, number];

type Node =
  | { kind: "text"; start: number; end: number }
  | { kind: "escape"; start: number }
  | { kind: "wrap"; format: Format; value: string; open: Range; close: Range; children: Node[] }
  | { kind: "equation"; open: Range; tex: Range; close: Range };

interface Result {
  nodes: Node[];
  end: number;
}

const PUNCTUATION = /[!-/:-@[-`{-~]/;

const PAIRS: [string, Format][] = [
  ["**", "bold"],
  ["~~", "strike"],
  ["==", "highlight"],
  ["*", "italic"],
];

function parseInline(src: string, from: number, syntax: Syntax): Node[] {
  const memo = new Map<string, Result | null>();

  /** Parses from `start` until `closer`, or to the end without one. Fails if `closer` is missing. */
  const sequence = (start: number, closer: string | null): Result | null => {
    const key = `${start}:${closer}`;
    if (memo.has(key)) return memo.get(key) ?? null;
    const nodes: Node[] = [];
    let text = start;
    let i = start;
    let result: Result | null = null;
    const flush = (to: number) => {
      if (to > text) nodes.push({ kind: "text", start: text, end: to });
    };
    while (i < src.length) {
      if (closer && i > start && src.startsWith(closer, i) && !/\s/.test(src[i - 1] ?? "")) {
        // `**` inside an italic run may open bold rather than close the italic.
        const bold = closer === "*" && src.startsWith("**", i) ? pair(i, "**", "bold") : null;
        if (!bold) {
          flush(i);
          result = { nodes, end: i + closer.length };
          break;
        }
      }
      const node = open(i);
      if (node) {
        flush(i);
        nodes.push(...node.nodes);
        i = node.end;
        text = i;
      } else {
        i++;
      }
    }
    if (!closer && !result) {
      flush(src.length);
      result = { nodes, end: src.length };
    }
    memo.set(key, result);
    return result;
  };

  const wrap = (format: Format, value: string, open: Range, close: Range, children: Node[]) => ({
    kind: "wrap" as const,
    format,
    value,
    open,
    close,
    children,
  });

  /** Parses a formatted run starting at `i`, or returns null if `i` doesn't start one. */
  function open(i: number): Result | null {
    const char = src[i];
    if (char === "\\" && PUNCTUATION.test(src[i + 1] ?? "")) {
      return { nodes: [{ kind: "escape", start: i }], end: i + 2 };
    }
    if (char === "`") {
      const end = src.indexOf("`", i + 1);
      if (end <= i + 1) return null;
      const children: Node[] = [{ kind: "text", start: i + 1, end }];
      return { nodes: [wrap("code", "", [i, i + 1], [end, end + 1], children)], end: end + 1 };
    }
    if (char === "$") {
      const end = src.indexOf("$", i + 1);
      if (end <= i + 1) return null;
      const node: Node = {
        kind: "equation",
        open: [i, i + 1],
        tex: [i + 1, end],
        close: [end, end + 1],
      };
      return { nodes: [node], end: end + 1 };
    }
    if (char === "[") {
      const text = sequence(i + 1, "]");
      if (!text || src[text.end] !== "(") return null;
      let depth = 0;
      for (let j = text.end + 1; j < src.length; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")" && depth-- === 0) {
          const url = src.slice(text.end + 1, j);
          if (!url) return null;
          const node = wrap("link", url, [i, i + 1], [text.end - 1, j + 1], text.nodes);
          return { nodes: [node], end: j + 1 };
        }
      }
      return null;
    }
    if (syntax.underline && src.startsWith("<u>", i)) {
      const inner = sequence(i + 3, "</u>");
      if (!inner) return null;
      const node = wrap("underline", "", [i, i + 3], [inner.end - 4, inner.end], inner.nodes);
      return { nodes: [node], end: inner.end };
    }
    for (const [marker, format] of PAIRS) {
      if (format === "highlight" && !syntax.highlight) continue;
      const result = pair(i, marker, format);
      if (result) return result;
    }
    return null;
  }

  function pair(i: number, marker: string, format: Format): Result | null {
    // Like markdown, an opening marker can't be followed by a space: `a * b * c` stays text.
    if (!src.startsWith(marker, i) || /\s/.test(src[i + marker.length] ?? " ")) return null;
    const inner = sequence(i + marker.length, marker);
    if (!inner) return null;
    const close: Range = [inner.end - marker.length, inner.end];
    return {
      nodes: [wrap(format, "", [i, i + marker.length], close, inner.nodes)],
      end: inner.end,
    };
  }

  return sequence(from, null)?.nodes ?? [];
}

export function parse(src: string, options: ParseOptions): Parsed {
  const match = options.prefix ? matchPrefix(src, options.quote) : null;
  const prefix = match?.length ?? 0;
  const type = match?.type ?? (options.prefix ? "text" : options.type);

  const spans: Span[] = [];
  const pieces: Piece[] = [];
  const runs: [number, number][] = [];
  let model = 0;
  if (prefix)
    pieces.push({ start: 0, end: prefix, kind: "marker", model, run: -1, formats: new Map() });

  const text = (start: number, end: number, formats: ReadonlyMap<Format, string>) => {
    if (end <= start) return;
    spans.push({ text: src.slice(start, end), formats, extras: [] });
    pieces.push({ start, end, kind: "text", model, run: -1, formats });
    model += end - start;
  };
  const marker = ([start, end]: Range, run: number, formats: ReadonlyMap<Format, string>) => {
    pieces.push({ start, end, kind: "marker", model, run, formats });
  };

  const walk = (nodes: readonly Node[], formats: ReadonlyMap<Format, string>) => {
    for (const node of nodes) {
      if (node.kind === "text") {
        text(node.start, node.end, formats);
      } else if (node.kind === "escape") {
        marker([node.start, node.start + 1], -1, formats);
        text(node.start + 1, node.start + 2, formats);
      } else if (node.kind === "equation") {
        const run = runs.push([node.open[0], node.close[1]]) - 1;
        const inner = new Map<Format, string>([...formats, ["equation", src.slice(...node.tex)]]);
        marker(node.open, run, inner);
        spans.push({ text: EQUATION_CHAR, formats: inner, extras: [] });
        pieces.push({
          start: node.tex[0],
          end: node.tex[1],
          kind: "atom",
          model,
          run: -1,
          formats: inner,
        });
        model += 1;
        marker(node.close, run, inner);
      } else {
        const run = runs.push([node.open[0], node.close[1]]) - 1;
        const inner = new Map([...formats, [node.format, node.value]]);
        marker(node.open, run, inner);
        walk(node.children, inner);
        marker(node.close, run, inner);
      }
    }
  };
  walk(parseInline(src, prefix, options), new Map());

  return { type, prefix, spans: normalize(spans), pieces, runs };
}

function length(piece: Piece): number {
  if (piece.kind === "text") return piece.end - piece.start;
  return piece.kind === "atom" ? 1 : 0;
}

/** The plain-text offset of a source offset. Inside a marker or equation, the offset before it. */
export function toModel(pieces: readonly Piece[], offset: number): number {
  let model = 0;
  for (const piece of pieces) {
    if (offset < piece.start) break;
    if (piece.kind === "text" && offset <= piece.end) return piece.model + offset - piece.start;
    model = piece.model + (offset >= piece.end ? length(piece) : 0);
  }
  return model;
}

/**
 * The source offset of a plain-text offset. Where formatting starts or ends there, it's the
 * offset outside the markers: after the block prefix and any closing markers, before any opening
 * ones (and before an escape, which belongs to the character after it).
 */
export function toSource({ pieces, prefix }: Parsed, model: number): number {
  let at = 0;
  const opened = new Set<number>();
  for (const piece of pieces) {
    if (piece.kind === "marker") {
      const opens = piece.run >= 0 ? !opened.has(piece.run) : piece.start >= prefix;
      opened.add(piece.run);
      if (piece.model > model || (piece.model === model && opens)) break;
    } else {
      if (piece.model >= model) break;
      const end = piece.model + length(piece);
      if (piece.kind === "text" && model < end) return piece.start + model - piece.model;
    }
    at = piece.end;
  }
  return at;
}
