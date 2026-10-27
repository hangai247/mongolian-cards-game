import { mkdir, copyFile } from 'node:fs/promises';

// Practice and online controls use the same compiled hand/set rules as the server.
const root = new URL('../', import.meta.url);
await mkdir(new URL('sites/eight-gar/dist/rules/', root), { recursive: true });
await Promise.all(['engine', 'strategy', 'signals'].map(name => copyFile(
  new URL(`dist/${name}.js`, root), new URL(`sites/eight-gar/dist/rules/${name}.js`, root),
)));
