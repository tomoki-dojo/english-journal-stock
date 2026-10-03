import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ArthurAvatar } from "@/components/roadmap/arthur";
import { ROADMAP_TITLE_PATH, sanitizeRoadmapNext } from "@/lib/roadmap-title";

type TitlePageProps = {
  searchParams: Promise<{ next?: string }>;
};

// ロードマップの入口。/roadmap配下は、この画面を踏んでいない（または12時間以上操作が無い）と
// ミドルウェアがここへ転送する（ブックマーク・URL直打ちも同様）。
export default async function RoadmapTitlePage({ searchParams }: TitlePageProps) {
  const { next } = await searchParams;
  const nextPath = sanitizeRoadmapNext(next);
  const user = await getCurrentUser();

  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || null;
  }

  // ログイン後はこのタイトル画面（続きを始める）に戻す
  const titleUrl = `${ROADMAP_TITLE_PATH}?next=${encodeURIComponent(nextPath)}`;
  const loginHref = `/login?reason=roadmap&next=${encodeURIComponent(titleUrl)}`;
  const signupHref = `${loginHref}&mode=magic`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-amber-50 via-white to-sky-50 px-6">
      <ArthurAvatar size={176} animated className="shadow-md" />
      <h1 className="mt-6 text-2xl font-bold tracking-wide text-zinc-800">アーサーの飼育部屋</h1>

      <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
        {user ? (
          <>
            {displayName && <p className="text-center text-sm font-semibold text-zinc-600">{displayName}</p>}
            <a
              href={`${ROADMAP_TITLE_PATH}/enter?next=${encodeURIComponent(nextPath)}`}
              className="rounded-full bg-amber-500 px-6 py-3 text-center font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-95"
            >
              続きを始める
            </a>
          </>
        ) : (
          <>
            <Link
              href={signupHref}
              className="rounded-full bg-amber-500 px-6 py-3 text-center font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-95"
            >
              サインアップ
            </Link>
            <Link
              href={loginHref}
              className="rounded-full border border-amber-300 bg-white px-6 py-3 text-center font-bold text-amber-700 transition-transform hover:scale-[1.02] active:scale-95"
            >
              サインイン
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
