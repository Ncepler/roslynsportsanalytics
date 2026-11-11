// Where the schedule and results live. Two small JSON files in a PRIVATE Vercel
// Blob. Conditional writes (ETag) make claims atomic with no database: when two
// people claim at once, only one write goes through and the other re-reads.

import { BlobError, BlobPreconditionFailedError, del, get, put } from "@vercel/blob";
import { GameError } from "./errors";
import { emptyIndex } from "./logic";
import type { Index, StoredResult } from "./types";

export interface Store {
  /** The current index and its version tag (null when none exists yet). */
  readIndex(): Promise<{ index: Index; etag: string | null }>;
  /** Writes only if nobody changed the index since `etag`. false = lost the race. */
  writeIndex(index: Index, etag: string | null): Promise<boolean>;
  readResult(id: string): Promise<StoredResult | null>;
  writeResult(id: string, result: StoredResult): Promise<void>;
  deleteResult(id: string): Promise<void>;
}

const INDEX_PATH = "data/index.json";
const resultPath = (id: string) => `data/results/${id}.json`;

const PRIVATE_HELP = "Saved games need a PRIVATE Vercel Blob store. Create a private store and connect it to this project.";

function storageError(err: unknown): never {
  const message = err instanceof Error ? err.message : "";
  if (/private|public|access/i.test(message)) throw new GameError(503, PRIVATE_HELP);
  throw new GameError(502, "Couldn't reach game storage. Try again.");
}

async function readJson<T>(path: string): Promise<{ value: T; etag: string } | null> {
  let res;
  try {
    res = await get(path, { access: "private", useCache: false });
  } catch (err) {
    if (err instanceof BlobError && /not.?found/i.test(err.message)) return null;
    return storageError(err);
  }
  if (!res || res.statusCode !== 200) return null;
  return { value: (await new Response(res.stream).json()) as T, etag: res.blob.etag };
}

const blobStore: Store = {
  async readIndex() {
    const found = await readJson<Index>(INDEX_PATH);
    return found ? { index: found.value, etag: found.etag } : { index: emptyIndex(), etag: null };
  },
  async writeIndex(index, etag) {
    const body = JSON.stringify(index);
    try {
      await put(INDEX_PATH, body, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return true;
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError) return false;
      // First write lost a race with another first write: the file exists now.
      if (!etag && err instanceof BlobError && (await readJson<Index>(INDEX_PATH))) return false;
      return storageError(err);
    }
  },
  async readResult(id) {
    return (await readJson<StoredResult>(resultPath(id)))?.value ?? null;
  },
  async writeResult(id, result) {
    try {
      await put(resultPath(id), JSON.stringify(result), { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
    } catch (err) {
      storageError(err);
    }
  },
  async deleteResult(id) {
    await del(resultPath(id)).catch(() => {});
  },
};

/** In-memory store for tests and for `next dev` without a Blob token. Same ETag rules as Blob. */
export function createMemoryStore(): Store {
  let current: { index: Index; version: number } | null = null;
  const results = new Map<string, StoredResult>();
  return {
    async readIndex() {
      await Promise.resolve();
      return current ? { index: structuredClone(current.index), etag: String(current.version) } : { index: emptyIndex(), etag: null };
    },
    async writeIndex(index, etag) {
      await Promise.resolve();
      const have = current ? String(current.version) : null;
      if (have !== etag) return false;
      current = { index: structuredClone(index), version: (current?.version ?? 0) + 1 };
      return true;
    },
    async readResult(id) {
      return structuredClone(results.get(id) ?? null);
    },
    async writeResult(id, result) {
      results.set(id, structuredClone(result));
    },
    async deleteResult(id) {
      results.delete(id);
    },
  };
}

const g = globalThis as unknown as { __gamesMemoryStore?: Store };

export function getStore(): Store {
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobStore;
  if (process.env.NODE_ENV !== "production") return (g.__gamesMemoryStore ??= createMemoryStore());
  throw new GameError(503, "Game storage isn't set up yet (no Blob store connected).");
}
