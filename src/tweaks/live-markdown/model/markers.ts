import { FORMATS, type Format, type Span } from "./rich-text";

/** A stretch of contiguous spans sharing one format. `start` and `end` are span positions. */
export interface Run {
  format: Format;
  value: string;
  start: number;
  end: number;
}

const rank = (run: Run) => FORMATS.indexOf(run.format);

/**
 * Notion flattens formatting into one run of text per combination of formats, so `**a *b* c**`
 * arrives as three spans. This groups them back into one run per format.
 */
export function findRuns(spans: readonly Pick<Span, "formats">[]): Run[] {
  const runs: Run[] = [];
  const open = new Map<Format, Run>();
  spans.forEach((span, pos) => {
    const previous = spans[pos - 1]?.formats;
    const same =
      previous?.size === span.formats.size &&
      [...span.formats.keys()].every((f) => previous.has(f));
    for (const format of FORMATS) {
      const value = span.formats.get(format);
      const current = open.get(format);
      // Each equation is its own run, even next to another one, and nothing can go inside code.
      const joins = format === "code" ? same : format !== "equation";
      if (value !== undefined && current?.value === value && joins) {
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
function openers(runs: readonly Run[]): Run[] {
  return [...runs].sort((a, b) => a.start - b.start || b.end - a.end || rank(a) - rank(b));
}

function closers(runs: readonly Run[]): Run[] {
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

export function openMarker(run: Run): string {
  return SYMBOLS[run.format][0];
}

export function closeMarker(run: Run): string {
  return run.format === "link" ? `](${run.value})` : SYMBOLS[run.format][1];
}

export interface Markers {
  before: string;
  after: string;
}

/** The markdown to write before and after each span. */
export function markersFor(spans: readonly Pick<Span, "formats">[]): Markers[] {
  const runs = findRuns(spans);
  const markers = spans.map(() => ({ before: "", after: "" }));
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
