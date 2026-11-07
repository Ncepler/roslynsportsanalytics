"use client";

import { useRef, useState, type DragEvent } from "react";
import { normalizeVideoType } from "@/lib/client/api";
import { isAllowedVideoType, MAX_UPLOAD_BYTES } from "@/lib/gemini/limits";

export function UploadStep({ onPick, onNoVideo, demo = false }: { onPick: (file: File) => void; onNoVideo?: () => void; demo?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  function take(file: File | undefined) {
    if (!file) return;
    if (!isAllowedVideoType(normalizeVideoType(file))) {
      setError("That isn't a supported video. Use an MP4, MOV, or WebM file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That video is over 2 GB. Trim or compress it first.");
      return;
    }
    setError(null);
    onPick(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-[0.875rem] border border-dashed px-6 py-14 text-center ${
          over ? "border-accent bg-surface" : "border-border-strong"
        }`}
      >
        <p className="text-lg font-medium">Choose a game video</p>
        <p className="mt-1 max-w-[28rem] text-muted">
          {demo
            ? "Any video works. In this simulation it only plays in your browser; nothing is uploaded."
            : "MP4, MOV, or WebM, up to 2 GB. It plays here right away while it uploads to Gemini in the background. Use only downloaded files, never a Hudl screen recording."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
            Choose video
          </button>
          {onNoVideo && (
            <button type="button" className="btn btn-secondary" onClick={onNoVideo}>
              Try it without a video
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
          className="sr-only"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
