import { redirect } from "next/navigation";

// Season trends now live on the team page, under the schedule. Old links land there.
export default async function SeasonRedirect({ params }: PageProps<"/t/[slug]/season">) {
  const { slug } = await params;
  redirect(`/t/${slug}#season`);
}
