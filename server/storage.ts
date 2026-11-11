/// <reference types="node" />
/**
 * Where the server keeps accounts, sessions and the leaderboard.
 *
 * - On this PC (default): JSON files in PZ_DATA_DIR (server/data).
 * - On a free host whose disk is wiped when it sleeps (Render free…): an
 *   Upstash Redis database through its REST API, when UPSTASH_REDIS_REST_URL
 *   and UPSTASH_REDIS_REST_TOKEN are set. Nothing to install: plain fetch.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Store {
  readonly kind: 'files' | 'upstash';
  load(name: string): Promise<string | null>;
  save(name: string, data: string): Promise<void>;
}

class FileStore implements Store {
  readonly kind = 'files' as const;
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  private file(name: string) {
    return path.join(this.dir, `${name}.json`);
  }
  async load(name: string) {
    try {
      return fs.readFileSync(this.file(name), 'utf8');
    } catch {
      return null;
    }
  }
  async save(name: string, data: string) {
    const f = this.file(name);
    fs.writeFileSync(f + '.tmp', data);
    fs.renameSync(f + '.tmp', f);
  }
}

class UpstashStore implements Store {
  readonly kind = 'upstash' as const;
  constructor(
    private url: string,
    private token: string,
    private prefix = 'pz:'
  ) {
    this.url = url.replace(/\/+$/, '');
  }
  async load(name: string) {
    const res = await fetch(`${this.url}/get/${encodeURIComponent(this.prefix + name)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Upstash GET ${name}: HTTP ${res.status}`);
    const body = (await res.json()) as { result: string | null };
    return body.result ?? null;
  }
  async save(name: string, data: string) {
    const res = await fetch(`${this.url}/set/${encodeURIComponent(this.prefix + name)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: data,
    });
    if (!res.ok) throw new Error(`Upstash SET ${name}: HTTP ${res.status}`);
  }
}

export const makeStore = (dataDir: string): Store => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashStore(url, token);
  return new FileStore(dataDir);
};

/**
 * Debounced writer: many changes in a row → one save. `flush()` writes now
 * (used when the host stops the server, e.g. before it goes to sleep).
 */
export const debouncedSaver = (store: Store, name: string, serialize: () => string, delayMs: number) => {
  let timer: NodeJS.Timeout | null = null;
  let pending = false;
  const write = async () => {
    timer = null;
    if (!pending) return;
    pending = false;
    try {
      await store.save(name, serialize());
    } catch (e) {
      console.error(`[storage] échec de sauvegarde « ${name} » :`, (e as Error).message);
      pending = true; // try again on the next change / flush
    }
  };
  return {
    save() {
      pending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, delayMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      await write();
    },
  };
};
