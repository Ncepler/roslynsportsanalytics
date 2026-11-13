import { adminGuarded } from "@/lib/api";
import { exportAll } from "@/lib/db/admin";

export const maxDuration = 60;

// Full JSON backup of everything stored (teams, seasons, opponents, games, possessions).
export async function GET(request: Request) {
  return adminGuarded(request, async () => {
    const body = JSON.stringify(await exportAll(), null, 2);
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="club-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
