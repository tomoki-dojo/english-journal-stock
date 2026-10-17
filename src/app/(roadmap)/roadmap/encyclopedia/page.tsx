import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { getKuwagataEncyclopedia } from "@/lib/supabase/kuwagata";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { KuwagataEncyclopediaView } from "@/components/roadmap/kuwagata-encyclopedia";

export default async function KuwagataEncyclopediaPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  // 開発環境だけ、?preview=all で全種解放の図鑑を確認できる（DBは変更しない）。
  const previewAll = process.env.NODE_ENV !== "production" && (await searchParams).preview === "all";
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/encyclopedia");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  let encyclopedia: Awaited<ReturnType<typeof getKuwagataEncyclopedia>> | null = null;
  let loadError = false;

  try {
    encyclopedia = await getKuwagataEncyclopedia(user.id, { previewAll });
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  return (
    <div>
      <Link
        href="/roadmap/shelf"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        棚に戻る
      </Link>

      <h1 className="mb-5 text-lg font-bold text-zinc-800">図鑑</h1>

      {loadError || !encyclopedia ? (
        <p className="text-sm text-red-500">図鑑の読み込みに失敗しました。時間を置いて再度お試しください。</p>
      ) : (
        <KuwagataEncyclopediaView encyclopedia={encyclopedia} />
      )}
    </div>
  );
}
