import { NextResponse } from "next/server";
import { guarded, jsonError } from "@/lib/api";
import { signToken, verifyToken } from "@/lib/auth/session";
import { getVideoInteraction } from "@/lib/gemini/client";
import { CLEARANCE_TTL_SECONDS, decideGate } from "@/lib/gemini/gate";
import { getSport } from "@/lib/sports";

export const maxDuration = 15;

// Polls the Roslyn-game check. The pass/fail rule runs here, in code; on a
// pass the server signs a clearance that every analysis request must carry.
export async function GET(request: Request, ctx: RouteContext<"/api/gemini/gate/[id]">) {
  return guarded(request, async () => {
    const { id } = await ctx.params;
    const ticket = await verifyToken(new URL(request.url).searchParams.get("ticket"));
    if (!ticket || ticket.t !== "gate" || ticket.id !== id) return jsonError(403, "Invalid check.");
    const sport = typeof ticket.sport === "string" ? getSport(ticket.sport) : undefined;
    if (!sport) return jsonError(403, "Invalid check.");

    const r = await getVideoInteraction(id);
    if (r.status !== "done") return NextResponse.json(r);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(r.text);
    } catch {
      // Unreadable answer: treated as a failed check below (no pass without a clear yes).
    }
    const decision = decideGate(sport, parsed);
    if (!decision.pass) return NextResponse.json({ status: "done", pass: false, reason: decision.reason });
    const clearance = await signToken({ t: "clear", uri: ticket.uri, sport: sport.id, start: ticket.start, end: ticket.end }, CLEARANCE_TTL_SECONDS);
    return NextResponse.json({ status: "done", pass: true, evidence: decision.evidence, clearance });
  });
}
