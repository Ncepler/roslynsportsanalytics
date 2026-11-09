# Club Film Analyzer — CLAUDE.md

Read this whole file before doing anything. It holds every decision made so far for this project. If Noah asks something that is answered here, answer from here. When Noah makes a new decision (new stat, new sport, new rule), update the matching section of this file in the same session.

**Status:** live on Vercel. Everything in sections 5–13 is built: basketball and lacrosse Analyze (upload, trim, setup, multi-pass Gemini analysis, scoreboard readability check, derivations, plus/minus and minutes, review, export, segmenting, appearance notes) and the real **Season trends** tab (spreadsheet parsing, trends, verified Claude summary, XLSX). **Not yet tested against the real APIs:** Gemini (needs the key and a test clip) and Claude (needs `ANTHROPIC_API_KEY`); both are tested against fakes. Start each new phase in plan mode.

**Reminder for Noah (do this when setting up the real password):** the club password will be the club's Google Classroom password. Set it as `CLUB_PASSWORD` in Vercel, set `ALLOW_TEST_LOGIN=false`, remove the Test button, and redeploy. Never write the password itself into this file or the code.

---

## 1. What this is

A password-protected website for Noah's school sports analytics club (Roslyn High School, Roslyn Heights, NY). A member uploads a full game video, says which sport it is and what the teams look like, ticks which stats to track, and presses Analyze. An AI watches the video and logs what happened. The app turns that log into tables that match the club's existing Google Sheets, so members copy and paste the results into each game's tab instead of tracking by hand.

A second tab ("Season") takes the club's finished spreadsheets across many games and finds real, checkable trends, with graphs only where they mean something.

Background: last year the club tracked basketball shots vs makes by context (fast break, vs man, vs zone) by hand. The club also tracks lacrosse. Noah is the builder and a club member. The club has many manual sheets (one per stat type, one tab per game). This app replaces the manual tracking, and Noah wants more stats than the manual sheets had because the AI makes extra stats cheap.

## 2. How Noah likes to work

- Keep explanations condensed and simple by default. Fewer sections, less detail. Expand only when asked.
- Give honest, calibrated assessments. No sugarcoating, no manufactured flaws. If an idea is good, say so plainly. If it is flawed, explain exactly how and why.
- For big outputs, lay out what you will produce first and wait for approval before writing it.
- Noah uses Claude Code in the Claude desktop app on a MacBook, not VS Code.
- When you are unsure about club conventions (how a stat is counted), ask Noah. Do not guess.

## 3. Hard rules (never break these)

1. **No made-up data.** If the AI cannot see or read something, it returns `null` / `unknown` and flags it. Omission beats a guess. Never fill a gap with a plausible number.
2. **AI logs events. Code does all the math.** The AI never adds, averages, or totals. Every total, efficiency, percentage, correlation, and graph value comes from code run on the logged rows.
3. **No video storage.** Videos go from the browser straight to Gemini, get analyzed, and are deleted from Gemini right after. Nothing is stored on Vercel, in a database, or in logs. No database at all in v1.
4. **No persistent face data.** Appearance notes ("#5, white jersey, headband") live only for one run and are discarded. Never build a face-recognition store or send reference photos. The footage includes high school students (minors).
5. **No scraping or ripping Hudl.** See section 15.
6. **API keys are server-only.** Never expose them to the browser. Never commit them. Use `.env.local` and Vercel env vars, and add `.env*` to `.gitignore`.
7. **Every page and every API route sits behind the password gate** (section 12). Protecting only the page is not enough.
8. **The Season tab's AI never produces numbers.** It may suggest what to test and write plain-English summaries, but only from numbers the code computed.
9. **Roslyn games only, no bypass (Noah, Nov 9).** Before any expensive request, a short check (`lib/gemini/gate.ts`) looks at three ~20 s clips (start, middle, end of the trimmed game, High detail, about 1–2 cents). It must see the chosen sport as an organized game and read "Roslyn" (or "ROS" as a scoreboard team label) somewhere; jersey colors alone don't count. The pass/fail rule is in code, and the prompt holds no user-typed text. On a fail the video is deleted from Gemini, nothing else runs, and the screen offers only "Back to setup" / "Choose a different video". The server signs a pass (HMAC, 6 h) for that file, sport, and time range, and `/api/gemini/analyze` returns 403 without it. Never add a bypass button or override.
   **Owner unlock (Noah, Nov 9, replaces "no bypass"):** on the upload screen only, typing the 10-digit code (env var `ADMIN_BYPASS_CODE`, set in Vercel; never written in code or this file) shows a ✅ for one second. The server then skips the AI look and signs the same pass for that file, sport, and range. No textbox or button anywhere; unset env var = feature off; wrong codes are rate-limited and look like nothing happened. Still never add a visible bypass for members.

## 4. Stack

- Next.js (App Router) + TypeScript, Tailwind, deployed on Vercel. This is Noah's usual stack.
- No Supabase and no database in v1. (Noah's other projects use Supabase; this one does not need it because nothing is stored.)
- **Gemini API** (`@google/genai` SDK) for watching video.
- **Claude API** (Anthropic SDK) for the Season tab's hypotheses and write-ups. Verify current model names in the docs before hardcoding (as of this writing: `claude-sonnet-5-5` is a reasonable default). Put model names in env vars.
- Env vars (all server-side): `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIER` (`free` or `paid`), `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLUB_PASSWORD`, `ALLOW_TEST_LOGIN`, `SESSION_SECRET`.
- **Built so far (phase 1):** Next 16 + Tailwind 4. Next 16 renamed middleware to `proxy.ts` (runs on Node); it gates every page and API route. Tailwind 4 has no config file, so all design tokens live in `app/globals.css` (one accent: change `--accent-hue`). Session cookie code is in `lib/auth/`. Routes: `/` is Analyze a game, `/season` is Season trends, `/login`. Cache Components is on, so env-driven UI (Test button, free-tier banner) is fixed at build time; the login API still checks `ALLOW_TEST_LOGIN` on every request. Changing env vars on Vercel needs a redeploy.
- Suggested layout (adjust as needed): `/lib/sports/basketball.ts`, `/lib/sports/lacrosse.ts` (sport configs), `/lib/gemini/` (upload, prompts, schemas, segmenting), `/lib/derive/` (all math), `/lib/sheets/` (layouts, copy/CSV export, Season parsing), `/lib/season/`, `/components/`.

## 5. User flow (Analyze a game tab)

The app has two top-level tabs: **Analyze a game** and **Season trends**.

1. **Upload.** The user picks a video file. A local preview plays immediately from the user's own computer (object URL). Nothing waits on the upload.
2. **Trim.** While the file uploads to Gemini in the background, the user drags a start marker and an end marker to cut off junk before and after the game (people arriving, warmups, people leaving). Optional extras: mark halftime and timeouts to skip them, and mark tip-off to help the scoreboard sync. A typed start/end time fallback is required, because some Hudl exports use codecs the browser cannot preview (H.264 mp4 is fine; HEVC may not play).
3. **Setup.** Fields, in this order:
   - Sport (basketball or lacrosse)
   - Roslyn's jersey color (plain text, e.g. "white", "navy")
   - Away team name
   - Away team's jersey color (plain text)
   - Optional roster: jersey numbers for each team
   - Stats checklist (changes by sport; grouped by tier, section 8; "Experimental" group collapsed and unchecked by default)
   Roslyn is always the home/our team, so never ask for the school name.
   **Built (Noah's Nov 8 feedback):** the step is titled "Who's playing?" with no explanatory subtitle. Sport is two buttons. Roslyn's jersey color is a **Blue** button, a **White** button, or **Other** (type it), because it is almost always blue or white. Opponent name and their color are text boxes. Rosters sit under "Add jersey numbers (optional)".
   **Trim extras (built):** a "Skip halftime and timeouts" section with two buttons: "Break starts here", then "Game resumes here" (from the video playhead), plus typed times as a fallback. The tip-off mark was dropped: the start handle already marks where the game begins.
   **Noah's Nov 8 rules (built):** playback is locked to the trimmed game on both the Trim and Review steps: nothing before the start or after the end can be watched (dragging a handle shows that frame), and on Review skipped breaks are jumped over. A break must sit inside the trimmed game, end after it starts (never negative), last at least 5 seconds, and not overlap another; a marked break start shows as an orange line on the slider, and finished breaks show hatched with orange edges. The detail choice is worded for non-experts: "Standard (recommended): like watching on a phone" vs "High detail: like watching on a big TV".
4. **Analyze button.** Shows an estimate before starting (time and approximate cost), then stages while running (section 6). Shows "about X min remaining" labeled clearly as an estimate.
5. **Review.** Editable tables styled like the club's sheets. The possession log shows the first 5 possessions, then a "Show all N possessions" button. Clicking a row jumps the video to that moment. Each row shows a "needs review" flag where confidence is low. The user fixes mistakes here.
6. **Export.** "Copy for Google Sheets" button (tab-separated, pastes straight into cells) and CSV/XLSX download, one per sheet layout (section 10). Direct writing into Google Sheets via a service account is a later phase, not v1.

## 6. Video pipeline

**Upload without storing.** Vercel rejects request bodies over about 4.5 MB, so the video cannot pass through the server. The server starts a Gemini Files API resumable upload session and hands the upload URL to the browser, which uploads straight to Google. The API key never reaches the browser. **Browser-direct upload failed in real use (CORS, Nov 9).** Now built as a relay: the server opens the session and the browser sends 4 MiB pieces through `/api/gemini/chunk`, which forwards each to Google and stores nothing. Untested on large files (Google may need chunk sizes of a certain multiple). Make it the first spike (section 17). Fallbacks if it fails: a Vercel Blob client upload that is deleted right after analysis, or a local-only mode. Files uploaded to Gemini auto-delete after 48 hours; delete them explicitly as soon as the run finishes.

**Analysis.**
1. Optional scoreboard check: sample a frame and confirm the quarter, clock, and score digits are readable at the chosen resolution. Warn if not. **Built** into the starters request (no extra cost); the starters screen warns and suggests High detail.
2. **Appearance-notes pass:** one quick request on the start of the game produces notes like "#5 white, headband, tallest." It asks for **every starter: 5 per team in basketball and 10 per team in lacrosse** (`playersPerSide` in the sport config). Show them to the user to correct, with a notice that they will check again at the end. During the possession-log passes the AI reports `playerNoteUpdates` (substitutes coming in, numbers it can now read); the Review page shows the starters plus these updates under "Check the player notes". Pass the corrected notes as plain text into every later request (Gemini remembers nothing between requests). Discard after the run.
3. **Possession-log pass(es):** ask Gemini for structured JSON (response schema, low temperature). Group stats into 2–3 passes (for example: shots and possessions; then turnovers, fouls, and rebounds; then experimental stats) because one huge checklist in one request lowers accuracy. **Built:** each logged stat has a `pass` in the sport config. Pass 1 = possessions, shots, context, shot details; pass 2 = turnovers, fouls, rebounds, assists, steals, blocks; pass 3 = substitutions (plus/minus, minutes). Passes 2–3 receive pass 1's numbered possession list and return events tagged with a possession number; code attaches them (by number, else by video time, else dropped with a warning). Only passes with checked stats run; the estimate multiplies cost by the number of passes.
4. Each logged event includes: video timestamp, game clock and quarter (read from the scoreboard), and a one-line description of what was seen. This lets a human verify it and lets the click-to-jump work.
5. **Long games:** use the video part's `start_offset` / `end_offset` (static processing mode) to run 3–4 requests in parallel by quarter or half on the one uploaded file. Do not cut or re-upload files. Overlap segments by about 30 seconds and dedupe by quarter + game clock (fall back to video timestamp). Segment timestamps are relative to the original file, so keep them that way, and add the segment start back if the API reports times relative to the clip. Pass the appearance notes into every segment.
6. **Scoreboard check:** sum the logged points per quarter and compare to the scoreboard score. A mismatch flags that quarter for review instead of silently filling the sheets. This is the main accuracy safeguard. Show it prominently.
7. Run long jobs with Gemini background execution or streaming, and poll from the client every few seconds. Do not hold one Vercel function open for the whole analysis.
8. **No database means job state lives in the browser tab** (interaction IDs, file URIs, partial results). If the tab closes mid-run, the user reruns (it costs cents). Say so in the UI.

**Progress and time estimates.** Gemini does not report real progress. Stages shown: Uploading, Processing, Checking it's a Roslyn game, Reading the game (appearance notes), Logging possessions ("3 of 4 sections done" is real progress when segmenting), Checking totals, Building tables. The ETA is an estimate from video length and from how long past runs took (calibrate with `localStorage`). Label it "estimate" on screen. The estimate for time and cost also updates live as the user drags the trim markers, using `count_tokens` where possible.

**Cost guard.** Show the estimated cost before the run. Enforce a maximum video duration per run (2 hours). **Noah decided (Nov 8): no cost-confirm checkbox on the real page** (students using it don't manage costs); the checkbox appears only on the `/test` simulation, to show the feature.

## 7. Data model: the possession log is the source of truth

Every basketball sheet the club uses is a summary of one thing: a log with one row per possession. So Gemini produces only the possession log (for **both teams**, because opponent scoring is needed for the scoreboard check and plus/minus), and code derives every table and every sheet from it.

Sketch (adjust as needed):

```ts
type PossessionRow = {
  id: number
  team: 'roslyn' | 'opponent'
  quarter: 1 | 2 | 3 | 4 | 'OT'
  clockStart: string | null   // from scoreboard, e.g. "5:42"
  clockEnd: string | null
  videoStart: number          // seconds in original file
  videoEnd: number
  context: 'M' | 'Z' | 'F' | null   // vs man, vs zone, fast break
  events: Event[]             // shots, rebounds, assists, steals, blocks, turnovers, fouls
  points: number | null       // derived in code, not logged
  shooter: string | null      // jersey number, or null if unreadable
  confidence: 'high' | 'medium' | 'low'
  needsReview: boolean
  note: string | null
}
```

**Possession context:** `M` = against man defense, `Z` = against zone, `F` = fast break (no set defense). One per possession, mutually exclusive. Noah confirmed F means fast break, in basketball and lacrosse.

**Possession definition:** the standard basketball definition (starts when a team gains control, ends on a made basket, turnover, defensive rebound, or end of period). **Noah confirmed: an offensive rebound continues the same possession (same row).**

## 8. Sport config system and tiers

Each sport lives in one config file. Adding a stat or a sport must be one entry, not a rewrite. **Noah will add stats later.** Design for that from day one.

Each stat entry holds: `id`, `label`, `tier`, `description` (the wording given to Gemini), `source` (`logged` by AI or `derived` in code), the derivation function if derived, which sheet layouts and columns it feeds, and whether it is checked by default.

Adding a stat should automatically: add it to the checklist, to Gemini's JSON schema and prompt, to the derivation step, and to the matching sheet layout. Adding a sport = a new config file plus registering it.

**When Noah says "add stat X," do this:** add the entry to the sport config, add a derivation if needed, add it to the right sheet layout, run the type checker, test on a saved sample result, and update section 9 of this file.

**Tiers (shown as groups in the checklist).** Internal ids stay `reliable` / `decent` / `experimental`; the labels students see (renamed Nov 8) are group titles for how much to trust each kind of stat:
- **Reliable**: "The AI gets these right almost every time." (checked by default)
- **Double-check**: "Usually right. Look them over before copying." (checked by default)
- **Long shots**: "Often wrong. Off unless you turn them on." (unchecked, collapsed)

## 9. Stats catalog

### Basketball (v1 priority)

The tiers below are my best guesses, **untested**. Test them on real footage and adjust the tiers from the results.

- **Reliable, AI-logged:** shot attempts and makes (2PT, 3PT, FT), possession context (M/Z/F), turnovers, fouls, quarter and clock (from scoreboard).
- **Reliable, derived in code:** points (formula in section 10), offensive efficiency, points per possession, pace (possessions per quarter), score by quarter, scoreboard check, second-chance points, points off turnovers, fast-break points, team totals, turnovers and fouls by quarter.
- **Decent, AI-logged (needs review):** turnover type (steal, bad pass, travel, and so on), steals, offensive and defensive rebounds, assists, blocks, shot type (drive, catch-and-shoot, pull-up), shot zone (paint, mid-range, corner 3, above-the-break 3), shooter jersey number.
- **Experimental:** exact possession time (video is sampled about once per second, so expect plus or minus 1–2 seconds), contested vs open shots, per-player plus/minus for the starting five (needs on-court tracking and jersey reading all game), minutes on court. **Plus/minus and minutes are built** (`lib/derive/plus-minus.ts`): pass 3 logs substitutions, the starters screen has editable starter-number boxes, Total = sum of quarters, OT shows N/A when there was none, and minutes come from the game clock (blank when under 80% of possessions have clock readings).
- **Easy derived adds not yet requested (my suggestions):** FG%, 3P%, FT%, effective FG%, turnover rate. Offer these to Noah.

### Lacrosse (second priority)

v1 = the two sheets Noah showed (section 10): turnovers by quarter for both teams, and defensive possessions by M/Z/F with Goal / No Goal results and efficiency. **Built** in `lib/sports/lacrosse.ts` (logged: shots and goals, turnovers, defense type; derived: score by quarter, scoreboard check, turnovers by quarter, Roslyn defense by M/Z/F, possessions by quarter). The Efficiency and Total Efficiency columns are left blank until Noah confirms the formula. Ask Noah what else he wants before adding stats. Lacrosse is harder than basketball for AI (small ball, wide field, many players), so expect more corrections.

**Lacrosse turnover idea (a hypothesis, test it):** the ball is hard to see, but a turnover often shows up as play shifting from one end of the field to the other. The camera follows the ball and pans left and right, so "left side of the frame" is not a reliable cue. Use which goal the play is at, the teams' jersey colors, and the scoreboard instead.

## 10. The club's sheet layouts (from Noah's screenshots)

Format: Google Sheets. **One tab per game. Several separate spreadsheets, one per stat type.** The big M / Z / F letters are cosmetic formatting. Individual sheets carry a tracker's name in a header cell. **Leave tracker names out entirely** (never copy student names into code, config, or sample data).

**Formulas verified against the sample numbers:**
- **Total points** = 2 × (2PT made) + 3 × (3PT made) + (FT made). Matches all three context rows (39, 20, 10) and the team total (69).
- **Offensive efficiency** = total points ÷ total offensive possessions × 100. Example: 69 ÷ 72 × 100 = 95.8333, where possessions are 38 + 20 + 14 = 72.
- **Team totals** = column sums.
- **Lacrosse efficiency formulas: unknown** (cells were blank). Ask Noah. Do not invent one.

| Sheet | Layout |
| --- | --- |
| **Lacrosse turnovers** | Column A rows: Roslyn and the opponent (the sample uses "Port"). Columns: Q1, Q2, Q3, Q4, Total turnovers. |
| **Lacrosse defense** | Columns: Defensive Possession #, (M, Z, F), Possession Result (No Goal, Goal), Efficiency, Total Efficiency. Rows: M, Z, F. |
| **Basketball plus/minus** | Rows: the starting five by jersey number. Columns: Total +/-, Q1, Q2, Q3, Q4, OT (N/A when none). Experimental. |
| **Basketball offense summary** | Column A: possession counts per context (sample: 38, 20, 14). Column B: vs (M, Z, F). Then 2-Point FG (Att, Made), 3-Point FG (Att, Made), Free Throw (Att, Made), Rebounds (Off, Def), Assists, Steals, Blocks, Turnovers, Fouls, Total Points, Offensive Efficiency. Team Totals row at the bottom. |
| **Basketball possession log** | Header rows, then one row per possession (about 53 filled in the sample, space for about 75): Offensive Possession #, Time of possession (M:SS, values from 0:01 to 0:35 in the sample), 2PT, 3PT, FT, Rebounds, Assists, Steals, Blocks, Turnovers, Fouls, Total Points. "Team Totals" row below. The tab name is the opponent plus a number (sample: "St John the Baptist 121"). |
| **Roslyn offense template** | A blank, shorter template: rows M and Z only (no F), columns 2PT, 3PT, FT, Rebounds, Assists. |

**Quirks to handle:**
- The FT "Made" header is blank in two layouts; treat it as Made.
- In the plus/minus sample, Total +/- for one player does not equal the sum of its quarters (#23 reads 6, but 8 + 7 + 8 − 9 = 14; the other four rows add up). Compute Total as the sum of quarters, and ask Noah which is right.
- Tab names like "St John the Baptist 121": ask what the number means.
- The log rows hold a missed shot and a rebound together. Ask whose rebound the Off / Def columns count.

## 11. Export

- **Copy for Google Sheets:** one button per sheet layout. Tab-separated values on the clipboard, pasting straight into the matching cells. Keep numbers as numbers, and keep blanks blank (not 0) when nothing was logged.
- **Download:** CSV, and XLSX for the Season tab.
- **Later (not v1):** write directly into the club's Google Sheets through a Google service account that each sheet is shared with.

## 12. Auth

- One shared club password, checked on the server, which sets a signed `httpOnly` session cookie. Middleware blocks every page and every API route without that cookie.
- **Login screen:** a password box with a **Test** button next to it. For now, clicking Test acts as the password. Noah is not setting the real password up yet.
- Build it so the cookie and the middleware are real. Only the credential check is temporary. The Test button works only when `ALLOW_TEST_LOGIN=true`. When the real password comes later, set `CLUB_PASSWORD`, set `ALLOW_TEST_LOGIN=false`, and remove the button.
- **Risk to state to Noah (and in a code comment):** while Test is on, anyone who finds the URL gets in and can spend his API credits. Mitigations: keep the deployed URL private, turn on Vercel's Deployment Protection, use only the free key while Test is on, and turn the bypass off before putting a paid key in.
- Add basic rate limiting on API routes and validate file type and size.
- A shared password cannot kick out one person without changing it for everyone. This is a known tradeoff Noah accepted.

## 13. Season tab

**Input.** The user uploads the club's finished spreadsheets. Easiest path: in Google Sheets, File → Download → .xlsx (this includes every tab, and each tab is one game). Also accept CSV per tab, and pasted text. There are several different spreadsheets (one per stat type), so detect each tab's sheet type from its header cells, and show the user what was recognized and what was skipped. Join games across spreadsheets by tab name. The app's own exports must round-trip into this tab.

Be tolerant: merged cells, blank headers, cosmetic big letters, tracker-name cells (ignore them), blank rows.

**Rules.**
- **Code computes every number and draws every graph from the real rows.** Claude (the Anthropic API) may only suggest hypotheses to test ("do fast-break possessions go with higher efficiency?") and write plain-English summaries, and may only quote numbers that the code computed and passed to it. Check that every number in the AI's text appears in the computed data, and drop or flag any that do not.
- Show sample size and which games each finding used. With roughly 15–25 games, many apparent trends are noise. Require a minimum number of games before reporting a correlation, and say "not enough data" instead of forcing a trend.
- Show how many relationships were tested ("we tested 30 pairs; some strong-looking ones are likely chance at this sample size"). Do not cherry-pick.
- Say "goes together with," never "causes."
- **Graphs only where they are meaningful**, not for everything: correlations that pass the thresholds, and comparisons that matter (such as efficiency by M / Z / F). Each graph states n and the correlation strength.
- Use a lightweight chart library (pick one). **Decision:** hand-written SVG charts (`components/season/charts.tsx`), no library.

**Built (`/season`, shared with `/test`):** `lib/season/parse.ts` reads .xlsx (read-excel-file), CSV and pasted tabs in the browser and detects each sheet type from header words; `lib/season/model.ts` builds per-game numbers and tests every metric × outcome pair (≥10 games, |r| ≥ 0.5; pairs linked by arithmetic, like possessions vs efficiency, are excluded). The club's sheets have no opponent score, so the tab has **optional final-score boxes** that enable win/loss and margin trends. `/api/claude/season` sends only computed numbers (`CLAUDE_MODEL`, default `claude-sonnet-5-5`, refusal fallback on) and `lib/season/verify.ts` removes any sentence with a number not in that data. The app's CSV downloads are named `<Opponent> - <sheet-id>.csv` so they read back in as one game; opponent-view exports are skipped. XLSX download: games, by-situation, and pairs tested.

## 14. Privacy, safety, spend

- The footage shows high school students. Keep it private, temporary, and unlogged. Never log video content or appearance notes.
- **Free Gemini tier:** Google may use prompts and uploads to improve its products. Paid tier data is not used that way. So use free-tier testing only with footage that has no students in it (a pro game, a highlight, footage of Noah). When `GEMINI_TIER=free`, show a visible banner: "Free tier: don't upload student footage." Use the paid tier before any real school game.
- Gemini billing is now prepaid: link a billing account, buy credits (minimum about $5, verify), usage deducts from the balance, and requests fail with HTTP 402 when it hits $0. Keys inherit the project's billing. A leaked key can cost at most the loaded balance. Billing data lags about 10 minutes, so long jobs can overshoot slightly.
- Failed requests with 400 / 500 errors are not charged, but they count against quota.

## 15. Hudl rules

The school's footage is on its Hudl fan account (`fan.hudl.com`, Roslyn High School). A fan link is a web player page, not a video file.

- **Do not build anything that rips, scrapes, or screen-records Hudl streams.** It breaks Hudl's terms, the streams are often protected (and may record black), and it could get the school's account flagged.
- The app takes only uploaded video files.
- Legit sources: a coach or athletic director downloads games from the school's Hudl team account and shares the files; the club films games itself; or a Hudl shared link that offers an official download button (Noah downloads manually).
- Camera: the sample footage pans left and right and follows the ball. Noah does not know whether a person or an automatic camera runs it. All three sample videos show a scoreboard in the corner (use it, section 6).

## 16. Gemini facts (checked Nov 2026; recheck before hardcoding)

Verified from Google's docs (`ai.google.dev/gemini-api/docs/video-understanding`, updated Oct 2026):
- Input options: Files API (up to 20 GB paid / 2 GB free per Google's table; third-party sites say 2 GB per file, so treat 2 GB as the safe number until tested), Cloud Storage registration (2 GB per file), inline (under 100 MB), YouTube URLs.
- Files auto-delete after 48 hours.
- Default processing is "static": about 1 frame per second, plus audio. Custom `fps`, `start_offset`, `end_offset` are supported only in static mode. A `media_resolution` setting controls tokens per frame.
- Docs say: about 66 tokens per frame at low resolution (about 100 tokens per second of video including audio) and about 258 per frame at high resolution (about 300 per second).
- Models with a 1M context window handle up to about 3 hours of video at low resolution, or about 1 hour at high resolution.
- Newer "agentic" video mode exists: up to 88% fewer tokens on long videos, built for finding specific moments. Not recommended for exhaustively logging every possession. Use static mode.
- Use `background=True` or streaming for long requests. Synchronous long requests can time out with 401 or timeout errors.
- The docs use the Interactions API (`client.interactions.create`) with a video part like `{type:"video", uri, mime_type, processing:{type:"static", start_offset, end_offset, fps}}`. SDK shapes change often; follow the current docs, not this file, for exact syntax.

**Conflict to resolve with a real test:** the tokens-per-second figure. Google's tokens page (a snippet dated Oct 13, 2026) says 263 tokens per second of video, while the video page says about 100 at the default low resolution and about 300 at high resolution. The docs disagree, so do not trust either number. Run `count_tokens` on a test clip at each `media_resolution` setting and use the real numbers everywhere.

Unverified (pricing came from a Google AI summary Noah pasted; check `ai.google.dev/gemini-api/docs/pricing`): Gemini 3.8 / 3.6 Flash input about $0.75 per million tokens through Dec 31, 2026 and $1.50 after, output $3.75–$7.50; Gemini 3.5 Flash-Lite input $0.30, output $2.50; context caching cuts repeat input about 90% (the plan has one pass per game, so caching is not needed). Models named in the docs: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-4-argon`, `gemini-2.5-flash/pro`.

**Rough cost for a 90-minute game (estimate):** about 540K tokens if about 100 per second, up to about 1.4M if about 263–300 per second. At $0.30 per million: about $0.16–$0.43. At $0.75: about $0.40–$1.07. At $1.50: about $0.80–$2.13. So budget roughly $0.15–$2.50 per game. A 1.4M-token game does not fit in a 1M context, so segmenting or low resolution is required anyway.

**The central accuracy-vs-cost choice:** low resolution may make scoreboard digits and jersey numbers unreadable; high resolution costs about 3× more. Test both on the same clip, and consider a higher `fps` for fast action (cost scales linearly). A made basket or a steal is fast, so 1 fps can miss it.

## 17. Build phases and first tests

**Effort call:** this is not a Batch or multi-agent job. Use plan mode first and then work normally. Higher effort is worth it for the Gemini schema and prompt design (phase 1) and the Season sheet parsing (phase 6). It is not warranted elsewhere.

**Needed from Noah before real testing:** a short basketball clip (2–5 minutes) with no students in it, and a free Gemini API key from aistudio.google.com/apikey (goes in `.env.local`, never into chat).

1. **Scaffold + auth gate** (password box + Test button, protected routes, design tokens).
2. **Spike:** browser-direct upload to Gemini; print the real token count and time for a test clip; run the basketball possession log and print raw JSON. **Check accuracy by hand.** Also test low vs high resolution, and whether the scoreboard and jersey numbers read.
3. **Setup screen, trim, estimates, stage progress.**
4. **Derivations and tables** (all math in code), review table with click-to-jump, scoreboard check, Copy for Google Sheets and CSV.
5. **Segmenting + appearance notes + parallel runs** with overlap and dedupe.
6. **Lacrosse** (turnovers by quarter, defense M/Z/F).
7. **Season tab.**
8. **Polish, motion, deploy to Vercel.**

Acceptance check for each phase: run it on a real clip or sample, and show Noah the result, not just "tests pass."

## 18. Open questions to ask Noah (do not guess)

1. Lacrosse efficiency and Total Efficiency formulas. (Noah: leave blank for now; ask the club.)
2. ~~Whether an offensive rebound continues a possession~~ (answered: same row). Still open: whose rebounds the Off / Def columns count. Current code counts every rebound inside that row's possessions (Off = the offense's boards, Def = the defense's board that ended it).
3. What the number in tab names (like "…121") means.
4. Which total is right for the plus/minus mismatch (section 10).
5. Roster entry format; whether to log opponent possessions in the sheets or only for checks.
6. Whether time of possession is in seconds or M:SS. (Built as M:SS to match the sample.) Also open: in the possession-log sheet, are the 2PT / 3PT / FT cells makes, attempts, or points? Built as makes.
7. ~~Brand colors~~ (answered: none for now; keep the slate-blue accent).
8. The Roslyn-only check conflicts with section 14's free-tier rule (test only with non-student footage): a pro clip will always be rejected. So the first real test needs the paid tier and a real Roslyn game. Also unknown: how often real Roslyn footage shows readable "Roslyn" text (false rejections). Test on real games before relying on it.

## 19. Design

Follow the `apple-design`, `emil-kowalski-master` (design engineering and animation), and `animate` skills. Load them when you build UI. The summary below applies to this project.

**Feel:** a calm, precise analyst tool. Clear, fast, quiet. Not flashy.

**Structure and simplicity (Apple's principles):**
- Show the common path first: upload → sport → teams → Analyze. Put advanced options one level deeper (Experimental stats are collapsed).
- Wayfinding on every screen: where am I (two top tabs plus a step indicator in setup), what can I do next, how do I go back. Never trap the user.
- Direct, specific labels ("Analyze game," "Copy for Google Sheets"), not vague ones. Place each control next to what it affects.
- Feedback in four kinds: status (the stage list), completion, warning (scoreboard mismatch, free-tier banner), error. Validate inline.
- Forgiveness: easy to fix any AI mistake in the review table. Confirm only before genuinely irreversible or costly actions (the cost confirm).
- Typography: system font; size-specific tracking (tight and negative for large headings, near 0 for body); leading tighter on large text; spacing in `rem` so text scaling does not break layout; `tabular-nums` for all numbers, times, and ETAs so digits do not jitter.
- Materials: a translucent sticky header (`backdrop-filter`) for the tabs, with content scrolling underneath. Never stack light translucent layers. Neutral palette plus one accent; light and dark mode. Ask Noah about club colors.
- Support `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast: more`.

**Motion rules (Emil Kowalski / animate skill).** For each animation, first name its purpose (feedback, spatial consistency, state change, preventing a jarring change). If you cannot, do not animate it. **Zero animation is a valid result.**
- Use `transform` and `opacity` only. Never `transition: all`. Never animate from `scale(0)` (use `scale(0.95)` plus opacity). Never `ease-in` on UI.
- Tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. UI durations under 300 ms (buttons 100–160 ms, popovers 125–200 ms, dropdowns 150–250 ms).
- Buttons: `scale(0.97)` on `:active`, feedback on pointer-down. Gate hover motion with `@media (hover: hover) and (pointer: fine)`.
- Use CSS transitions, not keyframes, for anything triggered often (they retarget when interrupted). Use CSS or WAAPI for predetermined motion. Use Motion only for springs and gestures, and use the full `transform` string, not the `x`/`y` shorthands.
- No animation on frequent or keyboard-driven actions: clicking a log row to jump the video, switching tabs, dismissing menus. Stay instant.
- Never animate data the user is reading or acting on for style. Table rows may fade in on first render only (stagger 30–80 ms, first 10 or so rows, never blocking interaction). Charts get a simple fade, not a flourish.
- **The trim timeline is the most "Apple" interaction in the app.** Respond on pointer-down. Track 1:1 with the pointer using pointer capture, respecting where the user grabbed the handle. Rubber-band at the ends. Snap with a critically damped spring, and use a hint of bounce only after a flick. Keep it interruptible (grab it mid-motion and it follows the finger).
- **Progress:** a linear bar for constant motion; stage changes crossfade or slide with `--ease-out`; the ETA text updates without animation.
- **Copy button:** the label changes to "Copied" with a short crossfade (blur 2px can mask a rough one). This is the feedback purpose.
- Delight only at rare moments (for example, a first completed analysis). Keep it small. **Built:** a one-time "First game analyzed" check mark; the stage list fades between stages.
- Review motion at 2–5× slower speed, frame by frame in the DevTools animation panel, test the trim gestures on a real phone, and look again the next day.

## 20. The /test simulation page

`/test` (behind the login like every page) runs the real Analyze screens against a simulator (`lib/demo/`), plus a simulated **Season trends** tab with charts. Nothing is uploaded, no AI is called, nothing costs money.

- **Made-up data is allowed ONLY on `/test`**, and it is labeled as simulated on the page and above every result. **Never** use simulated or invented data on the real Analyze page or the real Season tab (section 3, rule 1).
- Each simulated game plants one scoring mistake (the third quarter when it has a score) so the scoreboard check visibly catches it.
- The simulated season (18 basketball and 12 lacrosse made-up games, `lib/demo/season.ts`) is written as rows in the club's sheet layouts and runs through the **same** Season tab, parser and math as the real one. Its summary is filled in from the computed numbers without calling an AI.
