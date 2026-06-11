-- Paper Swiper schema (Supabase / Postgres).
--
-- The only mutable state is your swipe decisions. The papers corpus itself ships
-- with the app as read-only JSON (data/<id>/papers.json), so there is no papers
-- table here. Run this once in the Supabase dashboard: SQL Editor -> New query ->
-- paste -> Run.

create table if not exists decisions (
  conference  text        not null,
  paper_id    text        not null,
  decision    text        not null check (decision in ('like', 'dislike', 'skip')),
  decided_at  timestamptz not null default now(),
  seq         bigint      not null,                 -- monotonic per conference, for "undo last"
  note        text        not null default '',
  read        boolean     not null default false,   -- have you read this paper yet?
  read_at     timestamptz,
  primary key (conference, paper_id)
);

create index if not exists idx_decisions_seq on decisions (conference, seq);

-- The app talks to Postgres only through the service-role key (server-side),
-- which bypasses RLS. Enable RLS with no policies so the public anon key can
-- never read or write this table by accident.
alter table decisions enable row level security;
