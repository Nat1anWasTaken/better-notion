import type { RichText } from "../model/rich-text";

/**
 * Notion's own data layer: the record store its components read blocks from, and the
 * transaction functions its editor writes with. Edits made through them render at once, sync to
 * collaborators and land in Notion's undo history, like any edit made in Notion.
 *
 * None of this is public. Module ids change with every Notion release, so modules are found by
 * the names they export or by their source, and every lookup is checked before use.
 */

export interface Pointer {
  table: string;
  id: string;
  spaceId?: string;
}

export interface BlockValue {
  id: string;
  type: string;
  properties?: { title?: RichText } & Record<string, unknown>;
  parent_id?: string;
  parent_table?: string;
  /** Ids of the block's children. */
  content?: string[];
}

export interface Environment {
  currentUser?: { id?: string };
  idCreator?: { idWithSpaceId(spaceId: string, table: string): Promise<string> };
}

/** The store a block's React components hold. */
export interface BlockStore {
  pointer: Pointer;
  environment: Environment;
  getValue(): BlockValue | undefined;
  /** The value of another record, from the same cache. */
  getRecordValue(pointer: Pointer): BlockValue | undefined;
  /** The store of another record, created as a child of `parent`. */
  getRecordStore(parent: BlockStore, pointer: Pointer): BlockStore;
}

/** One change in a Notion transaction, as its editor sends them. */
export interface Operation {
  pointer: Pointer;
  path: string[];
  command: "set" | "update" | "listAfter" | "listBefore" | "listRemove";
  args: unknown;
}

type CreateAndCommit = (options: {
  environment: unknown;
  userAction: string;
  perform: (transaction: unknown) => void;
}) => unknown;

type Apply = (options: { store: BlockStore; transaction: unknown; operation: Operation }) => void;

type Require = ((id: string) => Record<string, unknown>) & {
  m: Record<string, (...args: never[]) => unknown>;
};

export interface Internals {
  /** Sets values on a block in one undoable transaction. */
  commit(store: BlockStore, changes: readonly (readonly [path: string[], value: unknown])[]): void;
  /** Applies operations on any records in one undoable transaction. */
  transact(store: BlockStore, operations: readonly Operation[]): void;
}

/** Notion's bundler keeps its chunks in this global array. */
const CHUNKS = "rspackChunknotion_next";

/** Gets the bundler's module require by loading an empty chunk whose runtime callback receives it. */
function bundlerRequire(win: Window): Require | null {
  const chunks = (win as unknown as Record<string, unknown>)[CHUNKS];
  if (!Array.isArray(chunks)) return null;
  let require: Require | null = null;
  chunks.push([
    [Symbol("better-notion")],
    {},
    (r: Require) => {
      require = r;
    },
  ]);
  return require;
}

/** Finds a module whose source contains `needle` and picks a value from its exports. */
function findExport<T>(
  require: Require,
  needle: string,
  pick: (exports: Record<string, unknown>) => T | undefined,
): T | undefined {
  for (const [id, factory] of Object.entries(require.m)) {
    if (!String(factory).includes(needle)) continue;
    try {
      const found = pick(require(id));
      if (found) return found;
    } catch {
      // Not the module we want.
    }
  }
  return undefined;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

/** Looks up Notion's internals, or returns null if this version of Notion doesn't have them. */
export function loadInternals(win: Window = window): Internals | null {
  const require = bundlerRequire(win);
  if (!require || typeof require !== "function" || !require.m) return null;

  const createAndCommit = findExport(require, "createAndCommit:", (exports) => {
    const fn = exports.createAndCommit;
    return isFunction(fn) ? (fn as unknown as CreateAndCommit) : undefined;
  });
  // Applies an operation to the local record cache and records it, with its inverse for undo.
  const apply = findExport(require, "DANGEROUS_pushOperations({operations:[", (exports) =>
    Object.values(exports).find(
      (fn): fn is Apply =>
        isFunction(fn) &&
        String(fn).includes("DANGEROUS_pushOperations") &&
        String(fn).includes("makeGetRecordValueFn"),
    ),
  );
  if (!createAndCommit || !apply) return null;

  return {
    commit(store, changes) {
      this.transact(
        store,
        changes.map(([path, args]) => ({ pointer: store.pointer, path, command: "set", args })),
      );
    },
    transact(store, operations) {
      createAndCommit({
        environment: store.environment,
        userAction: "BetterNotion.liveMarkdown",
        perform: (transaction) => {
          for (const operation of operations) {
            const target =
              operation.pointer.id === store.pointer.id
                ? store
                : store.getRecordStore(store, operation.pointer);
            apply({ store: target, transaction, operation });
          }
        },
      });
    },
  };
}

/** The record store of a block element, from the React props of the components rendering it. */
export function blockStore(block: Element): BlockStore | null {
  const key = Object.keys(block).find((name) => name.startsWith("__reactFiber"));
  type Fiber = { memoizedProps?: { store?: BlockStore }; return?: Fiber | null };
  let fiber = key ? ((block as unknown as Record<string, Fiber>)[key] ?? null) : null;
  const id = (block as HTMLElement).dataset.blockId;
  for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return ?? null) {
    const store = fiber.memoizedProps?.store;
    if (
      store &&
      store.pointer?.id === id &&
      typeof store.getValue === "function" &&
      typeof store.getRecordStore === "function"
    ) {
      return store;
    }
  }
  return null;
}
