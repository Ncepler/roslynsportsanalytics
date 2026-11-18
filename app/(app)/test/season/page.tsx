import { redirect } from "next/navigation";

// The simulated season now sits under the simulated analyzer on /test.
export default function TestSeasonPage() {
  redirect("/test#season");
}
