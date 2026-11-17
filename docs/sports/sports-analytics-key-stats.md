# Sports Analytics Club: Key Stats by Sport

For the video-analysis site. 22 sports. For each one: the stats that decide wins and losses, plus a lot of coach-useful depth, and what to look for in the footage to log each one.

---

## How to read this

**Video column (how well AI can log it from one sideline camera, like Hudl fan footage)**

- **H** = visually obvious, should be reliable. Spot-check only.
- **M** = doable but the AI will make mistakes. Needs the "AI drafts, human confirms" review table.
- **L** = hard from a single sideline view (small details, off-ball movement, needs a close or overhead angle). Treat as manual or optional.

**Build principle (same as your Claude Code plan):** the AI only logs *events* (one row per shot, possession, point, rally, etc., with a timestamp). Your code computes every percentage and efficiency. Never let the AI do the math. Every sport below ends with a **"Log these events"** line: the cheapest set of event rows that lets code derive most of that sport's stats.

**Tier labels**
- **Tier 1** = the stats that most directly determine success or failure in that sport.
- **Tier 2** = strong supporting stats a coach will use week to week.
- **Tier 3** = nice-to-have depth, usually harder to log.

---

## Stats that apply to every sport (add these once, not 22 times)

| Stat | What to look for in the video | Video |
|---|---|---|
| Score by period/quarter/half/inning/game | Read the scoreboard at each period change. This is also your **check**: the logged events must add up to the scoreboard or the game is flagged for review. | H |
| Scoring runs | Streaks like 8-0 or 3 straight points. Note the time and what ended it (timeout, sub, adjustment). | H |
| Start-of-period performance | Score margin in the first 3 minutes (or first points) of each half. Shows halftime adjustments. | H |
| Close-game / clutch performance | Everything in the final stretch when the margin is small (e.g. last 4 min, within 5 points). Same stats, filtered. | H |
| Timeouts / stoppages | Who called it, score, and what happened in the next possession. | H |
| Opponent / home-away / team-colour tags | Set on upload. Lets you compare trends against strong vs weak opponents and home vs away. | H |
| Player ID (jersey number) | Only trust numbers read from clear moments. Make number entry editable in the review table. | M |
| Season trend | Rolling 3-game average of every Tier 1 stat, so a coach sees the direction, not just the game. | H (computed) |

---

# 1. BASKETBALL

**What decides games:** Dean Oliver's **Four Factors**: shooting efficiency, turnovers, rebounding, and free throws. Oliver's rough weights are shooting about 40%, turnovers about 25%, rebounding about 20%, free throws about 15%. Winning teams are positive on all four on both offense and defense.

**Log these events:** every shot (who, zone, made/missed, context tag), every turnover (type), every rebound (off/def, who), every foul (type, who), every free throw, every possession start (how it began).

### Tier 1: Four Factors (compute for your team AND the opponent)

| Stat | What to look for in the video | Video |
|---|---|---|
| **eFG%** = (FGM + 0.5 × 3PM) / FGA | Every shot attempt: made or missed, 2 or 3 (is the foot on the line?), and the shooter. | H |
| **Turnover % (TOV%)** = TO / possessions | Every possession that ends without a shot or free throw: bad pass, travel, steal, offensive foul, shot-clock violation, out of bounds. Tag **live-ball** (steal, leads to fast break) vs **dead-ball**. | H |
| **Offensive rebound %** = OREB / (OREB + opp DREB) | Every missed shot: who gets the rebound and which team. Count extra possessions and second-chance points. | H |
| **Defensive rebound %** | Same, from the defensive side. Look for opponents crashing the glass or your team not boxing out. | H |
| **Free throw rate** = FTA / FGA | Every foul that sends someone to the line. Count attempts, not makes. Note whether the team is in the bonus. | H |

### Tier 1: Overall efficiency

| Stat | What to look for in the video | Video |
|---|---|---|
| **Points per possession (PPP)**, offense and defense | Segment the game into possessions (each time the ball changes team) and total the points. Everything else can be split by PPP. | M |
| **Shots vs makes by context** (your club's existing tag) | Label each shot **fast break / vs man / vs zone**. Report FG%, eFG% and PPP for each. This is your signature stat. | M (man vs zone is the shaky one) |

### Tier 2: Shot quality and shot selection

| Stat | What to look for in the video | Video |
|---|---|---|
| Shot zone distribution | Where each shot is taken: at the rim, paint, midrange, corner 3, above-the-break 3. Coaches want more shots at the rim and from 3, fewer long 2s. | M |
| FG% by zone | Same zones, makes over attempts. Shows where your team actually scores. | M |
| Assisted vs unassisted makes | Did a pass directly lead to the basket? Low assisted % can mean stagnant offense. | M |
| Free throw % (team and player) | Every free throw, made or missed. Split by quarter and clutch time. | H |
| Early-clock vs late-clock shots | How many seconds into the possession the shot goes up. Many late-clock heaves = broken offense. | M |
| Pace (possessions per game) | Count possessions. Compare to the opponent's preferred tempo. | M |
| Transition frequency and efficiency | How often the team pushes after a rebound or steal, and PPP on those possessions. | H |
| Points off turnovers | Opponent turnover → our score within the same possession. | H |
| Second-chance points | Points scored on a possession that continued after an offensive rebound. | H |
| Points in the paint | Baskets from inside the lane. | H |
| Fast-break points allowed | Opponent scores in the first ~8 seconds after our shot or turnover. Points to a transition defence problem. | H |
| Out-of-bounds plays (BLOB/SLOB) PPP | Every sideline or baseline inbound, and whether it produced a good shot. | H |

### Tier 2: Defence

| Stat | What to look for in the video | Video |
|---|---|---|
| Opponent eFG% by defence type | Tag your defence (man, zone type, press) per possession, then show opponent eFG% against each. | M |
| Contested vs open shots allowed | Is a defender within arm's reach and closing out when the shot goes up? Open shots allowed is a major coaching point. | M |
| Steals / deflections / charges drawn / blocks | Count each. Deflections matter even when they don't become steals. | M |
| Fouls by type | Shooting foul, reach-in, off-ball, loose-ball. Who commits them and when. | M |
| Press break success | Against a full-court press: did the team get across half court in time and without a turnover? | M |
| Defensive possessions ending in a stop | A stop = miss + defensive rebound, or turnover. Stop % is a clean defensive summary. | M |

### Tier 3

| Stat | What to look for in the video | Video |
|---|---|---|
| On/off or lineup plus-minus | Score margin while each group of five is on the floor. Needs reliable jersey numbers. | L-M |
| Post touches / paint touches | Ball enters the post or paint, and what happens (shot, kick-out, turnover). | M |
| Ball reversals vs zone | Count passes side-to-side before the shot against a zone. | L |
| Foul trouble minutes | Who sits with 2+ fouls early and what the lineup does without them. | M |
| Usage / shot share | Shots + turnovers + free-throw trips by player. | M |

---

# 2. LACROSSE

**What decides games:** extra possessions (faceoffs, ground balls, caused turnovers, clears) and efficiency once you have the ball. A team can have solid attack and defence and still lose if it loses the midfield possession battle. A published example noted that ground balls, faceoff win % and caused turnovers by midfielders told the real story.

**Log these events:** every possession (how it started, how it ended, outcome), every shot, every faceoff, every ground ball (who won), every turnover (forced/unforced), every clear and ride (success/fail), every penalty (type, minutes).

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Offensive efficiency** = goals / offensive possessions | Count each possession. Goal, shot saved, turnover, etc. Also compute defensive efficiency (goals allowed / opponent possessions). | M |
| **Faceoff win %** | Each faceoff: who gets possession. Track by player, and the faceoff ground ball (the scrap after the clamp) separately. | H |
| **Ground ball % (share won, not total)** | Every loose ball: which team gets it. A team can lead in total GB just by having more loose balls, so the share is the real number. | M |
| **Turnovers (forced vs unforced) and caused turnovers** | Unforced: bad pass, drop, offsides. Forced: poke check, stick check, pressure. Log the **quarter** too (your club already tracks turnovers by quarter). | M |
| **Clear %** | Each time a team tries to clear the ball from its defensive end: made it across midfield or lost it. Also compute **ride %** (opponent's failed clears). | M |
| **Man-up % and man-down kill %** | Every penalty gives one team a man-up possession. Goals / opportunities. Look at who is in the penalty box and the clock. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Shots, shots on goal, shot % | Every shot and whether it hit the goal or goalie. Shot % = goals / shots. SOG % = on goal / shots. | H |
| Assisted vs unassisted goals | Did a pass directly set up the goal? Unassisted = dodge goals or transition. | M |
| Goal source | Dodge, off-ball cut, feed from X, transition/fast break, extra-man, second chance. | M |
| Settled vs transition offence | Did the team score on a settled possession or off a turnover/clear? | M |
| **Defensive possessions by type (M/Z/F)** and goals allowed (your club's tag) | Tag each opponent possession as man defence, zone, or the club's third label, then goals allowed and efficiency for each. | M |
| Goalie save % | Saves / shots on goal. Split by shot location and type (bounce, high-low, hip shot, close-range, outside). | H |
| Goalie clears / outlet pass | After a save, does the goalie start a clear quickly and accurately? | M |
| Penalties and penalty minutes by player and type | Slash, push, holding, offside, etc. Who and when. | H |
| Late-possession shooting | If a shot clock is used, shots in the last 10-20 seconds are a measure of broken offence. | M |
| Turnovers by quarter and by player | Spot the player or the quarter where the team falls apart. | M |

### Tier 3

| Stat | What to look for in the video | Video |
|---|---|---|
| Slide / rotation breakdowns | Did the defence slide late, leave a man open, or overreact to a dodge? | L |
| Shots against goalie by quality | Close/high-danger shots vs outside shots. Distinguishes a lucky goalie from a good one. | M |
| Time of possession | Rough share of the game with the ball. Weak on its own, useful with efficiency. | L |

**Women's lacrosse add-ons** (rules differ): **draw controls**, **free position shot %**, and 8-meter conversion. These show up in standard women's stat sheets.

---

# 3. VOLLEYBALL

**What decides games:** winning the serve-and-pass battle and limiting unforced errors. A bad pass leads to a bad set and a bad hit. If you do not side out, you do not get to serve.

**Log these events:** every serve (result, rating 0-3 or ace/error), every serve-receive pass (rating 0-3), every attack (kill/error/in play), every block, every dig, every point (who won it, which rotation).

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Hitting efficiency** = (kills − errors) / attempts | Every attack: a kill (ball ends the point), an error (net, out, blocked), or in play. Kill count alone misleads. Roughly .300 or higher is strong at club level. | H |
| **Side-out %** | In rallies where the other team served: did we win the point? Aim roughly 50-65% depending on level. | H |
| **Serve-receive pass rating (0-3)** | 3 = perfect (any attack option), 2 = can set the outside, 1 = free ball back, 0 = ace/no return. Average rating plus **perfect pass %** and **receive error %**. | M |
| **Serve error % and ace %** | Every serve: in, error (net/out/foot fault), or ace. Rough club targets: errors under 10%. | H |
| **Points scored per serving rotation** | Which rotation we win or lose the most points in. Reveals weak rotations. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| First-ball kill % ("1-and-done") | Point won on the first attack after serve receive. High = efficient offence. | H |
| Transition attack efficiency | Hitting % when the attack comes off a dig, not a clean pass. Shows how well the team plays out of trouble. | M |
| Serve quality / out-of-system rate | Did the serve force the opponent out of their normal offence (poor pass, free ball, overpass)? | M |
| Block touches, solo and assisted blocks | Count blocks and touches that slow the ball. Block touches matter because they help dig. | M |
| Digs per set and dig quality | Every defensive contact on an attack: dig, or error. Rate the dig as playable or not. | M |
| Free ball conversion | How well the team scores on easy free balls. | M |
| Set assists and set distribution | Which hitter gets the set, and the kill % per set location (outside, middle, right side, back row). | M |
| Unforced errors by type | Net, foot fault, double contact, lift, serve, attack out. Totalled per set. | H |
| Point runs | Streaks of 3+ points and what causes them (a serving run, block run). | H |
| Late-set performance | Efficiency in the last 5 points of each set. | H |

### Tier 3

| Stat | What to look for in the video | Video |
|---|---|---|
| Opponent attack zones | Where opposing hitters attack: line, cross-court, tip, roll shot. Informs defensive positioning. | M |
| Serving target zones | Where your servers aim (zone 1/5/6, seams, short). | M |
| Rotation errors / overlap | Illegal rotation or positioning (usually called by officials). | L |

---

# 4. SOCCER

**What decides games:** chance quality (not just volume), control of the ball in dangerous areas, and how well each team defends transitions and set pieces. Possession by itself is weak: a team can have 60% possession and lose 3-0.

**Log these events:** every shot (location, body part, outcome), every possession change with the zone where it occurred, every set piece (type, outcome), every card/foul, every goal (build-up type).

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Shots, shots on target, shot accuracy %** | Every attempt: saved, goal, blocked, off target. Shot accuracy = SOT / shots. | H |
| **Shot quality / xG proxy** | Tag where each shot is from (inside the six-yard box, central inside the box, wide in the box, outside the box) and the type (header, volley, one-on-one). Without a model, shot location is a good proxy for quality. | M |
| **Conversion rate** = goals / shots | A team shooting from distance will have a low rate. Compare against shot quality. | H |
| **Possession won in the final third (high turnovers)** | Where the ball is won back. Winning it high leads to shots. | M |
| **Set-piece goals for and against** | Every corner, direct free kick, indirect free kick, throw-in near the box. What happened next: shot, goal, cleared. | H |
| **Goals conceded patterns** | For every goal against: counter-attack, set piece, individual error, cross, through-ball, long shot. | M |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Possession % with territory | Time with the ball plus where. Possession in the opponent's third is the one that matters. | L |
| Final-third entries and box entries | Each time the ball gets into the attacking third and into the penalty area. Efficiency = shots per entry. | M |
| Chances created / key passes | The pass before a shot. Counts creators. | M |
| Pressing intensity (PPDA proxy) | How many opponent passes occur before your team makes a defensive action in the opponent's end. Fewer = more aggressive press. | L |
| Turnovers by zone | Losses in your own third are the dangerous ones. Log own-third turnovers and what the opponent did next. | M |
| Duels won % and aerial duels won % | Ground and air battles, by player. | M |
| Transitions: counter-attacks for/against | Shots or goals within ~10 seconds of a turnover. | M |
| Interceptions, clearances, blocks | Defensive actions, by zone and by player. | M |
| Goalkeeper: save %, crosses claimed, distribution | Saves / SOT faced. Cross handling. Whether kicks and throws reach teammates. | H |
| Fouls and cards by zone and by player | Free kicks conceded close to the box are dangerous. | H |
| Corners won, free kicks won | Where pressure comes from. | H |
| Goals by minute / by period | Shows whether the team starts or finishes weakly. | H |

### Tier 3

| Stat | What to look for in the video | Video |
|---|---|---|
| Defensive line height | Average distance of the back line from its own goal. Related to how many offsides are won and how many through-balls beat the line. | L |
| Offsides won/conceded | A trap or a high line. | M |
| Pass completion and progressive passes | Completed passes, and those that move the ball meaningfully forward. Reliable only with good footage. | L |
| Formation and shape | Out-of-possession shape (4-4-2, 4-2-3-1) and compactness. | L |

---

# 5. FOOTBALL (11-man tackle)

**What decides games:** efficiency on every down, big plays, turnovers, and finishing drives. The modern view is that **success rate** and **explosive plays** matter more than raw yardage, and that **turnover margin** is a strong but not exclusive predictor.

**Log these events:** every play (down, distance, field position, formation, play type, result in yards, penalty, turnover, who carried/targeted/tackled).

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Success rate** | A play is a success if it gains 50% of the yards needed on 1st down, 70% on 2nd down, 100% on 3rd/4th (the common college definition; the NFL version uses 40%/60%/100%). Pick one and stay consistent. | H |
| **Explosive play rate** | Plays above a set threshold (commonly 10+ yards rushing, 20+ passing). Offence wants more, defence wants fewer. | H |
| **Turnover margin** | Interceptions and fumbles lost, for and against. Also **points off turnovers**. | H |
| **Third-down conversion % (by distance)** | Every 3rd down: short (1-3), medium (4-6), long (7+). Shows whether the team is on schedule. | H |
| **Red-zone TD %** and **points per trip inside the 40** | Every drive that reaches the opponent's 20 (or 40), and what points it produced. | H |
| **Points per drive** | Every drive: start field position, result, points. Best single summary of offence and defence. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Yards per play (offence and defence) | Total yards / plays. | H |
| Starting field position | Where each drive starts. Cheap yards from turnovers, kicking, and returns. | H |
| Run/pass split by down, distance, formation | Tendencies. Great for scouting opponents and self-scouting. | H |
| Penalties and penalty yards | Type and who. Drive-killers: false start, holding, pass interference. | H |
| QB: completion %, yards per attempt, INTs | Per passing play. | H |
| QB under pressure vs clean pocket | Pressures, sacks, hurries, and the result of the throw. | M |
| Sacks / pressure rate / pass-rush win | Defensive line production. | M |
| Rushing: yards per carry, runs of 10+, stuffed runs (≤0 yards) | Stuffed % shows run-blocking problems. | H |
| Tackling: missed tackles | Every tackle attempt that fails. Often the biggest hidden cause of explosive plays against. | M |
| Special teams: punt/kick distance, return average, field goal % | Every kick. Hidden yardage. | H |
| 4th-down decisions and results | Go for it vs punt vs kick. | H |
| Time-of-possession and plays per drive | Weak alone, useful alongside success rate. | H |
| Blitz rate and success | Extra rushers, and what happened. | M |
| Coverage: man vs zone, shells | Defensive back alignment. Hard from a sideline camera. | L |
| Formation and personnel groupings | Number of RBs/TEs/WRs. | M |

### Tier 3

| Stat | What to look for in the video | Video |
|---|---|---|
| Yards before contact | How far the runner got before being hit. Measures the offensive line. | L |
| Pass-block win rate | Whether each lineman held his block. Needs an end-zone or all-22 view. | L |
| Gap/assignment errors | Who missed their run fit. | L |

---

# 6. FLAG FOOTBALL

**What decides games:** a smaller field and no contact, so it is about passing efficiency, separation, and flag-pull defence. The one play that decides most games is a missed flag pull turning into a long gain. Rules vary a lot by league (players per side, whether the QB can run, rush rules), so make the sport settings editable.

**Log these events:** every play (down/possession, formation, play type, target, completion, yards, flag pull attempt and result, penalty), every rush on the QB.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Completion %** and **yards per attempt** | Every pass: caught, incomplete, intercepted, dropped. | H |
| **Flag-pull success %** (the equivalent of tackling) | Each attempt by a defender to pull a flag: pulled, missed. Track missed pulls that become big plays. | M |
| **Turnovers (INT, fumble) and points off turnovers** | Count interceptions especially, since they are common in flag. | H |
| **Touchdowns per possession** | Possessions / TDs. Primary scoring efficiency. | H |
| **Conversion % (first downs or 2-pt tries)** | If the format uses downs, conversion at each stage. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Yards after catch (YAC) | Distance after the catch. Shows separation and the receiver's ability to avoid pulls. | M |
| Target share and drops | Which receivers get the ball and drop it. | M |
| Sacks / QB pressure | Rusher pulls the QB's flag, or forces a throwaway. Depends on the rush rules. | M |
| Pass breakups / passes defended | Defender gets a hand on the ball. | M |
| Run vs pass ratio and run success | Run plays (if allowed) and yards per carry. | H |
| Red-zone efficiency | Scoring from inside the 10 on a compressed field. | H |
| Penalties (illegal contact, flag guarding, offside) | Count and type. | H |
| Pre-snap motion / formation tendencies | Whether the team uses motion, bunch, trips. | M |
| Pick-six / return touchdowns | Defensive scores. | H |

---

# 7. BASEBALL

**What decides games:** getting on base, not giving free baserunners, and defending the balls in play. High school baseball is volatile: one rough inning or a couple of errors can decide it. Process stats that coaches can control tend to beat outcome stats like batting average.

**Log these events:** every plate appearance (pitch count, result, hit type/quality), every pitch (ball/strike/in play, type if visible), every baserunning event, every defensive play (error, out, hit).

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **First-pitch strike % (FPS%)** | The first pitch of each at-bat: strike (swing, called strike, foul, ball in play) or ball. National average around 58%. In GameChanger data, at-bats starting with a strike ended with opponents reaching base around .320, versus much higher after a first-pitch ball. | H |
| **On-base % (OBP)** | Every plate appearance: hit, walk, hit-by-pitch, reached on error. More useful to build a lineup than batting average. | H |
| **Quality at-bat % (QAB)** | Define a QAB (e.g. hard-hit ball, 6+ pitch at-bat, walk, productive out such as a sacrifice or moving a runner). Count at-bats that meet it. | M |
| **Walks, strikeouts, K/BB for pitchers** | Every plate appearance outcome. Walks (especially leadoff walks) are the most preventable runs. | H |
| **Hard-hit ball %** | Balls hit hard (line drive or hard ground ball, off-the-bat judgement). Shows hitting quality regardless of results. | M |
| **Errors and unearned runs** | Every defensive miscue and the runs that follow. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Pitches per inning and per batter | Efficiency. Pitching goals like under 15 per inning. | H |
| Strike % overall and by count | Strikes / pitches. Pay special attention to the 1-1 pitch (often called the critical pitch) and ahead-in-count rate. | H |
| 3-ball counts and walks after 0-2 | Pitchers who lose control after getting ahead. | H |
| Leadoff batter reached % | Whether the first batter of each inning reaches base. | H |
| 2-out runs scored/allowed | Runs with two outs reflect two-strike approach and defence. | H |
| Runners in scoring position (RISP) conversion | Hits and RBI with a runner on 2nd or 3rd. | H |
| Left on base and run expectancy by inning | Which inning the team scores or gives up runs. | H |
| Stolen base attempts and success | Plus catcher pop time and pitcher time to plate. | M |
| Extra bases taken, runner decisions, outs on bases | Aggressive but costly baserunning. | M |
| Line drive / ground ball / fly ball mix | Line drives become hits very often at high school level. | M |
| Strikeouts looking vs swinging | Plate discipline vs swing-and-miss. | M |
| Defensive efficiency | Balls in play turned into outs. | M |
| Pitch type and usage by count | Fastball/breaking/changeup. Needs good zoom. | L |

### Tier 3

| Stat | What to look for in the video | Video |
|---|---|---|
| Pitch location heatmap | Where pitches cross the plate. Needs a behind-the-plate camera. | L |
| Throw accuracy / cutoff execution | Outfield-to-infield relays and throws home. | L |
| Exit velocity, spin, pitch speed | Needs radar or Trackman. Not from video. | L |

---

# 8. SOFTBALL

**What decides games:** the same as baseball with more emphasis on pitching dominance, the short game, and fast action on the 60-foot bases. A quick slap hit or bunt is more valuable than on a 90-foot diamond, and errors turn into runs even faster.

**Log these events:** same as baseball, plus short-game attempts (slap, bunt) and steal attempts.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **First-pitch strike %** and **overall strike %** | First pitch of every at-bat, and every pitch ball/strike. | H |
| **OBP and QAB%** | Same definitions as baseball. | H/M |
| **Walks and hit batters (pitching)** | Free baserunners are the biggest controllable factor. | H |
| **Strikeout rate / K per inning** | Pitcher dominance. | H |
| **Errors and runs allowed after errors** | Shorter distances punish defensive mistakes. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Short-game success (bunt, slap) | Attempts, successful bunts, slap hits that reach base, sacrifice execution. | M |
| Steals, success %, and pitcher/catcher timing | Attempts / safe. | M |
| Contact rate / strikeouts | Whether the lineup puts the ball in play. | H |
| Reached on error / fielder's choice | Hitters who force defensive play. | M |
| Hard-hit ball % and line-drive % | Hitting quality. | M |
| Pitch strategy: first-pitch type, ahead/behind counts | Pitch sequencing (if visible). | L |
| Left on base and 2-out runs | Same as baseball. | H |
| Defensive efficiency and outfield throws | Putouts, assists, throws on target. | M |
| Pitches per inning and total pitches | Workload and efficiency. | H |
| Pitch location (inside/outside, high/low) | Where the pitcher is attacking the zone. | L |

---

# 9. TENNIS

**What decides matches:** holding serve and breaking when you get the chance. The five most commonly cited tennis stats are first-serve %, service games won, break points saved, second-serve return points won, and break points converted. For high school team tennis, also track the line (singles 1-3, doubles 1-3) since a team match is a set of separate matches.

**Log these events:** every point (server, 1st/2nd serve, serve direction, rally length bucket, point ending: winner / forced error / unforced error / ace / double fault, who won), every game/set result.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **First-serve %** | First serves in / total service points. A solid level is around 60-65%; below about 55% puts heavy pressure on the second serve. | H |
| **First-serve points won %** | Points won when the first serve lands in. | H |
| **Second-serve points won %** | Points won when the second serve is used. A weak second serve gets attacked. | H |
| **Double faults** | Count and when they occur (break points, tiebreaks). | H |
| **Break points converted and saved** | Every break-point opportunity: result. Pros convert roughly 40-45%. | H |
| **Service games held %** | Service games won / played. The bottom line for serving. | H |
| **Winners vs unforced errors (ratio)** | Each point ending. UEs are commonly the best sign of who controls the match, especially in junior and high-school tennis. | M |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Return points won (1st serve and 2nd serve) | Points won as returner. Second-serve return points won above about 50% puts serious pressure on the server. | H |
| Points by rally length (0-4, 5-8, 9+) | How points are won in short vs long rallies. Shows if the player is a big hitter or grinder. | M |
| Serve direction (T, body, wide) and win % per direction | Reveal serving patterns and whether opponents have a weakness. | M |
| Serve + 1 (3rd ball) pattern | What the server does after the serve. | M |
| Return in play % | Returns that land in the court. | H |
| Net approach and net points won | Approaches, volleys, success rate. | M |
| Winners and errors by wing (forehand / backhand) | Where the weakness is. | M |
| Pressure points: tiebreaks, deuce points, set points | Performance when the score is tight. | H |
| Deuce-side vs ad-side win % | Serve and return from each side. | H |
| **Doubles:** first-volley %, poaches, lobs, service-return crosscourt vs line | Team patterns in doubles. | M |
| Momentum: points won in streaks, games won after a break | Resilience. | H |

---

# 10. TRACK AND FIELD

**What decides results:** personal records and place points, so a coach mainly needs to know *where in the race or attempt* time is lost or gained. This sport splits into groups, and the video requirement differs for each. Sprint and hurdle starts need a close side view.

**Log these events:** each athlete's time splits at known markers, each field attempt (mark, foul/valid), relay exchange (zone entry, pass point), reaction at the start.

### Sprints (100/200/400)

| Stat | What to look for in the video | Video |
|---|---|---|
| Reaction time and start | Time from gun to first movement. Typical video cannot measure accurately, but you can see slow or false-start-like reactions. | L |
| Block clearance and first three steps | Body angle at exit, pushing through both blocks, how quickly the athlete rises. | L |
| Acceleration phase (0-30m) | How smoothly the athlete rises into upright running. | M |
| Max-velocity form | Posture, stride length and frequency. | M |
| Speed endurance (last 20m of a 100, last 100m of a 400) | Who fades. Compare splits. | M |
| Lane splits (200/400) | Time through the curve vs the straight. Pacing errors (going out too fast). | M |

### Hurdles

| Stat | What to look for in the video | Video |
|---|---|---|
| Time to first hurdle and first-touchdown time | The start and approach into the first hurdle. | M |
| Takeoff distance and landing distance | How far before the hurdle the athlete takes off. Ideal is consistent. | L |
| Step pattern (3-step vs 4-step, lead leg) | Consistency of strides between hurdles. | M |
| Hurdle clearance: clips, trail-leg and lead-arm mechanics | Hitting hurdles slows the athlete. | M |
| Hurdle-to-hurdle split (rhythm) | Time between each hurdle. | M |

### Relays

| Stat | What to look for in the video | Video |
|---|---|---|
| Exchange zone execution | Baton passed inside the zone (the zone is 30m with the scratch line 20m in). Outgoing runner starting at the right mark. | H |
| Exchange time and dropped batons | Time lost in each handoff, drops, outside-zone passes. | H |
| Leg splits | Each runner's time for their leg. | M |

### Distance (800+)

| Stat | What to look for in the video | Video |
|---|---|---|
| Lap/split pacing and evenness | Time per lap. Even or slightly negative splits are the goal. | H |
| Kick (last 200-400m) | Time and position change over the last lap. | H |
| Position at each lap | Place after lap 1, 2, 3. Shows tactical racing. | H |

### Jumps

| Stat | What to look for in the video | Video |
|---|---|---|
| Approach consistency | Foot placement at each step in the approach. | M |
| Board/takeoff accuracy (long and triple jump) | How far from the board; fouls. | H |
| Takeoff angle and last-three-steps | Setup into the jump. | L |
| Bar clearance (high jump / pole vault) | Where the athlete clears relative to the bar, takeoff distance, grip/plant. | M |
| Fouls and passes | Percentage of attempts that are fouls, and attempts at each height. | H |

### Throws

| Stat | What to look for in the video | Video |
|---|---|---|
| Circle position and foot placement | Exit from the circle, fouls. | M |
| Release angle and release point | Needs side camera. | L |
| Fouls % | Foul vs valid attempts. | H |
| Best mark progression across attempts | Improvement through the competition. | H |

**Team-level:** points per event, PRs per meet, and heats won.

---

# 11. CROSS COUNTRY

**What decides races:** pacing and the team's pack. Analyses of championship races found that **even pacing predicts faster times**: the fastest finishers had the least positive splits. In scoring, what matters is the sum of the top five runners' places, so the **gap between runner 1 and runner 5 (the 1-5 split)** is a standard coaching metric.

**Log these events:** each runner's time or place at each checkpoint (mile 1, mile 2, finish) and the finishing time.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Pace/splits per mile or checkpoint** | Time at each marker. | H |
| **Pacing evenness (positive/negative split %)** | Final-section pace / opening-section pace. Evenly paced runners place higher. | H |
| **1-5 split (pack gap)** | Time difference between your first and fifth runner. In one Texas high-school ranking, the best boys' teams were under about 22 seconds and many were under a minute. Smaller is better, so set your own baseline. | H |
| **Place at each checkpoint** | Place at mile 1, mile 2, finish. Shows who goes out too fast, who closes well. | H |
| **Team score and points scored** | Sum of top five places. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Positions gained or lost by section | Moves made on hills, flats, downhills. | H |
| First 400m placement | Whether the runner gets out well or gets boxed in. | H |
| Kick: last 400m split | How fast the finish is. | H |
| Surges: hard efforts and response | Which runner made a move and whether others followed. | M |
| Team pack integrity | Are teammates running together at mile 1 and 2? | H |
| Course sections: hills, mud, turns | Where the team slows down. | M |
| Form breakdown late in the race | Arm carriage, head position, stride shortening. | M |
| Pass vs be-passed count | Runners overtaken vs runners who passed you in the last mile. | M |

---

# 12. SWIMMING

**What decides races:** race time breaks into start, underwater (off the start and turns), swimming, turn, and finish. Research finds that turn time, underwater phases, and distance per stroke separate swimmers more than raw stroke speed, and the shorter the race the more start and turn matter.

**Log these events:** each swimmer's time at each 25 or 50 mark, stroke count per length, start reaction (if visible), underwater breakout point, turn in/out times.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Split times per 25/50** | Time at each wall or mark. Compare first half to second half. | H |
| **Start: time to 15m** | From the gun (or the first movement) until the head passes the 15-meter line. | M |
| **Underwater distance and breakout point** | How far off the start and each turn the swimmer stays underwater. The legal limit is 15m. A common goal is to improve it across the season. | M |
| **Turn: time in and out (5m in, 5m out)** | Time from entering 5m before the wall to leaving 5m after it. | M |
| **Distance per stroke / stroke count per length** | Count strokes each length. Research on elite IM swimmers found distance per stroke (not stroke rate) was linked to performance. | H |
| **Stroke rate (strokes per minute)** | Time for a stroke cycle. Too high early wastes energy; a drop shows fatigue. | M |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Race strategy: even vs negative vs fade | Compare first-half and second-half splits. | H |
| Last 5m into the wall and finish | Last stroke into the wall (gliding or a full stroke), finish touch. | M |
| Relay exchange (takeoff timing) | Reaction of the leaving swimmer compared to the incoming swimmer's touch. A relay takeoff too early disqualifies; too late loses time. | H |
| Breathing pattern | Breaths per length, head position, especially on the last length. | L |
| DQ risks | Breaststroke kick, one-hand touch, butterfly kick, early takeoff on relays, stroke-turn violations. | M |
| Lead changes and lane position | Who leads at each wall. | H |
| Tempo drop-off late in the race | Stroke rate and speed at the last 25. | M |
| Body line and kick | Hips high or low, kick size. | L |

---

# 13. WRESTLING

**What decides matches:** takedowns. In NWCA analysis, takedowns accounted for roughly 46% of points in Division I men's matches, with escapes second and near-fall third; riding time was not a factor. Point values differ by level and style (e.g. high-school takedowns are 2 points, college 3), so make the scoring editable.

**Log these events:** every scoring action (type, wrestler, time, period), every shot attempt (success/fail), position at the start of each period, stalling and penalties.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Takedown % and takedown attempts (shots)** | Each leg attack or throw: completed or defended. Takedowns / attempts. | H |
| **Takedown defence %** | Opponent shots that fail. | H |
| **First takedown / first points** | Who scores first. Strong predictor in a low-scoring sport. | H |
| **Escapes and reversals** | When on bottom, how quickly and often the wrestler gets out or gets on top. | H |
| **Near-fall points and pins** | Back exposure, pins, tech falls, majors. Bonus points matter in team scoring. | H |
| **Points scored by period** | Compare periods. A strong third period shows conditioning. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Position choice and results (neutral, top, bottom) | Which position is chosen for the second and third periods and the resulting points. | H |
| Riding time | Time controlling from the top. | H |
| Return to neutral / scramble outcome | Who comes out of scrambles on top. | M |
| Leg attack types (single, double, high-crotch, throw) | Which shots score. | M |
| Hand-fight and ties | Who gets inside control, who is pushed back. | L |
| Stalling and penalty points | Who gets warned, when. | H |
| Bonus-point rate (majors, techs, pins) | Margin of victory. | H |
| Injury time and recovery | Time-outs affecting the match. | H |
| Conditioning: scoring and shot rate late | Takedown attempts in the last minute vs the first. | M |
| Weight-class team scoring | Team points from each weight class vs expected. | H |

---

# 14. WATER POLO

**What decides games:** the extra-man situation. In Olympic and World Championship knockout rounds (Tokyo 2020, Fukuoka 2023, Doha 2024), the team with the higher power-play conversion won about 75% of the games in two events and nearly all in the third. Beyond that, goalkeeping, turnovers and counter-attacks decide.

**Log these events:** every shot (location, outcome), every exclusion (who, drawn/committed, outcome of the 6-on-5), every turnover/steal, every sprint (period start), every period's score.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **6-on-5 (extra-man) conversion %** | Each time an opponent is excluded: our possession outcome (goal, miss, turnover). | H |
| **5-on-6 (man-down) defence / kill %** | The opposite side: how many extra-man possessions are stopped. | H |
| **Shot % and shots by zone** | Perimeter, hole set (centre), penalty, counter. | H |
| **Goalkeeper save %** | Saves / shots faced. Separate 5-metre or penalty shots. | H |
| **Steals and turnovers** | Count both. Turnovers committed in the front court lead to counters. | H |
| **Exclusions drawn vs committed** | Every ejection by team. Drawing exclusions creates man-up chances. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Sprints won (start of each period) | Who wins the swim-off. Gives first possession. | H |
| Counter-attack goals and efficiency | Scores in transition within ~10 seconds of a steal. | M |
| Centre (hole-set) touches and outcome | Ball enters the centre; what follows (shot, exclusion, kick-out). | M |
| Goals by period | Compare quarters. | H |
| Assists | Passes directly before a goal. | M |
| Shot-clock violations and last-seconds shots | Poor use of possession time. | M |
| Blocks (field blocks) | Defenders who block a shot. | M |
| Penalty shot conversion | Both for and against. | H |
| Perimeter vs centre shot balance | Where goals come from. | M |
| Ejections: personal fouls and 3-foul exits | Players leaving the game. | H |

---

# 15. FIELD HOCKEY

**What decides games:** getting into the circle with control and finishing, winning penalty corners, and not conceding them. Analytical work on field hockey suggests most open-play circle shots have a low chance of scoring, and that penalty corners convert at a much higher rate than shots, so winning corners is a high-value goal.

**Log these events:** every circle entry (method, outcome), every shot (location in circle, outcome), every penalty corner (for/against, outcome), every turnover (zone), every card.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Circle entries and shots per entry** | Each time the ball enters the attacking circle with team control. Entry efficiency = shots (or corners) / entries. | H |
| **Shots, shots on goal, shot % and shot location** | Every shot and where in the circle. Shots from close range and in front of goal are higher quality. | H |
| **Penalty corners won and conversion %** | Each corner: for and against, and whether the shot scores. | H |
| **Penalty corner defence** | Goals conceded from corners, run-outs, successful defending. | H |
| **Turnovers by zone** | Especially in your own circle or defensive 25. | M |
| **Goalkeeper save %** | Saves / shots on goal. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| 25-yard-line entries | Each time the ball crosses into the attacking 25. | M |
| Entry method (carry, pass, dribble past defender) | Which entry type leads to shots. | M |
| Shots without defensive pressure | Shots where the defender is not in a position to block. | L |
| Second-chance shots / rebounds | Follow-up shots after a save or deflection. | M |
| Tackles won, interceptions | Defensive recoveries. | M |
| High-press turnovers (won in attacking half) | Where the ball is won. | M |
| Free hits and long corners | Set-piece plays and their outcomes. | M |
| Cards (green, yellow, red): who and when | Player discipline; reduced numbers. | H |
| Counter-attacks | Quick transitions after a turnover. | M |
| Goals by quarter | Starts and finishes of periods. | H |
| Possession in the attacking third | Where the team controls the ball. | L |

---

# 16. ICE HOCKEY

**What decides games:** shot attempt share (**Corsi**), shot quality (scoring chances and high-danger chances), special teams, and goaltending. Research on the neutral zone suggests controlled zone entries create more than twice as many shot attempts as dumping the puck in and chasing it.

**Log these events:** every shot attempt (shooter, location, outcome: goal / save / miss / block), every zone entry (carry/pass/dump, controlled or not), every exit, every faceoff, every penalty, every turnover.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Shot attempts (Corsi) for and against, and Corsi %** | Count all shot attempts: shots on goal, misses, blocks. CF% = attempts for / (for + against). | H |
| **Shots on goal and shot quality / high-danger chances** | Shots from the slot or close to the net, plus rebounds and one-timers from the middle. | M |
| **Zone entries: controlled vs dump** | Each time the puck crosses the blue line: carried or passed in with control vs dumped in. | M |
| **Power-play % and penalty-kill %** | Goals / opportunities each way. | H |
| **Goalie save % and high-danger save %** | Saves / shots, split by shot quality. | H |
| **Penalties taken vs drawn (and PIM)** | Every penalty, type, time. Discipline is a game decider. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Controlled zone exits | Leaving your own zone with possession vs a clear or turnover. | M |
| Faceoff % by zone | Offensive, neutral, defensive. Defensive-zone faceoff losses are dangerous. | H |
| Turnovers: giveaways and takeaways, by zone | Defensive-zone giveaways are the costly ones. | M |
| Rush chances for/against | Shots from odd-man rushes or breakaways. | M |
| Shot assists / passes leading to shots | The pass before the shot; passes across the slot are the most dangerous. | M |
| Rebound control | Second shots allowed or taken. | M |
| Net-front presence | Whether the team screens the goalie and gets rebounds. | M |
| Forecheck recoveries | Pucks won back in the offensive zone. | M |
| Goals by period | Strong starts/finishes. | H |
| Shift length and line changes | Long shifts lead to tired players. | M |
| Blocked shots | Defenders blocking shots. | H |

---

# 17. GOLF

**What decides rounds:** avoiding disasters and converting greens. Raw stats are limited (fairways hit or putts per round can mislead on their own), and the tour standard is **strokes gained**, which needs shot distances you cannot get from video. For a high-school club, scorecard-based stats are the realistic core. **Video is mostly useful for swing/pre-shot routine review and pace of play, not for stat logging.**

**Log these events:** each hole (score, fairway hit, green in regulation, putts, penalty strokes, up-and-down attempt and result).

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Scoring average (and score to par)** | Per round, per hole type (par 3 / 4 / 5). | H |
| **Greens in regulation (GIR %)** | Was the ball on the green in two shots under par? The number tracks closely with score: roughly 9 per round for 70s shooters, about 5 for 80s, under 4 for 90s. | M |
| **Scrambling / up-and-down %** | After missing a green, did the player make par or better? | M |
| **Putts per round and 3-putts** | Count putts. Three-putts are costly. Interpret with GIR (more greens = more long putts). | M |
| **Penalty strokes / lost balls / OB** | Each hazard or lost ball. | M |
| **Blow-up holes (double bogey or worse)** | A few big holes often decide a round. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Fairways hit % and driving distance | Tee shot lands in the fairway. Interpret with the miss: a missed fairway in the rough is different from one in the trees. | M |
| Par-5 and par-3 scoring | Scoring by hole type. | H |
| Sand save % | Up and down from a greenside bunker. | M |
| Proximity to hole on approach | Distance of the approach shot from the pin. | L |
| Short putts missed (inside 6 feet) | A pure execution stat. | L |
| Birdie/bogey ratio | Birdies vs bogeys. | H |
| First tee shot / opening-hole performance | Nerves and routine. | H |
| Pace of play | Time per hole. | M |

---

# 18. BADMINTON

**What decides matches:** how rallies end. Studies at elite level found unforced errors end roughly 40% of rallies, and the smash is the most common winning shot (around 29%). At lower levels, unforced errors dominate even more, so the main coaching target is cutting errors.

**Log these events:** every rally (server, winner, rally length in shots, last shot type, how it ended: winner / forced error / unforced error), every game score.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Unforced errors (count and % of rallies)** | Every rally that ends with the player hitting out or into the net without pressure. | M |
| **Winners and last-shot type** | Smash, drop, net shot, clear, serve. How each player finishes points. | H |
| **Points won on serve vs on return** | Rally winner by server. Shows serve-return strength. | H |
| **Forced vs unforced error split** | Was the error caused by pressure? | M |
| **Smash success %** | Smash attempts: winner / defended / error. | H |
| **Rally length distribution** | Short (1-4), medium (5-8), long (9+). Which rallies the player wins. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Serve type and result (short vs long) | Short serve to the front, long serve high to the back, and what happens next. | H |
| Net shot errors | Net shots have the highest error counts in some studies. | M |
| Defence: clear, lift, block success | Defending a smash or attack. | M |
| Third-shot quality (after the serve return) | The third shot decides control. | M |
| Court location of lost points (forehand/backhand, corners) | Where the player struggles. | M |
| Score at the mid-game interval (11) and lead retention | Comebacks and collapses. | H |
| Point streaks and momentum | Runs of 3+ points. | H |
| Doubles: front-back vs side-by-side formation switches | When the pair is attacking vs defending. | M |
| Rest time and recovery | Time between rallies. | M |
| Late-game performance (18+) | Points won when the score is tight. | H |

---

# 19. BOWLING

**What decides games:** strikes, and above all **not missing makeable spares**. Strike %, makeable-spare conversion and clean-frame rate are the key performance indicators. In high-school and college team bowling (Baker format), the **team's frame average** and each position's contribution also matter.

**Log these events:** every frame (first ball pins, second ball pins, which pins remained, strike/spare/open), the pin leave, the ball speed if available.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Strike %** | Strikes / first balls (frames 1-9 + the 10th). | H |
| **Spare conversion % (all spares)** | Spares made / spare attempts. | H |
| **Makeable spare %** (and single-pin spare %) | Any leave that should be converted (e.g. a single pin like the 10-pin, or 2-3 pin leaves). Missing a makeable spare costs several pins per game. | H |
| **Clean frames / open frames** | Frames with a strike or spare vs frames with an open. Clean-game rate is a headline stat. | H |
| **First-ball average and "9+" %** | Average pins on the first ball, and how often the first ball leaves 0-1 pins. | H |
| **Split leave % and split conversion** | How many splits are left and how many are converted. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Multi-pin spare conversion % | Leaves of two or more pins. | H |
| 10th-frame average | Pressure frame. | H |
| Strike streaks / consecutive strikes | Runs. | H |
| Pocket hit % (hit the headpin/1-3 pocket) | Whether the ball hits the pocket. Needs a clear lane view. | M |
| Pin carry | Strikes when the pocket is hit. Poor carry vs poor shot. | M |
| Frame-by-frame breakdown | Which frames the bowler is strongest/weakest at. | H |
| Baker (team) frame average and anchor performance | The format used in school competition. | H |
| Ball speed and rev rate | Needs a sensor. | L |
| Lane adjustments (breakpoint, boards) | Moving feet or target during a game. | L |
| Pin leaves by position (7-pin, 10-pin, etc.) | The most common pins left. | H |

---

# 20. FENCING

**What decides bouts:** which actions win touches and how the fencer responds under pressure. A notational study of epee found counterattacks had the highest success rate and parry-riposte had the highest risk of failure, so action-level success rates are the key coaching stat. In a senior international data set, about 38% of women's touches came in the third period and 27% of women's bouts went to priority (13% for men), so late-bout performance matters.

**Log these events:** every touch (who scored, action that scored: attack / parry-riposte / counter-attack / counter-time / remise-reprise / point in line, and the line or target), every period score, priority calls.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Touches scored and received, by period** | Scoreboard at each period break. Bouts are first to 15 (or 5 in pools) over three 3-minute periods. | H |
| **Scoring action breakdown** | What action scored each touch. Which actions win and which lose. | M |
| **Success % by action type** | Attack, parry-riposte, counterattack, counter-time, remise/reprise. | M |
| **Touches scored per attack attempt** | Attacks made vs touches scored. Shows efficiency vs wasted attacks. | M |
| **Priority/right-of-way outcomes (foil/sabre)** | Whose action the referee awards. | M |
| **Double-touch rate (epee)** | Both fencers score simultaneously. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| First touch scored % | Who scores first. | H |
| Comeback and lead-protection | Performance when trailing or leading by 3+. | H |
| Priority-period (sudden-death minute) win % | Pressure performance. | H |
| Distance preference | Do touches come at long or short distance? | M |
| Target (high/low line, flank) | Where touches land. | M |
| Footwork pattern: advance-lunge, flèche, balestra | Which footwork leads to touches or errors. | M |
| Blade actions: beats, feints, disengages | Setup actions. | L |
| Opponent habits: favorite action under pressure | Use it as a scouting tool (what they do at 12-12). | M |
| Cards and penalties | Yellow, red cards and penalty touches. | H |
| Tempo: time per touch, action frequency | Rhythm of the bout. | M |

---

# 21. GYMNASTICS

**What decides meets:** a routine score is the **start value (difficulty) minus execution deductions** (or D-score plus E-score at elite level). Coaches mostly control the deductions: falls, balance checks, form breaks, and landings. Also **hit rate** (routines without a fall) because team scoring typically counts the top routines and drops one, so a fall is very costly. Deduction sizes vary by level and code, so make them editable.

**Log these events:** every routine (athlete, event, start value, final score), every deduction (type, skill, size), every fall, landing quality.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Hit rate (routines without a fall)** | Percentage of routines completed without a fall. Team scoring consistency. | H |
| **Falls by event and by skill** | Every fall: where in the routine, on what skill. | H |
| **Execution score / deductions per routine** | Sum of deductions. | M |
| **Landing quality: stuck %, steps, lunges, hops** | Dismount or vault landing: stick, small step, large step, fall. A common point-saver. | H |
| **Start value achieved vs possible** | Did the athlete get credit for all intended skills and connections (special requirements, bonus)? | M |
| **Balance checks on beam** | Each wobble, arm swing, or check. Add up quickly. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Form breaks: bent knees, leg separation, flexed feet | Common small deductions repeated across a routine. | M |
| Bars: rhythm breaks, swing and handstand angles | Pauses, wasted swings, handstand reaching vertical. | M |
| Vault: height, distance, and landing | Post-flight height, distance, and control. | M |
| Floor: out-of-bounds, overtime, series connected | Steps out, time deductions, connected passes. | H |
| Beam: skill hit vs wobble per skill | Each skill graded as clean or not. | M |
| Rhythm and pauses (over 2 seconds) | Stops between skills. | M |
| Amplitude and height of leaps and saltos | Height reached. | M |
| Counting score contribution | Which athletes' scores count to the team total. | H |
| Pre-meet vs meet score difference | Performance under pressure. | H |
| Lineup order effect | Scores by position in the lineup. | H |
| Landing posture (chest, head, knee bend) | Details of the finish. | M |

---

# 22. CHEERLEADING

**What decides competitions:** a scoresheet of **execution and difficulty across stunts, pyramids, tumbling, jumps and dance**, with **deductions** for falls, drops and mistakes. Scoring systems differ by organization, so the stat set must match the sheet your league uses. The biggest swing is usually **a building fall or stunt drop**, which costs more than an individual athlete fall. The best routine is often the one with zero deductions ("hit zero").

**Log these events:** every skill (stunt, tumbling pass, jump, pyramid, toss) with a clean/error tag, every deduction (type, time), routine length, boundary violations.

### Tier 1

| Stat | What to look for in the video | Video |
|---|---|---|
| **Hit zero rate (routines with no major deductions)** | Routines performed with no falls, drops, or major errors. | H |
| **Stunt hit % and stunt drops** | Each stunt: held and dismounted cleanly, wobbled, or dropped. Count drops from the top person and base failures. | H |
| **Pyramid/toss hit %** | Pyramid collapse vs clean. | H |
| **Athlete falls (tumbling and jumps)** | Hands, knees, or head down on tumbling or jump skills. | H |
| **Deductions by type and total** | Fall, drop, bobble, boundary, time limit, and safety violation. Show the points lost per routine. | M |
| **Tumbling pass success % and form** | Each pass: landed, stepped, touched down, missed twist. | H |

### Tier 2

| Stat | What to look for in the video | Video |
|---|---|---|
| Stunt difficulty vs execution | Level of the stunt and quality (stability, catch quality). | M |
| Synchronization and timing | Whether the team hits jumps, motions, and tumbling in unison. | L |
| Jump execution (height, sharpness, together) | Team jumps are scored for height and unity. | M |
| Standing vs running tumbling counts | How many athletes tumble and at what level. | M |
| Dance: formations, spacing, transitions | Visual use of the floor. | M |
| Motion sharpness and cheer/chant volume | Stronger on the audio track. | L |
| Routine time and boundary violations | Time within the allowed limit and staying in bounds. | H |
| Transitions between sections | Smooth flow vs pauses. | M |
| Safety/legality violations | Illegal skills for the division. | M |
| Score progression meet to meet | Which categories improved. | H |
| Weakest stunt group | Which group or base has the most wobbles. | M |

---

## Suggested build order

1. **Basketball and lacrosse** first (your existing sheets, and event logging is high video reliability).
2. **Volleyball, soccer, football, baseball/softball**: every one of these is mostly an event log with high video reliability, and they have the biggest rosters.
3. **Hockey sports, water polo, tennis, wrestling**: reliable event logs, but fast action, so expect more review corrections.
4. **Swimming, track, cross country, bowling**: time-based. Very reliable if you take splits from timing marks on screen, but needs a camera that covers each marker.
5. **Golf, badminton, fencing, gymnastics, cheerleading**: judged or low-footage sports, mostly scorecard- or scoresheet-driven. Offer a manual-entry checklist with the AI helping where video exists.

---

## Sources

- Four Factors (basketball): Basketball-Reference (basketball-reference.com/about/factors.html), Hudl Blog, NBA.com Hawks "The Four Factors", KenPom blog.
- Lacrosse: Hudl Assist lacrosse stat list; NCAA lacrosse stat categories; USA Lacrosse "Beyond Basics: advanced metrics"; team season statistic pages (faceoffs, ground balls, clears, man-up).
- Volleyball: Hudl Blog ("Data Driven: using volleyball stats", "AI volleyball stats"); AVCA stat definitions; JVA Volleyball; Art of Coaching Volleyball notes.
- Soccer: Sportmonks glossary; Sky Sports "advanced stats explained" (xG, PPDA); Spiideo AutoData definitions; Wyscout data glossary.
- Football: Football Study Hall (Five Factors); On3 advanced-stats glossary; sportshighlight.net (success rate vs EPA); Coaches Insider.
- Baseball/softball: GameChanger analytics report (first-pitch strike, hard-hit balls, quality at-bats); Sports Illustrated "high school baseball data"; Little League "3 Stats Coaches Should Be Using"; ABCA Inside Pitch.
- Tennis: LTA stats glossary; Tennis Nerd; Tennis Abstract; WTA stats.
- Ice hockey: The Hockey News (neutral zone research); The Hockey Writers (analytics primer); Hockey-Reference advanced stats.
- Wrestling: NWCA Mat Stats.
- Water polo: Total Waterpolo; "6 on 5 Conversion Rates" (Harker); NCAA team stat pages.
- Swimming: SwimCloud race analysis guide; Frontiers in Physiology (underwater phases); JSSM (turn time and distance per stroke); SwimSwam race data breakdowns.
- Golf: MyGolfSpy ("3 stats that explain your score"); Data Golf; Practical Golf ("Pros vs Joes").
- Fencing: Bodai (notational analysis of epee); TheFencingCoach.com (when touches are scored).
- Badminton: JSSM (longitudinal Olympic analysis); Frontiers in Psychology (last-stroke analysis).
- Bowling: Bowling This Month; NTCA team statistics categories.
- Gymnastics: NBC Olympics scoring guide; College Gym News (judging); WPTV "Gymnastics 101".
- Cheerleading: Varsity USA deduction scoring guidelines; GHSA competitive cheerleading scoresheet; Cheer Canada scoresheets.
- Field hockey: Simon Blanford (field hockey analytics, xG); The Hockey Site; Spiideo AutoData Field Hockey.
- Cross country: USTFCCCA "Pacing Strategy: Can analytics help us run faster in cross country?"; MileSplit (1-5 split).
- Track: NCAA track and field FAQs; research on block starts and hurdle touchdown times.

Benchmarks quoted (e.g. 60-65% first serve, .300 hitting, 58% first-pitch strike) are rough levels from the sources above, mostly from pro or college data. Treat them as reference points and set your own school-level baselines after a few games of data.
