import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ROADMAP_TITLE_PATH, sanitizeRoadmapNext } from "@/lib/roadmap-title";
import { APP_VERSION } from "@/lib/app-version";

export const metadata: Metadata = { title: { absolute: "喋って！育てろ！英クワたん" } };

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

  const primaryButton =
    "rounded-full border-4 border-[#eaaccb] bg-[#e5215a] px-6 py-3 text-center text-lg font-black tracking-wide text-white shadow-[0_4px_0_#a8153f] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none";
  const secondaryButton =
    "rounded-full border-4 border-[#eaaccb] bg-white px-6 py-3 text-center text-lg font-black tracking-wide text-[#e5215a] shadow-[0_4px_0_#d9a1bd] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none";

  // タイトル画面は1枚絵(9:16)。画面に収まる最大の大きさで中央に置き、絵の下の余白にボタンを重ねる。
  return (
    <div className="relative flex h-dvh items-center justify-center overflow-hidden bg-[#fffaeb]">
      <div className="relative" style={{ aspectRatio: "9 / 16", height: "min(100dvh, calc(100vw * 16 / 9))" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/roadmap/title/title_bg.webp"
          alt="英クワたん 喋って！育てろ！"
          className="absolute inset-0 h-full w-full select-none"
          draggable={false}
        />
        <div className="absolute inset-x-0 top-[76%] flex flex-col items-center gap-3 px-[12%]">
          {user ? (
            <>
              {displayName && <p className="text-sm font-bold text-zinc-600">{displayName}</p>}
              <a
                href={`${ROADMAP_TITLE_PATH}/enter?next=${encodeURIComponent(nextPath)}`}
                className={`${primaryButton} w-full`}
              >
                続きを始める
              </a>
            </>
          ) : (
            <>
              <Link href={signupHref} className={`${primaryButton} w-full`}>
                サインアップ
              </Link>
              <Link href={loginHref} className={`${secondaryButton} w-full`}>
                サインイン
              </Link>
            </>
          )}
        </div>
      </div>

      <Link
        href={`${ROADMAP_TITLE_PATH}/version`}
        className="absolute bottom-4 right-5 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        v{APP_VERSION}
      </Link>
    </div>
  );
}
