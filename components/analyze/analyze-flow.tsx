"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type GeminiFile } from "@/lib/client/api";
import { saveGameToTeam, type ReopenedGame } from "@/lib/client/save";
import type { PickableGame } from "@/lib/db/games";
import type { Sheet } from "@/lib/sheets";
import { realBackend, type Backend } from "@/lib/client/backend";
import type { Resolution } from "@/lib/client/run";
import { keptRanges, planSegments, totalSeconds } from "@/lib/client/segments";
import type { PossessionLog } from "@/lib/gemini/log-types";
import type { GameSetup } from "@/lib/gemini/prompt";
import { estimateCostUsd, recordRunSpeed, secondsPerVideoSecond } from "@/lib/gemini/pricing";
import { passesNeeded } from "@/lib/gemini/prompt";
import { defaultStatIds, getSport, SPORTS } from "@/lib/sports";
import { ReviewStep, type SaveOptions } from "./review-step";
import { RunStep, type RunState } from "./run-step";
import { SetupStep } from "./setup-step";
import { StepIndicator, type StepIndex } from "./step-indicator";
import { TeamGameStep, type TeamGameChoice } from "./team-game-step";
import { TrimStep, type TrimState } from "./trim-step";
import { UploadStep } from "./upload-step";

export type UploadState =
  | { status: "uploading"; progress: number }
  | { status: "processing" }
  | { status: "ready"; file: GeminiFile }
  | { status: "error"; message: string };

export type Estimate = { tokens: number; cost: number; seconds: number; measured: boolean } | null;

/** Rough tokens per second of video before a real count is available (docs disagree; section 16). */
const ROUGH_TOKENS_PER_SECOND: Record<Resolution, number> = { low: 100, high: 300 };
const APPEARANCE_SECONDS = 120;
const now = () => performance.now();
/** Length of the sample game when the /test page runs without a video. */
const NO_VIDEO_SECONDS = 36 * 60;

const basketballDefaults = (): GameSetup => ({
  sportId: "basketball",
  roslynColor: "",
  awayName: "",
  awayColor: "",
  roslynRoster: "",
  awayRoster: "",
  statIds: defaultStatIds(SPORTS.basketball),
});

/** The team this Analyze tab belongs to, with its games (real flow only; the simulation and the owner test have none). */
export type TeamContext = {
  id: string;
  slug: string;
  sport: "basketball" | "lacrosse";
  scheduled: PickableGame[];
  analyzed: PickableGame[];
  opponents: string[];
};

/** The game this person picked: a scheduled game (`id`), or one to be added on save (`id` null). */
type ChosenGame = { id: string | null; opponent: string; date: string; homeAway: "home" | "away"; reopened: boolean; scores: { roslyn: number | null; opponent: number | null } };

export function AnalyzeFlow({ makeBackend, demo = false, ownerToken, team }: { makeBackend?: () => Backend; demo?: boolean; team?: TeamContext; /** Owner-only Gemini test (from /admin): no game, skips the Roslyn check, saves nothing, counts toward nothing. */ ownerToken?: string }) {
  const testMode = Boolean(ownerToken);
  const [step, setStep] = useState<StepIndex>(0);
  const [reachable, setReachable] = useState<StepIndex>(0);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playable, setPlayable] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [trim, setTrim] = useState<TrimState>({ range: { start: 0, end: 0 }, skips: [] });
  const [setup, setSetup] = useState<GameSetup>(basketballDefaults);
  const [resolution, setResolution] = useState<Resolution>("low");
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [log, setLog] = useState<PossessionLog | null>(null);
  /** Player notes the user confirmed, plus what the AI added while watching (checked again on Review). */
  const [notes, setNotes] = useState<{ start: string; updates: string[] } | null>(null);
  /** Roslyn starters the user confirmed (plus/minus). Lives only for this run. */
  const [starterNumbers, setStarterNumbers] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const geminiName = useRef<string | null>(null);
  /** The real reason the last upload failed, so Analyze can show it instead of a generic message. */
  const uploadError = useRef<string | null>(null);
  /** Signed pass from the Roslyn-game check; every analysis request carries it. */
  const clearance = useRef<string | null>(null);
  /** The pass the real Roslyn-game check issued, kept so a finished game can be saved (the server refuses bypassed passes). */
  const savedClearance = useRef<string | null>(null);
  const [backend] = useState<Backend>(() => (makeBackend ? makeBackend() : realBackend));

  // ---------- the chosen game (real flow only; /test has no schedule) ----------
  const [game, setGame] = useState<ChosenGame | null>(null);
  const [saved, setSaved] = useState(false);

  function chooseGame(c: TeamGameChoice) {
    if (!team) return;
    setGame({ id: c.kind === "scheduled" ? c.id : null, opponent: c.opponent, date: c.date, homeAway: c.homeAway, reopened: false, scores: { roslyn: null, opponent: null } });
    setSaved(false);
    // The sport comes from the team and the opponent from the game, not from typing.
    setSetup((cur) => ({ ...cur, sportId: team.sport, awayName: c.opponent, statIds: cur.sportId === team.sport ? cur.statIds : defaultStatIds(SPORTS[team.sport]) }));
  }

  /** Opens an already saved game straight in the Review table (no video: nothing to upload or trim). */
  function reopenGame(r: ReopenedGame) {
    if (!team) return;
    setGame({ id: r.game.id, opponent: r.game.opponent, date: r.game.date, homeAway: "home", reopened: true, scores: { roslyn: r.game.our_score, opponent: r.game.opp_score } });
    setSaved(false);
    setSetup({ ...basketballDefaults(), sportId: team.sport, awayName: r.game.opponent, statIds: r.statIds.length > 0 ? r.statIds : defaultStatIds(SPORTS[team.sport]) });
    setStarterNumbers(r.starters);
    setNotes(null);
    setLog(r.log);
    setRun({ phase: "idle" });
    setReachable(4);
    setStep(4);
  }

  /** Starts over at the game picker. */
  function changeGame() {
    runAbort.current?.abort();
    uploadAbort.current?.abort();
    if (geminiName.current) void backend.deleteFile(geminiName.current);
    geminiName.current = null;
    clearance.current = null;
    savedClearance.current = null;
    setGame(null);
    setSaved(false);
    setFile(null);
    setVideoUrl(null);
    setDuration(null);
    setUpload(null);
    setLog(null);
    setNotes(null);
    setStarterNumbers([]);
    setRun({ phase: "idle" });
    setTrim({ range: { start: 0, end: 0 }, skips: [] });
    setSetup(basketballDefaults());
    setReachable(0);
    setStep(0);
  }

  async function saveGame(_sheets: Sheet[], opts: SaveOptions) {
    if (!game || !team || !log) return;
    if (!game.reopened && !savedClearance.current) throw new Error("This run didn't pass the Roslyn-game check, so it can't be saved. Run it again.");
    const payload = {
      team_id: team.id,
      ...(game.id ? { game_id: game.id } : { quick: { opponent_name: game.opponent, game_date: game.date, home_away: game.homeAway } }),
      reopen: game.reopened || undefined,
      clearance: game.reopened ? undefined : (savedClearance.current ?? undefined),
      source_filename: file?.name ?? null,
      our_score: opts.roslyn,
      opp_score: opts.opponent,
      stat_ids: setup.statIds,
      starters: starterNumbers,
      log: { possessions: log.possessions, scoreboard: log.scoreboard },
    };
    try {
      await saveGameToTeam(payload);
    } catch (err) {
      // Someone saved this game while it was being reviewed (or this is an edit): replacing needs an explicit yes.
      if (err instanceof ApiError && err.code === "needs_confirm") {
        if (!window.confirm(`${err.message} Saving again replaces what was saved.`)) throw new Error("Not saved.");
        await saveGameToTeam({ ...payload, confirm_replace: true });
      } else throw err;
    }
    setSaved(true);
  }

  const go = useCallback((s: StepIndex) => {
    setStep(s);
    setReachable((r) => (s > r ? s : r));
  }, []);

  /** Changing the trim or setup after a run makes the results stale: drop them. */
  function invalidateResults() {
    if (!log) return;
    setLog(null);
    setNotes(null);
    setRun({ phase: "idle" });
    setReachable((r) => (r > 3 ? 3 : r));
  }

  function changeTrim(next: TrimState) {
    // While dragging a handle, show that frame so the user sees where the game starts or ends.
    const v = videoRef.current;
    if (v && next.range.start !== trim.range.start) {
      v.pause();
      v.currentTime = next.range.start;
    } else if (v && next.range.end !== trim.range.end) {
      v.pause();
      v.currentTime = next.range.end;
    }
    invalidateResults();
    setTrim(next);
  }

  function changeSetup(next: GameSetup) {
    invalidateResults();
    setSetup(next);
  }

  /**
   * Keep playback inside the trimmed game: nothing before the start or after
   * the end can be watched. On Review, skipped breaks are jumped over too.
   */
  function clampPlayback(v: HTMLVideoElement) {
    const { start, end } = trim.range;
    if (end <= start) return;
    const t = v.currentTime;
    if (t < start - 0.05) v.currentTime = start;
    else if (t > end + 0.05 || (t >= end && !v.paused)) {
      v.pause();
      v.currentTime = end;
    } else if (step === 4) {
      const inBreak = trim.skips.find((b) => t >= b.start && t < b.end);
      if (inBreak) v.currentTime = Math.min(end, inBreak.end);
    }
  }

  // ---------- upload (starts immediately, runs in the background) ----------
  const startUpload = useCallback(async (f: File) => {
    uploadAbort.current?.abort();
    const ctrl = new AbortController();
    uploadAbort.current = ctrl;
    setUpload({ status: "uploading", progress: 0 });
    uploadError.current = null;
    try {
      const uploaded = await backend.upload(f, (p) => setUpload({ status: "uploading", progress: p }), ctrl.signal);
      geminiName.current = uploaded.name;
      setUpload({ status: "processing" });
      const active = await backend.waitForActive(uploaded.name, ctrl.signal);
      setUpload({ status: "ready", file: active });
      return active;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      if (!ctrl.signal.aborted) {
        uploadError.current = message;
        setUpload({ status: "error", message });
      }
      return null;
    }
  }, [backend]);

  /** null = demo without a video: a fixed-length sample game and no preview. */
  function pickFile(f: File | null) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (geminiName.current) void backend.deleteFile(geminiName.current);
    geminiName.current = null;
    const picked = f ?? new File([], "Sample game (no video)", { type: "video/mp4" });
    setFile(picked);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
    setDuration(f ? null : NO_VIDEO_SECONDS);
    setPlayable(Boolean(f));
    setLog(null);
    setRun({ phase: "idle" });
    setTrim({ range: { start: 0, end: f ? 0 : NO_VIDEO_SECONDS }, skips: [] });
    void startUpload(picked);
    go(1);
  }

  // Delete from Gemini if the tab closes; revoke the local preview.
  useEffect(() => {
    const onUnload = () => geminiName.current && void backend.deleteFile(geminiName.current);
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [backend]);
  useEffect(() => () => void (videoUrl && URL.revokeObjectURL(videoUrl)), [videoUrl]);

  // ---------- estimate (updates live as the trim changes) ----------
  const ranges = useMemo(() => keptRanges(trim.range, trim.skips), [trim]);
  const segments = useMemo(() => planSegments(ranges), [ranges]);
  const keptSeconds = totalSeconds(ranges);
  const watchedSeconds = segments.reduce((s, seg) => s + (seg.watch.end - seg.watch.start), 0);
  const readyFile = upload?.status === "ready" ? upload.file : null;

  const passCount = passesNeeded(getSport(setup.sportId)!, setup.statIds).length;
  // Calibrated speed from past runs (localStorage), read once on the client.
  const [speed] = useState(() => (typeof window === "undefined" ? 0.35 : secondsPerVideoSecond()));
  const estimateKey = `${readyFile?.uri ?? ""}|${resolution}|${segments.map((s) => `${s.watch.start}-${s.watch.end}`).join(",")}`;
  const [measured, setMeasured] = useState<{ key: string; tokens: number } | null>(null);

  const estimate: Estimate = useMemo(() => {
    if (watchedSeconds <= 0) return null;
    const longest = Math.max(...segments.map((s) => s.watch.end - s.watch.start));
    // Each pass re-watches the video (cost × passes); passes 2 and 3 run together after pass 1 (time × 2).
    const seconds = longest * speed * (passCount > 1 ? 2 : 1) + 30;
    const real = measured?.key === estimateKey ? measured.tokens : null;
    const tokens = (real ?? watchedSeconds * ROUGH_TOKENS_PER_SECOND[resolution]) * passCount;
    return { tokens, cost: estimateCostUsd(tokens, watchedSeconds * passCount), seconds, measured: real !== null };
  }, [watchedSeconds, segments, speed, measured, estimateKey, resolution, passCount]);

  // Real count via count_tokens, debounced while the user drags.
  useEffect(() => {
    if (!readyFile || watchedSeconds <= 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const counts = await Promise.all(segments.map((s) => backend.countTokens(readyFile, s.watch, resolution)));
        if (cancelled || counts.some((c) => c === null)) return;
        setMeasured({ key: estimateKey, tokens: counts.reduce<number>((s, c) => s + (c ?? 0), 0) });
      } catch {
        /* keep the rough estimate */
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [segments, watchedSeconds, resolution, readyFile, estimateKey, backend]);

  // ---------- run ----------
  async function analyze() {
    runAbort.current?.abort();
    const ctrl = new AbortController();
    runAbort.current = ctrl;
    const started = now();
    try {
      let gfile = readyFile;
      if (!gfile) {
        setRun({ phase: "uploading" });
        gfile = file ? await (upload?.status === "error" || !geminiName.current ? startUpload(file) : backend.waitForActive(geminiName.current, ctrl.signal)) : null;
        if (!gfile) throw new ApiError(uploadError.current ?? "The upload didn't finish. Check your connection and try again.", 0);
      }
      // The Roslyn-game check runs first and gates everything else (owner unlock aside, no bypass).
      setRun({ phase: "gate" });
      const whole = { start: ranges[0].start, end: ranges[ranges.length - 1].end };
      const gate = await backend.gate(gfile, whole, setup.sportId, ctrl.signal, ownerToken);
      if (!gate.pass) {
        await cleanupGemini();
        setRun({ phase: "rejected", reason: gate.reason });
        return;
      }
      clearance.current = gate.clearance;
      savedClearance.current = gate.bypass ? null : gate.clearance;
      const video = { file: gfile, resolution, clearance: gate.clearance };
      const runSetup: GameSetup = { ...setup };

      setRun({ phase: "appearance" });
      const first = ranges[0];
      const appearance = await backend.appearance({ start: first.start, end: Math.min(first.end, first.start + APPEARANCE_SECONDS) }, video, runSetup, ctrl.signal);
      // Pause for the user to correct the notes; continueRun picks up from here.
      setRun({ phase: "notes", appearance, started, evidence: gate.evidence });
    } catch (err) {
      failRun(err, ctrl);
    }
  }

  async function continueRun(confirmedNotes: string, starters: { roslyn: string[]; opponent: string[] }) {
    const ctrl = runAbort.current ?? new AbortController();
    const started = run.phase === "notes" ? run.started : now();
    try {
      const gfile = readyFile!;
      const runSetup: GameSetup = {
        ...setup,
        appearanceNotes: confirmedNotes,
        starters: { roslyn: starters.roslyn.filter(Boolean), opponent: starters.opponent.filter(Boolean) },
      };
      setStarterNumbers(starters.roslyn.filter(Boolean));
      setRun({ phase: "logging", done: 0, total: segments.length * passCount, started });
      const result = await backend.possessionLog(segments, { file: gfile, resolution, clearance: clearance.current ?? undefined }, runSetup, ctrl.signal, (done, total) =>
        setRun({ phase: "logging", done, total, started }),
      );
      setRun({ phase: "checking" });
      const longest = Math.max(...segments.map((s) => s.watch.end - s.watch.start));
      if (backend.calibrates) recordRunSpeed((now() - started) / 1000, longest);
      setRun({ phase: "building" });
      setLog(result.log);
      setNotes({ start: confirmedNotes, updates: result.noteUpdates });
      setRun({ phase: "done", usage: result.usage, raw: result.raw });
      await cleanupGemini();
      go(4);
    } catch (err) {
      failRun(err, ctrl);
    }
  }

  function failRun(err: unknown, ctrl: AbortController) {
    if (ctrl.signal.aborted) return setRun({ phase: "idle" });
    setRun({ phase: "error", message: err instanceof Error ? err.message : "Analysis failed." });
    void cleanupGemini();
  }

  async function cleanupGemini() {
    const name = geminiName.current;
    geminiName.current = null;
    clearance.current = null;
    if (name) await backend.deleteFile(name);
    setUpload(null);
  }

  function cancelRun() {
    runAbort.current?.abort();
    setRun({ phase: "idle" });
  }

  function seek(t: number) {
    const clamped = trim.range.end > trim.range.start ? Math.min(trim.range.end, Math.max(trim.range.start, t)) : t;
    const v = videoRef.current;
    if (v) v.currentTime = clamped;
    setCurrentTime(clamped);
  }

  const showVideo = videoUrl && (step === 1 || step === 4);

  return (
    <div>
      {testMode && (
        <p role="status" className="mb-5 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
          Owner test. This runs on real Gemini with any video, but nothing is saved and it doesn&apos;t count toward any game or season.
        </p>
      )}
      <StepIndicator current={step} reachable={file ? reachable : 0} onGo={go} firstLabel={demo || testMode ? "Upload" : "Game"} />

      {game && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">
            {team?.sport === "lacrosse" ? "Lacrosse" : "Basketball"} {game.homeAway === "home" ? "vs." : "at"} {game.opponent}
          </span>
          {!saved && (
            <button type="button" className="btn btn-ghost min-h-9 px-2 text-sm" onClick={changeGame}>
              Choose a different game
            </button>
          )}
          {game.reopened && <span className="text-muted">Editing a saved game. There is no video here, so clicking a row can&apos;t jump to the footage.</span>}
        </div>
      )}

      {file && step !== 0 && <UploadStatus upload={upload} fileName={file.name} onRetry={() => file && void startUpload(file)} />}

      {!videoUrl && file && step === 1 && (
        <div className="mt-6 flex min-h-28 items-center justify-center rounded-[0.875rem] bg-surface-sunken px-6 py-6 text-center text-muted">
          No video loaded. The simulation uses a {Math.round(NO_VIDEO_SECONDS / 60)}-minute sample game; drag the handles to see the estimate change.
        </div>
      )}

      {videoUrl && (
        <div className={showVideo ? "mt-6" : "hidden"}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            className="mx-auto max-h-[min(46vh,28rem)] w-full rounded-[0.875rem] bg-black object-contain"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
                setTrim((t) => (t.range.end === 0 ? { ...t, range: { start: 0, end: d } } : t));
              }
            }}
            onError={() => setPlayable(false)}
            onTimeUpdate={(e) => {
              clampPlayback(e.currentTarget);
              setCurrentTime(e.currentTarget.currentTime);
            }}
            onSeeking={(e) => clampPlayback(e.currentTarget)}
            onPlay={(e) => clampPlayback(e.currentTarget)}
          />
        </div>
      )}

      <div className={step === 1 ? "mt-4" : "mt-8"}>
        {step === 0 &&
          (demo || testMode || game ? (
            <UploadStep onPick={pickFile} onNoVideo={demo ? () => pickFile(null) : undefined} demo={demo} />
          ) : team ? (
            <TeamGameStep scheduled={team.scheduled} analyzed={team.analyzed} opponents={team.opponents} onChoose={chooseGame} onReopen={reopenGame} />
          ) : null)}
        {step === 1 && (
          <>
            <TrimStep
              duration={duration}
              canPreview={playable || !videoUrl}
              hasPlayhead={Boolean(videoUrl) && playable}
              trim={trim}
              onTrim={changeTrim}
              currentTime={currentTime}
              onSeek={seek}
              onBack={() => go(0)}
              onNext={() => go(2)}
            />
            {estimate && keptSeconds > 0 && (
              <p className="mt-4 text-sm text-muted tabular-nums">
                Estimate: about ${estimate.cost.toFixed(2)} and {Math.max(1, Math.round(estimate.seconds / 60))} min for{" "}
                {Math.round(keptSeconds / 60)} min of game{estimate.measured ? "" : " (rough until the upload finishes)"}.
              </p>
            )}
          </>
        )}
        {step === 2 && <SetupStep setup={setup} onChange={changeSetup} onBack={() => go(1)} onNext={() => go(3)} locked={Boolean(game)} />}
        {step === 3 && (
          <RunStep
            keptSeconds={keptSeconds}
            segments={segments.length}
            passes={passCount}
            estimate={estimate}
            resolution={resolution}
            onResolution={setResolution}
            upload={upload}
            run={run}
            onAnalyze={analyze}
            onContinue={continueRun}
            starterBoxes={setup.statIds.includes("plus-minus") ? (getSport(setup.sportId)?.playersPerSide ?? 0) : 0}
            awayName={setup.awayName || "Opponent"}
            onCancel={cancelRun}
            onBack={() => {
              if (run.phase === "rejected") setRun({ phase: "idle" });
              go(2);
            }}
            onNewVideo={() => {
              setRun({ phase: "idle" });
              go(0);
            }}
            demo={demo}
          />
        )}
        {step === 4 && log && (
          <>
            {testMode && (
              <p role="status" className="mb-6 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
                Test results. Nothing here is saved or counted toward any game or season.
              </p>
            )}
            {demo && (
              <p role="status" className="mb-6 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
                Simulated results. These numbers were randomly generated to show how review works. Don&apos;t copy them into the club&apos;s sheets.
              </p>
            )}
            <ReviewStep log={log} onLog={setLog} setup={setup} starters={starterNumbers} demo={demo} onSeek={seek} playerNotes={notes} save={game && team ? { saved, onSave: saveGame, scores: game.scores, reopened: game.reopened, scheduleHref: `/t/${team.slug}` } : undefined} usage={run.phase === "done" ? run.usage : null} raw={run.phase === "done" ? run.raw : []} />
          </>
        )}
      </div>
    </div>
  );
}

function UploadStatus({ upload, fileName, onRetry }: { upload: UploadState | null; fileName: string; onRetry: () => void }) {
  if (!upload) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" role="status">
      <span className="max-w-[16rem] truncate font-medium">{fileName}</span>
      {upload.status === "uploading" && (
        <>
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-sunken">
            <span className="block h-full origin-left bg-accent" style={{ transform: `scaleX(${upload.progress})` }} />
          </span>
          <span className="text-muted tabular-nums">Uploading {Math.round(upload.progress * 100)}%</span>
        </>
      )}
      {upload.status === "processing" && <span className="text-muted">Uploaded. Gemini is processing the video…</span>}
      {upload.status === "ready" && <span className="text-muted">Ready to analyze</span>}
      {upload.status === "error" && (
        <>
          <span className="text-danger">{upload.message}</span>
          <button type="button" className="btn btn-ghost min-h-9 px-2 text-sm" onClick={onRetry}>
            Retry upload
          </button>
        </>
      )}
    </div>
  );
}
