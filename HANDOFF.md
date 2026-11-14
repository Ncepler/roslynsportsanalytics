# Handoff: Roslyn Film Analyzer

For the next person who looks after this site. The first half needs no coding. The second half is for whoever edits the code. Never put a password, key or recovery code in this file or in the code; the places to keep them are listed below.

## What it is

A private website for the Roslyn High School sports analytics club. A member picks a team and a game, uploads the game video, and an AI (Google Gemini) watches it and writes a log of what happened, one row per possession. A member checks and fixes the log, then saves it. The site keeps the saved logs, works out the tables and season trends from them, and shows them to the club. The video itself is never kept.

Live pages: a team picker, then for each team **Schedule**, **Analyze a game** and **Season trends**. Admins also get an **Admin** page. **Data & privacy** (in the menu) explains in plain words what is stored.

## Who can do what

| Sign-in | Password | Can do |
|---|---|---|
| Demo | The "Test" button, when `TEST_LOGIN_ROLE` is unset | Only a practice walkthrough with made-up data. Cannot see real data or use the AI. |
| Member | The club password | See every team, analyze games, save and fix games. |
| Admin | A separate admin password | Everything a member can, plus the Admin page: teams, seasons, schedules, data download. |

There is also a private "owner test" on the Admin page, opened with a secret code. It runs the AI on any video for testing, saves nothing, and counts toward nothing.

## Accounts and who should own them

Everything below should belong to a **club account** (a club-named email), with the people who help invited as members. Nothing important should live only in one student's personal account, because students graduate.

| Service | What it does | Where | Who should own it |
|---|---|---|---|
| Club email | Owns all the accounts below | (the club's email provider) | The advisor, with officers added as recovery contacts |
| Supabase | The database (teams, schedules, saved game logs) | supabase.com, club project | Club account; members invited. **Already set up this way.** |
| Vercel | Hosts the website; holds the secret settings | vercel.com | Club account (move it from a personal account when ready) |
| GitHub | Holds the code | github.com | Club account or organization (move it from a personal account when ready) |
| Google AI Studio | Gemini, the only AI the site uses: it watches video and writes the Season summary. Billing lives here. | aistudio.google.com | Club account for the key; see "Gemini billing" |
| Hudl | Where the school's game footage is. The app never touches Hudl. A coach or athletic director downloads games and shares the files. | hudl.com | The school |

**Where the club email's recovery and 2-step sign-in details are kept:** _(fill this in: for example "in the advisor's school password manager, and printed in the sealed envelope in room ___". Do not write the codes here.)_

## Secret settings (environment variables)

These are set in two places: your own computer (a file called `.env.local`, never shared or uploaded) and Vercel (Project → Settings → Environment Variables). After changing anything in Vercel you must redeploy (Deployments → the latest one → Redeploy), or nothing changes.

| Name | What it is | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Address of the database | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The database key the website uses. **Paste Supabase's "Secret" key here** (newer projects show only a Publishable and a Secret key; the Publishable one is not used and must not go here). Very powerful; never share it. | Supabase → Project Settings → API Keys → Secret |
| `CLUB_PASSWORD` | The member password | You choose it |
| `ADMIN_PASSWORD` | The admin password (must differ from the club password) | You choose it |
| `SESSION_SECRET` | Random text that makes sign-ins tamper-proof (32+ characters) | Any password generator, or `openssl rand -base64 32` |
| `GEMINI_API_KEY` | Lets the site use Gemini (video analysis and the Season summary) | aistudio.google.com/apikey |
| `GEMINI_MODEL` | Which Gemini model to use (for everything) | Google's model list |
| `GEMINI_TIER` | `free` or `paid`. `free` shows a banner "don't upload student footage". Switch to `paid` only once billing is set up. | You set it |
| `ALLOW_TEST_LOGIN` | `true` shows the Test button, which signs anyone in without a password (as the role in `TEST_LOGIN_ROLE`). Use it only until the real passwords are set, then set it to `false`. | You set it |
| `ADMIN_BYPASS_CODE` | Secret code for the owner test. Leave empty to turn that feature off. | You choose it |
| `BLOB_READ_WRITE_TOKEN` (or `BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY`) | Added by Vercel when you connect a Blob store. Used only for the few minutes a video is handed to Gemini. | Vercel → Storage |
| `TEST_LOGIN_ROLE` | Which sign-in the Test button gives: `admin`, `member` or `demo` (unset = demo). While it is `admin`, anyone with the website address is an admin. Remove it once the real passwords are set. | You set it |

## Everyday tasks (no coding)

**Add a team.** Admin → Teams → pick gender, level and sport → Add team. A duplicate is refused. To retire a team, press Archive (data is kept; Restore brings it back).

**Add a season.** Admin → Seasons → label like `2026-27`, start and end dates → tick "Make current" → Add season. Exactly one season is current.

**Add a game to the schedule.** Admin → Schedule → choose the team and season → date, opponent, home or away, optional location → Add game. If the opponent is new, choose "Add a new opponent…". A game's date must fall inside its season.

**Analyze a game.** Team → Analyze a game → pick the game (or add one that isn't on the schedule) → upload the video → trim → check who is playing → Analyze → review → Save game. To fix a saved game later, open it from "Already analyzed" on the same page.

**Change a password.** In Vercel, edit `CLUB_PASSWORD` or `ADMIN_PASSWORD`, then redeploy. People already signed in stay signed in until their sign-in expires (7 days). To sign everyone out immediately, also change `SESSION_SECRET`.

**Download all the data.** Admin → Export all data → Download JSON. Do this before any big change, and a few times a year. Keep the file private.

**Where Gemini billing lives.** Billing is attached to the Google project that owns the API key (aistudio.google.com → Billing). It is prepaid credit: when it runs out, analysis stops with a "credits are used up" message. Today the credit is paid personally by the student who built the site, not by the club or school. Decide who pays before that student graduates, then move the key and billing to the club's Google account.

**Free Supabase projects can pause.** On the free plan, Supabase can pause a project after a period of no use (about a week at the time of writing; check their current terms). If the site says the database can't be reached, open the Supabase dashboard and press Restore on the project. The data is kept. Upgrading to a paid plan prevents pausing.

**Privacy.** The video is never kept. The database holds team names, schedules, and per-possession logs with jersey numbers only: no student names, faces, or appearance notes. Before real use, ask the district's data protection officer whether New York Education Law 2-d applies (the Data & privacy page says the app makes no compliance claim).

## For whoever edits the code

Next.js (App Router) + TypeScript + Tailwind, hosted on Vercel, database on Supabase. `CLAUDE.md` in the code folder is the full set of decisions and rules; read it first. Run it locally with `npm install` then `npm run dev`; check a change with `npx tsc --noEmit`, `npx eslint .` and `npm run build`.

**Database changes.** All SQL is in `supabase/migrations/`, numbered. To change the database, write a new numbered file (never edit an old one), then paste it into the Supabase SQL editor (club project → SQL Editor) and run it. The first two are already part of the project: `0001_init.sql` (tables) and `0002_save_game.sql` (the save function). If you set up a new Supabase project, run them in order.

**Add a sport to the team list.** Edit `lib/teams/options.ts` (add one line to `SPORTS`). Every dropdown and check reads that file, and no database change is needed. The new sport gets teams and schedules; its Analyze tab says "Stats for this sport aren't set up yet" until it has stats.

**Give a sport stats.** Create `lib/sports/<sport>.ts` (copy `basketball.ts` or `lacrosse.ts`), register it in `lib/sports/index.ts`, and add the sport's value to `SPORTS_WITH_STATS` in `lib/teams/options.ts`. You will also need a prompt, derivations in `lib/derive/`, and sheet layouts in `lib/sheets/`.

**Add a stat to basketball or lacrosse.** Add one entry to that sport's config in `lib/sports/` (id, label, tier, what to tell the AI, which pass logs it, whether it is on by default). If it needs math, add the function in `lib/derive/` and, if it should appear in a sheet, in `lib/sheets/`. Totals and percentages are always calculated in code and never stored.

**Roles and passwords** are checked in `proxy.ts` (who may open which page) and again inside each API route (`lib/api.ts`). Roles live in the signed sign-in cookie (`lib/auth/session.ts`).

**Where things live.** `app/(app)/t/[slug]/` team pages · `app/(app)/admin/` and `app/api/admin/` admin · `app/api/games/save` and `.../[id]/log` saving and re-opening · `lib/db/` all database code (server only) · `lib/season/` Season math · `components/analyze/` the analysis screens · `components/nav/` the menu and tabs · `/test` is a simulation that never writes anything.

## Known gaps (as of the last session)

- Nothing has been tested against the real Supabase project, the real Gemini API on a real game video, or a real Vercel Blob store. Everything was tested against stand-ins, and the SQL was tested on a real Postgres engine.
- Two people can analyze the same game at the same time (there is no lock). Saving over an already analyzed game asks for confirmation.
- Stored data never expires automatically; an admin deletes games by hand.
- The Roslyn-only video check (the AI must see "Roslyn" on screen) has not been tried on real game footage and may wrongly reject some games.
- Lacrosse efficiency formulas, a few stat definitions, and the open questions in `CLAUDE.md` section 18 still need the club's answers.
