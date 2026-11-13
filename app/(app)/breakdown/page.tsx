import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data & privacy · Roslyn Film Analyzer" };

// A plain-language account of where data goes. Every statement here must match how the app is built
// (CLAUDE.md sections 3, 6, 14 and 21). If the app changes, change this page in the same commit.

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[0.75rem] border border-border bg-surface p-5">
      <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-2 space-y-2 text-[0.9375rem] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

const FLOW = [
  { who: "Your browser", what: "Plays the video from your own computer. Nothing leaves until you press Analyze.", keeps: "Nothing saved" },
  { who: "Temporary Vercel storage", what: "Holds the video for the few minutes it takes to hand it to the AI, then deletes it. Leftovers are swept after an hour.", keeps: "Deleted in minutes" },
  { who: "Google Gemini (watches the video)", what: "Watches the video and writes a log of what happened. The video is deleted from Gemini as soon as the run ends.", keeps: "Deleted right after (auto-delete at 48 h at the latest)" },
  { who: "Anthropic Claude (Season tab only)", what: "Receives only numbers the code already calculated (like points per possession by game). It never sees video, faces, or player names.", keeps: "Numbers only" },
  { who: "Private Vercel storage", what: "Keeps the schedule, who is analyzing which game, and each finished game's tables.", keeps: "Numbers and team names only" },
];

export default function BreakdownPage() {
  return (
    <section>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Data &amp; privacy</h1>
      <p className="mt-2 max-w-[40rem] text-muted">
        Exactly what this app does with game footage and data, and what it does not do. The footage shows high school students,
        so the app is built to keep as little as possible.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card title="What is never stored">
          <ul className="list-disc space-y-1 pl-5">
            <li>The game video. It is passed through for the analysis, then deleted.</li>
            <li>Face data of any kind. There is no face recognition and no reference photos are sent.</li>
            <li>Appearance notes (&ldquo;#5, white jersey, headband&rdquo;). They exist for one run, then are discarded.</li>
            <li>The AI&apos;s descriptions of what it saw.</li>
            <li>Student names. The app only uses jersey numbers, and tracker names are never entered.</li>
          </ul>
        </Card>
        <Card title="What is stored">
          <ul className="list-disc space-y-1 pl-5">
            <li>The game schedule: opponent name and date.</li>
            <li>Whether a game is being analyzed or is finished.</li>
            <li>Each finished game&apos;s tables: counts like shots, makes, turnovers and points, plus jersey numbers such as #23.</li>
          </ul>
          <p>These are small text files in a private Vercel Blob store. There is no database. A saved result over 500 KB is refused.</p>
        </Card>
      </div>

      <h2 className="mt-10 text-[1.25rem] font-semibold tracking-[-0.015em]">The path your data takes</h2>
      <ol className="mt-4 space-y-3">
        {FLOW.map((step, i) => (
          <li key={step.who} className="flex gap-4 rounded-[0.75rem] border border-border bg-surface p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white tabular-nums">{i + 1}</span>
            <div>
              <p className="font-semibold">{step.who}</p>
              <p className="mt-1 text-[0.9375rem] text-muted">{step.what}</p>
              <p className="mt-1 text-sm font-medium">Kept: <span className="font-normal text-muted">{step.keeps}</span></p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card title="Who can get in">
          <p>Every page and every data request sits behind a password. Without the sign-in cookie, the server refuses the request.</p>
          <p>Analyzing a game is limited to Roslyn games: a check on the video must see an organized game and read &ldquo;Roslyn&rdquo; before the main analysis runs, and there is no override for members.</p>
          <p>Each scheduled game can be analyzed by one person at a time, and once finished it is locked.</p>
        </Card>
        <Card title="How it is not leaked">
          <ul className="list-disc space-y-1 pl-5">
            <li>The AI keys live only on the server and never reach the browser.</li>
            <li>Video is only ever uploaded by a person. The app does not copy or record anything from Hudl.</li>
            <li>The AI only logs events. All totals and percentages are calculated by code, so the AI is never asked to guess a number.</li>
            <li>If the AI cannot read something, it leaves it blank rather than guessing.</li>
            <li>Logs and storage never hold video content or appearance notes.</li>
          </ul>
        </Card>
      </div>

      <h2 className="mt-10 text-[1.25rem] font-semibold tracking-[-0.015em]">Paid AI tier</h2>
      <p className="mt-2 max-w-[40rem] text-muted">
        Google can use data on its free tier to improve its products, and does not on the paid tier. Real student footage is only to be
        used on the paid tier. While the free tier is on, a banner at the top of the app says not to upload student footage.
      </p>

      <h2 className="mt-10 text-[1.25rem] font-semibold tracking-[-0.015em]">Who pays</h2>
      <p className="mt-2 max-w-[40rem] text-muted">
        The AI costs a few cents to about two dollars per game. It is paid for personally by the student who built the app, not with club
        or school money.
      </p>

      <h2 className="mt-10 text-[1.25rem] font-semibold tracking-[-0.015em]">New York Education Law 2-d</h2>
      <div className="mt-2 max-w-[40rem] space-y-2 text-muted">
        <p>
          Ed Law 2-d protects personally identifiable information about students that a school district or its outside vendors hold.
          As summarized in public guidance, it asks districts to publish a Parents&apos; Bill of Rights, and asks vendors that receive such
          data to protect it, not use it for marketing or commercial purposes, and report breaches.
        </p>
        <p>
          This app was designed with that in mind: it keeps no video, no faces and no student names, and it sells and shares nothing.
          Whether 2-d formally covers a student club tool, and whether the district needs a data-privacy agreement for it, is a decision for
          the district and its data protection officer, not something this page can settle.
        </p>
        <p className="text-sm">This page is a plain-language description of the app, not legal advice.</p>
      </div>
    </section>
  );
}
