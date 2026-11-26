"use client";

import { NO_VIDEO_SECONDS } from "@/lib/demo/constants";
import { autoSaveScore } from "@/lib/analysis/final-score";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, type GeminiFile } from "@/lib/client/api";
import { saveGameToTeam, type ReopenedGame } from "@/lib/client/save";
import { deriveStatus, statusText, type SessionStatus } from "@/lib/analysis/status";
import type { Sheet } from "@/lib/sheets";
import { realBackend, type Backend } from "@/lib/client/backend";
import type { Resolution } from "@/lib/client/run";
import { keptRanges, planSegments, totalSeconds } from "@/lib/client/segments";
import type { PossessionLog } from "@/lib/gemini/log-types";
import type { GameSetup } from "@/lib/gemini/prompt";
import { estimateCostUsd, recordRunSpeed, secondsPerVideoSecond } from "@/lib/gemini/pricing";
import { estimate as registryEstimate, tokensPerSecond } from "@/lib/sports/estimate";
import { getRegistrySport, modelForSport } from "@/lib/sports/registry";
import { passesNeeded } from "@/lib/gemini/prompt";
import { defaultStatIds, getSport, SPORTS, usesPossessionLog } from "@/lib/sports";
import { planChunks } from "@/lib/sports/request-builder";
import type { RegistryLog } from "@/lib/sports/registry-log";
import { RegistryReview } from "./registry-review";
import { ReviewStep, type SaveOptions } from "./review-step";
import { RunStep, type RunState } from "./run-step";
import { SetupStep } from "./setup-step";
import { StepIndicator, type StepIndex } from "./step-indicator";
import { TrimStep, type TrimState } from "./trim-step";
import { UploadStep } from "./upload-step";

export type UploadState =
  | { status: "uploading"; progress: number }
  | { status: "processing" }
  | { status: "ready"; file: GeminiFile }
  | { status: "error"; message: string };

export type Estimate = { tokens: number; cost: number; seconds: number; measured: boolean } | null;

/** What a run will use, read from the sport registry: shown above the Analyze button. */
export type RunPlan = { modelName: string; fps: number; priceChangeNote: string | null; gameEstimateUsd: number; footageMinutes: number };

const noSubscribe = () => () => {};
const todayIso = () => new Date().toISOString().slice(0, 10);
const APPEARANCE_SECONDS = 120;
const now = () => performance.now();

const basketballDefaults = (): GameSetup => ({
  sportId: "basketball",
  roslynColor: "",
  awayName: "",
  awayColor: "",
  roslynRoster: "",
  awayRoster: "",
  statIds: defaultStatIds(SPORTS.basketball),
});

/** The team an analysis belongs to (real flow only; the simulation and the owner test have none). */
export type TeamContext = { id: string; slug: string; sport: string };

/** The game this person picked: a scheduled game (`id`), or one to be added on save (`id` null). */
export type ChosenGame = { id: string | null; opponent: string; date: string; homeAway: "home" | "away"; reopened: boolean; scores: { roslyn: number | null; opponent: number | null } };

export type FlowReport = { status: SessionStatus; detail: string; saved: boolean };

export function AnalyzeFlow({ makeBackend, demo = false, ownerToken, team, initialGame, initialReopen, claimToken, onReport, onClose, onSaved }: { makeBackend?: () => Backend; demo?: boolean; team?: TeamContext; /** The game this analysis is for (chosen on the Analyze tab, already claimed). */ initialGame?: ChosenGame; /** A saved game opened for editing: starts on Review. */ initialReopen?: ReopenedGame; /** The token that holds this game's claim; proves a save comes from whoever is analyzing it. */ claimToken?: string; /** Says what this analysis is doing (the dot on its tile). */ onReport?: (r: FlowReport) => void; /** Closes this analysis (gives the game back). */ onClose?: () => void; /** Called after a game is saved, so the page can refresh the schedule and the "analyzed" checkmarks. */ onSaved?: () => void; /** Owner-only Gemini test (from /admin): no game, skips the Roslyn check, saves nothing, counts toward nothing. */ ownerToken?: string }) {
  const testMode = Boolean(ownerToken);
  const [step, setStep] = useState<StepIndex>(initialReopen ? 4 : 0);
  const [reachable, setReachable] = useState<StepIndex>(initialReopen ? 4 : 0);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playable, setPlayable] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [trim, setTrim] = useState<TrimState>({ range: { start: 0, end: 0 }, skips: [] });
  const [setup, setSetup] = useState<GameSetup>(() => {
    if (!team || !initialGame) return basketballDefaults();
    const config = SPORTS[team.sport];
    const statIds = initialReopen && initialReopen.statIds.length > 0 ? initialReopen.statIds : config ? defaultStatIds(config) : [];
    return { ...basketballDefaults(), sportId: team.sport, awayName: initialGame.opponent, statIds };
  });
  const [resolution, setResolution] = useState<Resolution>("low");
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [log, setLog] = useState<PossessionLog | null>(initialReopen?.log ?? null);
  /** Result of a run for sports that use the registry event log (everything but basketball and lacrosse). */
  const [registryLog, setRegistryLog] = useState<RegistryLog | null>(null);
  /** The simulation and the owner test ask for the sport on the first step, before any video. */
  const [sportChosen, setSportChosen] = useState(false);
  /** Player notes the user confirmed, plus what the AI added while watching (checked again on Review). */
  const [notes, setNotes] = useState<{ start: string; updates: string[] } | null>(null);
  /** Roslyn starters the user confirmed (plus/minus). Lives only for this run. */
  const [starterNumbers, setStarterNumbers] = useState<string[]>(initialReopen?.starters ?? []);

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

  // ---------- the game (chosen on the Analyze tab, claimed there; see components/analysis/sessions-provider.tsx) ----------
  const [game] = useState<ChosenGame | null>(initialGame ?? null);
  const [saved, setSaved] = useState(false);
  /** A saved game was changed after it was opened or saved. */
  const [dirty, setDirty] = useState(false);
  /** The game this run was saved to. Later saves (after fixing a row) update that same game, never add another. */
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  /** The app saved the AI's log by itself when the run finished (nobody has reviewed it yet). */
  const [autoSaved, setAutoSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);

  /**
   * Stores a log in the database. The same call serves the Save button and the automatic save at the end of a run.
   * `starters` and `statIds` are passed in because the automatic save runs before state has caught up.
   */
  async function persist(logToSave: PossessionLog, args: { roslyn: number | null; opponent: number | null; starters: string[]; statIds: string[]; auto: boolean }) {
    if (!game || !team) return;
    if (!game.reopened && !savedClearance.current && savedGameId === null) throw new Error("This run didn't pass the Roslyn-game check, so it can't be saved. Run it again.");
    const gameId = savedGameId ?? game.id;
    // Saved once already (from this run, or an opened saved game): this save replaces it, and the person just said yes to that.
    const replacing = game.reopened || savedGameId !== null;
    const payload = {
      team_id: team.id,
      ...(gameId ? { game_id: gameId } : { quick: { opponent_name: game.opponent, game_date: game.date, home_away: game.homeAway } }),
      reopen: replacing || undefined,
      confirm_replace: replacing || undefined,
      clearance: replacing ? undefined : (savedClearance.current ?? undefined),
      claim_token: claimToken,
      auto: args.auto || undefined,
      our_score: args.roslyn,
      opp_score: args.opponent,
      stat_ids: args.statIds,
      starters: args.starters,
      log: { possessions: logToSave.possessions, scoreboard: logToSave.scoreboard },
    };
    let result: { game_id: string };
    try {
      result = await saveGameToTeam(payload);
    } catch (err) {
      // Someone saved this game while it was being reviewed: replacing needs an explicit yes (never for the automatic save).
      if (err instanceof ApiError && err.code === "needs_confirm" && !args.auto) {
        if (!window.confirm(`${err.message} Saving again replaces what was saved.`)) throw new Error("Not saved.");
        result = await saveGameToTeam({ ...payload, confirm_replace: true });
      } else throw err;
    }
    setSavedGameId(result.game_id);
    setSaved(true);
    setAutoSaved(args.auto);
    setSaveFailed(null);
    setDirty(false);
    onSaved?.();
  }

  async function saveGame(_sheets: Sheet[], opts: SaveOptions) {
    if (!log) return;
    await persist(log, { roslyn: opts.roslyn, opponent: opts.opponent, starters: starterNumbers, statIds: setup.statIds, auto: false });
  }

  const go = useCallback((s: StepIndex) => {
    setStep(s);
    setReachable((r) => (s > r ? s : r));
  }, []);

  /** Changing the trim or setup after a run makes the results stale: drop them. */
  function invalidateResults() {
    if (!log && !registryLog) return;
    setLog(null);
    setRegistryLog(null);
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

  function pickSport(sportId: string) {
    const config = getSport(sportId);
    setSportChosen(true);
    changeSetup({ ...setup, sportId, statIds: config ? defaultStatIds(config) : [], registryStatIds: undefined });
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
    setRegistryLog(null);
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

  // Leaving the page (close, reload, another site) loses an unsaved run: ask first, and give the game back if they go.
  const unsaved = (run.phase !== "idle" && run.phase !== "error" && run.phase !== "rejected" && run.phase !== "done") || ((log !== null && !saved && !game?.reopened) || registryLog !== null);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  useEffect(() => {
    return () => {
      // This analysis is being closed: stop work and clean up. (The claim on the game is given back by the sessions provider.)
      runAbort.current?.abort();
      uploadAbort.current?.abort();
      if (geminiName.current) void backend.deleteFile(geminiName.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- tell the sessions list what this analysis is doing (the dot on its tile) ----------
  const statusInput = {
    phase: run.phase,
    hasResults: Boolean(log) || Boolean(registryLog),
    // An opened saved game counts as saved until it is changed.
    saved: (saved || Boolean(game?.reopened && !dirty)) && !saving,
    savable: Boolean(team && game && usesPossessionLog(setup.sportId)),
    saving,
    saveFailed: saveFailed !== null,
  };
  const reportStatus = deriveStatus(statusInput);
  const reportDetail = statusText({ ...statusInput, step });
  useEffect(() => {
    onReport?.({ status: reportStatus, detail: reportDetail, saved: statusInput.saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportStatus, reportDetail, statusInput.saved]);

  // ---------- estimate (updates live as the trim changes) ----------
  const ranges = useMemo(() => keptRanges(trim.range, trim.skips), [trim]);
  const segments = useMemo(() => planSegments(ranges), [ranges]);
  const keptSeconds = totalSeconds(ranges);
  const watchedSeconds = segments.reduce((s, seg) => s + (seg.watch.end - seg.watch.start), 0);
  const readyFile = upload?.status === "ready" ? upload.file : null;

  const pipeline = usesPossessionLog(setup.sportId);
  const passCount = pipeline ? passesNeeded(getSport(setup.sportId)!, setup.statIds).length : 1;
  // Calibrated speed from past runs (localStorage), read once on the client.
  const [speed] = useState(() => (typeof window === "undefined" ? 0.35 : secondsPerVideoSecond()));
  const estimateKey = `${readyFile?.uri ?? ""}|${resolution}|${segments.map((s) => `${s.watch.start}-${s.watch.end}`).join(",")}`;
  const [measured, setMeasured] = useState<{ key: string; tokens: number } | null>(null);

  // Model, fps and footage length for this sport come from the registry (lib/sports).
  const regSport = getRegistrySport(setup.sportId)!;
  const regModel = modelForSport(regSport);
  const fps = regSport.analysis.fps;
  // Today's date (prices change on set dates). Read after mount: reading the clock while rendering is not allowed here.
  const today = useSyncExternalStore(noSubscribe, todayIso, () => null);
  const plan: RunPlan | undefined = useMemo(() => {
    if (!today) return undefined;
    const g = registryEstimate(regSport, regModel, fps, regSport.analysis.footageMinutes, today);
    return { modelName: regModel.displayName, fps, priceChangeNote: g.priceChange?.note ?? null, gameEstimateUsd: g.costUsd, footageMinutes: regSport.analysis.footageMinutes };
  }, [regSport, regModel, fps, today]);

  const estimate: Estimate = useMemo(() => {
    if (watchedSeconds <= 0 || !today) return null;
    const longest = Math.max(...segments.map((s) => s.watch.end - s.watch.start));
    // Each pass re-watches the video (cost × passes); passes 2 and 3 run together after pass 1 (time × 2).
    const seconds = longest * speed * (passCount > 1 ? 2 : 1) + 30;
    const real = measured?.key === estimateKey ? measured.tokens : null;
    const tokens = (real ?? watchedSeconds * tokensPerSecond(regModel, fps, resolution)) * passCount;
    return { tokens, cost: estimateCostUsd(tokens, watchedSeconds * passCount, regModel, regSport.analysis.footageMinutes, today), seconds, measured: real !== null };
  }, [watchedSeconds, segments, speed, measured, estimateKey, resolution, passCount, regModel, regSport, fps, today]);

  // Real count via count_tokens, debounced while the user drags.
  useEffect(() => {
    if (!readyFile || watchedSeconds <= 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const counts = await Promise.all(segments.map((s) => backend.countTokens(readyFile, s.watch, resolution, setup.sportId)));
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
  }, [segments, watchedSeconds, resolution, readyFile, estimateKey, backend, setup.sportId]);

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

      if (!pipeline) {
        // Registry event log: no player-notes step; straight to logging in 10-minute chunks.
        const chunks = ranges.flatMap((r) => planChunks(r.start, r.end));
        setRun({ phase: "logging", done: 0, total: chunks.length, started });
        const result = await backend.registryLog(chunks, video, runSetup, ctrl.signal, (done, total) => setRun({ phase: "logging", done, total, started }));
        setRun({ phase: "building" });
        if (backend.calibrates) recordRunSpeed((now() - started) / 1000, Math.max(...chunks.map((c) => c.end - c.start)));
        setRegistryLog(result.log);
        setRun({ phase: "done", usage: result.usage, raw: result.raw });
        await cleanupGemini();
        go(4);
        return;
      }

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
      // A finished game saves itself, so Season trends update without anyone pressing a button. Whoever reviews it
      // later can fix a row and save again (that replaces this save). Test runs and the simulation never save.
      if (team && game && !demo && !testMode && savedClearance.current && result.log.possessions.length > 0) {
        setSaving(true);
        try {
          const score = autoSaveScore(game.scores, result.log.scoreboard);
          await persist(result.log, { roslyn: score.roslyn, opponent: score.opponent, starters: starters.roslyn.filter(Boolean), statIds: setup.statIds, auto: true });
        } catch (err) {
          setSaveFailed(err instanceof Error ? err.message : "It didn't save.");
        } finally {
          setSaving(false);
        }
      }
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
      <StepIndicator current={step} reachable={file ? reachable : 0} onGo={go} firstLabel="Upload" />

      {game && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">
            {getRegistrySport(team?.sport ?? "basketball")?.name ?? "Game"} {game.homeAway === "home" ? "vs." : "at"} {game.opponent}
          </span>
          {onClose && (
            <button
              type="button"
              className="btn btn-ghost min-h-9 px-2 text-sm"
              onClick={() => {
                const running = run.phase !== "idle" && run.phase !== "error" && run.phase !== "rejected" && run.phase !== "done";
                if ((running || (registryLog !== null) || (log !== null && !saved && !game.reopened)) && !window.confirm("Close this analysis? Anything that isn't saved is lost.")) return;
                onClose();
              }}
            >
              {saved || game.reopened ? "Close" : "Close this analysis"}
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
        {step === 0 && (demo || testMode || game) && (
          <UploadStep onPick={pickFile} onNoVideo={demo ? () => pickFile(null) : undefined} demo={demo} sport={game ? undefined : { value: sportChosen ? setup.sportId : null, onPick: pickSport }} />
        )}
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
            plan={plan}
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
        {step === 4 && registryLog && !log && (
          <>
            {demo && (
              <p role="status" className="mb-6 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
                Simulated results. These events were randomly generated from this sport&apos;s stat list to show how review works. Don&apos;t copy them anywhere.
              </p>
            )}
            {testMode && (
              <p role="status" className="mb-6 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
                Test results. Nothing here is saved or counted toward any game or season.
              </p>
            )}
            <RegistryReview log={registryLog} onLog={setRegistryLog} setup={setup} onSeek={seek} demo={demo} />
          </>
        )}
        {step === 4 && log && (
          <>
            {autoSaved && saved && (
              <p role="status" className="mb-6 rounded-[0.75rem] border border-border bg-surface-sunken px-4 py-3 text-sm">
                <span className="font-medium">Saved automatically.</span> This game&apos;s stats are in the database and Season trends already include them. Nobody has checked the AI&apos;s log yet: look it over, fix any row that&apos;s wrong, and press Save game to replace the saved version.
              </p>
            )}
            {saveFailed && (
              <p role="alert" className="mb-6 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
                The game didn&apos;t save by itself ({saveFailed}). The results below are still here: press Save game.
              </p>
            )}
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
            <ReviewStep log={log} onLog={(next) => {
                setLog(next);
                // A fix after saving brings the save button back, so the fix isn't lost.
                setSaved(false);
                setDirty(true);
                setAutoSaved(false);
              }} setup={setup} starters={starterNumbers} demo={demo} onSeek={seek} playerNotes={notes} save={game && team ? { saved, onSave: saveGame, scores: game.scores, reopened: game.reopened, scheduleHref: `/t/${team.slug}` } : undefined} usage={run.phase === "done" ? run.usage : null} raw={run.phase === "done" ? run.raw : []} />
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
