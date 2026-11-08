"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type GeminiFile } from "@/lib/client/api";
import { realBackend, type Backend } from "@/lib/client/backend";
import type { Resolution } from "@/lib/client/run";
import { keptRanges, planSegments, totalSeconds } from "@/lib/client/segments";
import type { PossessionLog } from "@/lib/gemini/log-types";
import type { GameSetup } from "@/lib/gemini/prompt";
import { estimateCostUsd, recordRunSpeed, secondsPerVideoSecond } from "@/lib/gemini/pricing";
import { defaultStatIds, SPORTS } from "@/lib/sports";
import { ReviewStep } from "./review-step";
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

export function AnalyzeFlow({ makeBackend, demo = false }: { makeBackend?: () => Backend; demo?: boolean }) {
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const geminiName = useRef<string | null>(null);
  const [backend] = useState<Backend>(() => (makeBackend ? makeBackend() : realBackend));

  const go = useCallback((s: StepIndex) => {
    setStep(s);
    setReachable((r) => (s > r ? s : r));
  }, []);

  // ---------- upload (starts immediately, runs in the background) ----------
  const startUpload = useCallback(async (f: File) => {
    uploadAbort.current?.abort();
    const ctrl = new AbortController();
    uploadAbort.current = ctrl;
    setUpload({ status: "uploading", progress: 0 });
    try {
      const uploaded = await backend.upload(f, (p) => setUpload({ status: "uploading", progress: p }), ctrl.signal);
      geminiName.current = uploaded.name;
      setUpload({ status: "processing" });
      const active = await backend.waitForActive(uploaded.name, ctrl.signal);
      setUpload({ status: "ready", file: active });
      return active;
    } catch (err) {
      if (!ctrl.signal.aborted) setUpload({ status: "error", message: err instanceof Error ? err.message : "Upload failed." });
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

  // Calibrated speed from past runs (localStorage), read once on the client.
  const [speed] = useState(() => (typeof window === "undefined" ? 0.35 : secondsPerVideoSecond()));
  const estimateKey = `${readyFile?.uri ?? ""}|${resolution}|${segments.map((s) => `${s.watch.start}-${s.watch.end}`).join(",")}`;
  const [measured, setMeasured] = useState<{ key: string; tokens: number } | null>(null);

  const estimate: Estimate = useMemo(() => {
    if (watchedSeconds <= 0) return null;
    const longest = Math.max(...segments.map((s) => s.watch.end - s.watch.start));
    const seconds = longest * speed + 30;
    const real = measured?.key === estimateKey ? measured.tokens : null;
    const tokens = real ?? watchedSeconds * ROUGH_TOKENS_PER_SECOND[resolution];
    return { tokens, cost: estimateCostUsd(tokens, watchedSeconds), seconds, measured: real !== null };
  }, [watchedSeconds, segments, speed, measured, estimateKey, resolution]);

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
        if (!gfile) throw new ApiError("The upload didn't finish. Check your connection and try again.", 0);
      }
      const video = { file: gfile, resolution };
      const runSetup: GameSetup = { ...setup };

      setRun({ phase: "appearance" });
      const first = ranges[0];
      const notes = await backend.appearance({ start: first.start, end: Math.min(first.end, first.start + APPEARANCE_SECONDS) }, video, runSetup, ctrl.signal);
      // Pause for the user to correct the notes; continueRun picks up from here.
      setRun({ phase: "notes", notes, started });
    } catch (err) {
      failRun(err, ctrl);
    }
  }

  async function continueRun(notes: string) {
    const ctrl = runAbort.current ?? new AbortController();
    const started = run.phase === "notes" ? run.started : now();
    try {
      const gfile = readyFile!;
      const runSetup: GameSetup = { ...setup, appearanceNotes: notes };
      setRun({ phase: "logging", done: 0, total: segments.length, started });
      const result = await backend.possessionLog(segments, { file: gfile, resolution }, runSetup, ctrl.signal, (done, total) =>
        setRun({ phase: "logging", done, total, started }),
      );
      setRun({ phase: "checking" });
      const longest = Math.max(...segments.map((s) => s.watch.end - s.watch.start));
      if (backend.calibrates) recordRunSpeed((now() - started) / 1000, longest);
      setRun({ phase: "building" });
      setLog(result.log);
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
    if (name) await backend.deleteFile(name);
    setUpload(null);
  }

  function cancelRun() {
    runAbort.current?.abort();
    setRun({ phase: "idle" });
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setCurrentTime(t);
  }

  const showVideo = videoUrl && (step === 1 || step === 4);

  return (
    <div>
      <StepIndicator current={step} reachable={file ? reachable : 0} onGo={go} />

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
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />
        </div>
      )}

      <div className={step === 1 ? "mt-4" : "mt-8"}>
        {step === 0 && <UploadStep onPick={pickFile} onNoVideo={demo ? () => pickFile(null) : undefined} demo={demo} />}
        {step === 1 && (
          <>
            <TrimStep
              duration={duration}
              canPreview={playable || !videoUrl}
              hasPlayhead={Boolean(videoUrl) && playable}
              trim={trim}
              onTrim={setTrim}
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
        {step === 2 && <SetupStep setup={setup} onChange={setSetup} onBack={() => go(1)} onNext={() => go(3)} />}
        {step === 3 && (
          <RunStep
            keptSeconds={keptSeconds}
            segments={segments.length}
            estimate={estimate}
            resolution={resolution}
            onResolution={setResolution}
            upload={upload}
            run={run}
            onAnalyze={analyze}
            onContinue={continueRun}
            onCancel={cancelRun}
            onBack={() => go(2)}
            demo={demo}
          />
        )}
        {step === 4 && log && (
          <>
            {demo && (
              <p role="status" className="mb-6 rounded-[0.75rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm font-medium text-warning-text">
                Simulated results. These numbers were randomly generated to show how review works. Don&apos;t copy them into the club&apos;s sheets.
              </p>
            )}
            <ReviewStep log={log} onLog={setLog} setup={setup} onSeek={seek} usage={run.phase === "done" ? run.usage : null} raw={run.phase === "done" ? run.raw : []} />
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
