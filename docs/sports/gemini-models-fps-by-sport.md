# Gemini models, fps, and cost by sport (checked 2026-11-17)

For the club's video-analysis site. Pricing and video settings come from Google's Gemini API docs (links at the bottom). Which fps each sport needs is my judgment from how fast the key events happen. Nothing here has been tested on real Roslyn footage yet.

## Correction to my earlier estimate
Earlier I said Gemini uses about 260 tokens per frame by default. That is the high-resolution setting. The default is low resolution: **66 tokens per frame plus 32 tokens/second of audio, about 100 tokens per second of video at 1 fps**. So a 90-minute basketball game at 1 fps is about 0.53M tokens, not 1.5M, and costs roughly a third of what I quoted. Costs below use the correct rates.

## 1. The models
All prices are paid-tier, per 1M tokens. Context is 1M tokens, which holds up to ~3 hours of video at default resolution.

| Model | Input / Output | Free tier | Batch (50% off) | Pros | Cons |
|---|---|---|---|---|---|
| **Gemini 4 Argon** (flagship) | $2 / $10 now; **$4 / $20 from Dec 1, 2026** | No | Yes | Most capable; supports agentic video mode | Most expensive; price doubles Dec 1; no free tier |
| **Gemini 3.8 Flash** | $0.75 / $3.75 now; **$1.50 / $7.50 from Jan 1, 2027** | Yes | Yes | Best price-to-quality for most sports; newest Flash; supports agentic mode | Price doubles Jan 1 |
| Gemini 3.6 Flash | Same as 3.8 Flash | Yes | Yes | Same price, still supported | Older than 3.8; no reason to pick it over 3.8 |
| **Gemini 3.5 Flash-Lite** | $0.30 / $2.50 | Yes | Yes | Cheap; price not changing; supports agentic mode | Weaker reasoning; more likely to miss fast action |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | Yes | Yes | Cheapest current model | Older, no agentic mode; lowest accuracy expected |
| Gemini 3.1 Pro (Preview) | $2 / $12 (up to 200k tokens per request); $4 / $18 above | No | Yes | Strong reasoning | Still "preview" (can change); price jumps over 200k tokens per request, so you must chunk the video; costs 2-3x Flash |
| Gemini 3 Flash (Preview, "legacy") | $0.50 / $3 | Yes | Yes | Cheaper than 3.8 Flash today | Legacy preview model; may be retired |
| Gemini 2.5 Flash-Lite (old) | $0.10 / $0.40 | Yes | Yes | Lowest sticker price | Older model uses ~4x more tokens per frame (256 vs 66), so it is not actually cheaper per frame than 3.1 Flash-Lite |

Not in the pricing text I could read: Gemini 3.7 Flash and 3.5 Flash. Check Google's pricing page before using them.

**Quality:** I found no benchmark that tests these models on sports video. General vision tests have a Gemini 3.5 Flash near the top of one vision leaderboard and ahead of 3.1 Pro on one overall index, and the Pro tier still wins on reasoning. So "Flash is good enough" is plausible but unproven for fast sports action.

**Privacy:** Google's pricing table has listed free-tier usage as "used to improve our products" and paid-tier as not. Since this is footage of students and the school has raised Ed Law 2-d concerns, use the paid tier for real game footage and re-check Google's current terms.

## 2. FPS and resolution settings
- Default is **1 fps**. Google notes this can miss detail in fast action. Set `fps` in the `processing` object (static mode only).
- Default media resolution is low (66 tokens per frame). High is 258 tokens per frame, about 3.9x the video cost. High resolution only helps for reading jersey numbers or small text; most action recognition is fine at default.
- **Agentic mode** (`"processing": "agentic"`; Argon, 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite) lets the model skim the timeline instead of sampling every frame. Google says up to 88% fewer tokens on long videos, but it is meant for finding specific moments, and it does not say it samples faster for fast action. Use static mode for stat tracking.
- Cost grows slower than fps because audio is a fixed cost: 3 fps costs about 2x the price of 1 fps, not 3x.

## 3. Each sport: fps, model, cost
Rule: 1 fps works when the stat is a play- or state-level result. Use 2-3 fps when the stat depends on something that takes under a second (a shot release, a ball contact, a strike). Model picks are starting points to confirm with the test in section 6.

Footage length is my assumption. Cost is per game at default resolution with the model shown. "Hudl video?" is from the Hudl inventory doc.

| Sport | fps | Start with | Footage | Cost/game now | After price change | Roslyn Hudl video? |
|---|---|---|---|---|---|---|
| Basketball | 3 | 3.8 Flash | 90 min | $1.08 | $2.16 | Yes |
| Lacrosse | 3 | 3.8 Flash | 90 min | $1.08 | $2.16 | Yes |
| Ice Hockey | 3 | 3.8 Flash | 90 min | $1.08 | $2.16 | No Hudl team |
| Water Polo | 3 | 3.8 Flash | 75 min | $0.93 | $1.85 | Team exists, no video |
| Badminton | 3 | 3.8 Flash | 120 min | $1.39 | $2.78 | Yes |
| Cheerleading | 3 | 3.8 Flash | 90 min | $1.08 | $2.16 | No Hudl team |
| Soccer | 2 | 3.8 Flash | 95 min | $0.85 | $1.70 | Yes |
| Volleyball | 2 | 3.8 Flash | 75 min | $0.70 | $1.41 | Yes |
| Wrestling | 2 | 3.8 Flash | 120 min | $1.04 | $2.07 | Yes |
| Tennis | 2 | 3.8 Flash | 120 min | $1.04 | $2.07 | No Hudl team |
| Field Hockey | 2 | 3.8 Flash | 90 min | $0.81 | $1.63 | No Hudl team |
| Baseball (result-level stats) | 2 | 3.8 Flash | 150 min | $1.26 | $2.51 | Team exists, no video |
| Softball (result-level stats) | 2 | 3.8 Flash | 120 min | $1.04 | $2.07 | Team exists, no video |
| Football | 1 | 3.5 Flash-Lite | 150 min | $0.36 | no change | Yes (boys varsity/JV) |
| Flag Football | 1 | 3.5 Flash-Lite | 75 min | $0.23 | no change | Yes |
| Track | 1 | 3.5 Flash-Lite | 150 min | $0.36 | no change | No Hudl team |
| Cross Country | 1 | 3.5 Flash-Lite | 60 min | $0.21 | no change | No Hudl team |
| Swimming | 1 | 3.5 Flash-Lite | 120 min | $0.31 | no change | No Hudl team |
| Golf | 1 | 3.5 Flash-Lite | 240 min | $0.52 | no change | No Hudl team |
| Bowling | 1 | 3.5 Flash-Lite | 90 min | $0.26 | no change | No Hudl team |
| Gymnastics | 1 (skills not trackable) | 3.5 Flash-Lite | 120 min | about $0.30 | no change | Yes |
| Fencing | 1 (touches not trackable) | 3.5 Flash-Lite | 90 min | about $0.25 | no change | No Hudl team |

Notes: baseball and softball are 1-2 fps for at-bat results but need 3+ fps for pitch-level stats. Gymnastics and fencing events last a fraction of a second, so only track what a scoreboard or final score shows. If a 1 fps sport fails the accuracy test on Flash-Lite, move it up to 3.8 Flash (about 2x cost).

## 4. Cost data: 90-minute game, default resolution, today's prices
Input plus an assumed 40k output tokens per game (stat log and thinking).

| Model | 1 fps | 2 fps | 3 fps | 5 fps |
|---|---|---|---|---|
| 3.1 Flash-Lite | $0.19 | $0.28 | $0.37 | $0.55 |
| 3.5 Flash-Lite | $0.26 | $0.37 | $0.47 | $0.69 |
| 3.8 Flash | $0.55 | $0.81 | $1.08 | $1.62 |
| 3.1 Pro (Preview) | $1.54 | $2.25 | $2.96 | $8.54 |
| 4 Argon | $1.46 | $2.17 | $2.88 | $4.31 |

Video tokens for that game: 0.53M (1 fps), 0.89M (2 fps), 1.24M (3 fps), 1.95M (5 fps).

- **3.8 Flash after Jan 1, 2027:** $1.09 / $1.63 / $2.16 / $3.23. **Argon after Dec 1, 2026:** $2.92 / $4.34 / $5.77 / $8.62.
- **Batch (50% off, slower, not instant):** 3.8 Flash at 3 fps drops to about $0.54 per game.
- **High resolution (258 tokens/frame):** 3.8 Flash costs $1.32 / $2.37 / $3.41 / $5.50. 3.1 Pro gets expensive ($18 at 3 fps) because 10-minute chunks pass 200k tokens and hit the higher tier.
- **Season example:** a 20-game basketball season at 3 fps on 3.8 Flash is about $22 today, about $43 after Jan 1.

## 5. What this means for the club
- The earlier worry that 3 fps is "too much more expensive" doesn't hold up: it is about 2x the cost of 1 fps, and a basketball game is about a dollar on Flash.
- The bigger budget risk is the Jan 1 price doubling on 3.8 Flash, not the fps. Design the site so the model is a setting you can change.
- Pro and Argon cost 2-3x more than Flash. Only use them if the test shows Flash misses events.

## 6. Test before committing (not done yet)
Take one ~5-minute clip the club already hand-tagged last year and run: 3.8 Flash at 1, 3, and 5 fps; 3.5 Flash-Lite at 3 fps; 3.1 Pro or Argon at 3 fps. Compare each run to the hand tags. The whole test should cost under $2. Do this for one slow sport (football or volleyball) and one fast one (basketball or lacrosse), then fix the fps and model per sport.

## Assumptions
- Footage lengths per sport are estimates, not measured from Hudl. Audio is billed at 32 tokens/second whether or not you need it.
- Output of 40k tokens per game is a guess. Even at 100k it adds under $0.40 on Flash.
- 10-minute chunks per request. Prices are paid-tier standard rates as shown by Google on 2026-11-17 and several change on Dec 1 and Jan 1.

## Sources
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Video understanding (fps, tokens, agentic mode, limits): https://ai.google.dev/gemini-api/docs/video-understanding
- Media resolution token counts: https://ai.google.dev/gemini-api/docs/media-resolution
- Model comparisons: Artificial Analysis (Gemini 3.5 Flash vs 3.1 Pro Preview), Roboflow vision leaderboard blog
- Companion doc: hudl-video-inventory.md
