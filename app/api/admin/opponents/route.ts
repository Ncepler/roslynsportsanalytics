import { NextResponse } from "next/server";
import { adminGuarded, readJson } from "@/lib/api";
import { createOpponent, listOpponents } from "@/lib/db/admin";
import { opponentCreate, parse } from "@/lib/db/schemas";

export async function GET(request: Request) {
  return adminGuarded(request, async () => NextResponse.json({ opponents: await listOpponents() }));
}

export async function POST(request: Request) {
  return adminGuarded(request, async () => {
    const { name } = parse(opponentCreate, await readJson(request));
    return NextResponse.json({ opponent: await createOpponent(name) }, { status: 201 });
  });
}
