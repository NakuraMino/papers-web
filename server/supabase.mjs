// Supabase client. Your swipe decisions are the only mutable state, and they
// live in Supabase (free Postgres) so they persist across Vercel's stateless
// serverless invocations. The papers corpus itself ships with the app as
// read-only JSON (see db.mjs), so it never touches the database.
//
// Credentials come from the environment:
//   - locally:  node --env-file=.env.local ...   (see .env.local.example)
//   - on Vercel: Project Settings -> Environment Variables
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
      'Locally: copy .env.local.example to .env.local and fill them in. ' +
      'On Vercel: add them under Project Settings -> Environment Variables.',
  );
}

// Service-role key: server-side only, bypasses Row Level Security. Never ship
// this key to the browser (the frontend only ever calls our own /api routes).
//
// We never use Supabase Realtime, but createClient initializes a realtime client
// eagerly, which throws on Node < 22 (no native WebSocket). Handing it `ws` as the
// transport sidesteps that and keeps the app working on Node 20 and 22 alike.
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
