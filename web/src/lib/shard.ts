// Splits large data files into SHARDS small ones by id (see scripts/derive-data.mjs).
// Safe to import from client components.

export const SHARDS = 64; // keep in sync with scripts/derive-data.mjs

export const shardOf = (id: string) => {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return h % SHARDS;
};
