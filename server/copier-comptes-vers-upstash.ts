/// <reference types="node" />
/**
 * Copies the accounts and the leaderboard of THIS PC (server/data) into your
 * Upstash database, so the players keep their coins / achievements online.
 *
 *   set UPSTASH_REDIS_REST_URL=https://....upstash.io
 *   set UPSTASH_REDIS_REST_TOKEN=....
 *   npx tsx server/copier-comptes-vers-upstash.ts
 *
 * It refuses to overwrite accounts already online (add --forcer to do it anyway).
 */
import path from 'node:path';
import fs from 'node:fs';
import { makeStore } from './storage.ts';

const dir = process.env.PZ_DATA_DIR || path.join(process.cwd(), 'server', 'data');
const store = makeStore(dir);
if (store.kind !== 'upstash') {
  console.error('Il manque UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN (page de ta base Upstash, section REST API).');
  process.exit(1);
}
const force = process.argv.includes('--forcer');
for (const name of ['users', 'leaderboard']) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.log(`- ${name} : aucun fichier sur ce PC, rien à copier`);
    continue;
  }
  const local = fs.readFileSync(file, 'utf8');
  const online = await store.load(name);
  if (online && !force) {
    console.log(`- ${name} : il y a déjà des données en ligne, je n'écrase pas (relance avec --forcer pour remplacer)`);
    continue;
  }
  await store.save(name, JSON.stringify(JSON.parse(local)));
  const n = name === 'users' ? (JSON.parse(local) as unknown[]).length : Object.keys(JSON.parse(local)).length;
  console.log(`- ${name} : copié (${n} ${name === 'users' ? 'comptes' : 'classements'})`);
}
console.log('Terminé.');
