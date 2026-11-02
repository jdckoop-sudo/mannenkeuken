# Instructions for Claude (both Jelle's and Tinus's)

This repo is the Mannenkeuken guild dashboard. Read README.md first.

- Site copy is in **English**. Talk to Jelle/Tinus in **Dutch**.
- Plain static HTML/CSS/JS served by GitHub Pages. No frameworks, no build step, no npm.
  Supabase is loaded from `https://esm.sh/@supabase/supabase-js@2` as an ES module.
- Every page: `<link rel="stylesheet" href="css/style.css">` and a module script that calls `renderHeader()` from `js/layout.js`. New page → add it to the `pages` list in `js/layout.js`.
- Escape all user/sheet text with `esc()` from `js/sheet.js` before putting it in HTML.
- Database changes: edit `supabase/schema.sql` (idempotent: `if not exists`, drop/create policies) and tell the user to run it in the Supabase SQL Editor. Keep Row Level Security on every table: read for all, write only own rows (`user_id = auth.uid()`).
- Never commit secrets (service_role key, Discord Client Secret). The anon key in `js/config.js` is fine.
- Work on a branch (`jelle/...` or `tinus/...`) and open a pull request. Never push to `main` directly.
- Keep the look simple (wireframe style) until the final design is agreed.
