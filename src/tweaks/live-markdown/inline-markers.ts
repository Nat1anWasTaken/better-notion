import { FORMATS, type Format } from "./detect";

export interface Token {
  /** Notion's `data-token-index`. Plain text between tokens takes an index too. */
  index: number;
  formats: ReadonlyMap<Format, string>;
}

/** A stretch of contiguous tokens sharing one format. `start` and `end` are token positions. */
export interface Run {
  format: Format;
  value: string;
  start: number;
  end: number;
}

export interface Markers {
  before: string;
  after: string;
}

const rank = (run: Run) => FORMATS.indexOf(run.format);

/**
 * Notion flattens formatting into one span per run of identical formats, so `**a *b* c**` arrives
 * as three spans. This groups them back into one run per format.
 */
export function findRuns(tokens: readonly Token[]): Run[] {
  const runs: Run[] = [];
  const open = new Map<Format, Run>();
  tokens.forEach((token, pos) => {
    const contiguous = pos > 0 && token.index === (tokens[pos - 1]?.index ?? Number.NaN) + 1;
    for (const format of FORMATS) {
      const value = token.formats.get(format);
      const current = open.get(format);
      if (value !== undefined && current && contiguous && current.value === value) {
        current.end = pos;
        continue;
      }
      open.delete(format);
      if (value !== undefined) {
        const run = { format, value, start: pos, end: pos };
        runs.push(run);
        open.set(format, run);
      }
    }
  });
  return runs;
}

/** Markers opening a run go outermost first; markers closing a run go innermost first. */
export function openers(runs: readonly Run[]): Run[] {
  return [...runs].sort((a, b) => a.start - b.start || b.end - a.end || rank(a) - rank(b));
}

export function closers(runs: readonly Run[]): Run[] {
  return [...runs].sort((a, b) => a.end - b.end || b.start - a.start || rank(b) - rank(a));
}

const SYMBOLS: Record<Format, readonly [string, string]> = {
  link: ["[", "]"],
  highlight: ["==", "=="],
  bold: ["**", "**"],
  italic: ["*", "*"],
  strike: ["~~", "~~"],
  underline: ["<u>", "</u>"],
  code: ["`", "`"],
  equation: ["$", "$"],
};

function shortUrl(url: string): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/, "");
  return bare.length > 32 ? `${bare.slice(0, 31)}…` : bare;
}

export function openMarker(run: Run): string {
  return SYMBOLS[run.format][0];
}

export function closeMarker(run: Run): string {
  if (run.format === "link") return `](${shortUrl(run.value)})`;
  return SYMBOLS[run.format][1];
}

/** The text to draw before and after each token for the given runs. */
export function markersFor(tokenCount: number, runs: readonly Run[]): Markers[] {
  const markers = Array.from({ length: tokenCount }, () => ({ before: "", after: "" }));
  for (const run of openers(runs)) {
    const marker = markers[run.start];
    if (marker) marker.before += openMarker(run);
  }
  for (const run of closers(runs)) {
    const marker = markers[run.end];
    if (marker) marker.after += closeMarker(run);
  }
  return markers;
}
