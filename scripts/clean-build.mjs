import { rm } from 'node:fs/promises';

// Incremental compilation otherwise retains deleted/renamed modules in published tarballs.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
