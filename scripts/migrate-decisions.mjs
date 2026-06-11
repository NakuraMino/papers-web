// One-time migration: push your existing swipe decisions (exported from the old
// local SQLite db to data/decisions-export.json) up into Supabase.
//
//   npm run migrate
//
// Idempotent: re-running upserts the same rows, so it's safe to run twice.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from '../server/supabase.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const file = join(HERE, '..', 'data', 'decisions-export.json');

if (!existsSync(file)) {
  console.log(`No ${file} found — nothing to migrate. (That's fine if you have no prior decisions.)`);
  process.exit(0);
}

const rows = JSON.parse(readFileSync(file, 'utf8'));
console.log(`Migrating ${rows.length} decisions to Supabase...`);

const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
  const batch = rows.slice(i, i + CHUNK);
  const { error } = await supabase.from('decisions').upsert(batch, { onConflict: 'conference,paper_id' });
  if (error) {
    console.error('FAILED:', error.message);
    process.exit(1);
  }
  console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
}
console.log('Done. Your swipes are now in Supabase.');
