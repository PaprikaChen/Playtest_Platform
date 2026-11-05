# 0001: Local SQLite + files for the alpha, Supabase later

- **Status:** accepted (2026-11-04)
- **Context:** The spec targets Supabase. The alpha was due in about a day, and neither of us had a Supabase project or keys yet.
- **Decision:** Use Node's built-in `node:sqlite` (no native deps) and local files under `./data`. The table and column names
  mirror the planned Supabase schema, and every query lives in `src/lib/repo.ts`, so the migration touches one module.
- **Consequences:** zero-config demo and fast tests (each test run gets a temp data dir). There's no multi-user auth and no
  hosted deploy yet; those are tracked as #18 and #19.
