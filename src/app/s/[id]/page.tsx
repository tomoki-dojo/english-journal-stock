import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { GuestStartButton } from "@/components/roadmap/guest-start-button";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { shareCardObjectPath, shareCardPublicUrl } from "@/lib/share-card-store";

// シェアされたリンクの行き先（/s/<id>）。XやLINEに貼ると、プレビューにシェアカード（虫のイラスト・名前入り）が出る。
// 開いた人には同じカードと「登録なしで試す」を見せる。カードが見つからなければ紹介ページへ。
// 友だち紹介（紹介コード）を付けるときも、このページを入口にする予定。
export const dynamic = "force-dynamic";

const TITLE = "喋って！育てろ！英クワたん";
const DESCRIPTION = "英語を喋って、クワガタを育てるゲーム。登録なしで、すぐ遊べます。";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function cardUrl(id: string): Promise<string | null> {
  const objectPath = shareCardObjectPath(id);
  if (!objectPath) return null;
  const url = shareCardPublicUrl(objectPath);
  try {
    const res = await fetch(url, { method: "HEAD", next: { revalidate: 3600 } });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const image = (await cardUrl(id)) ?? "/lp/ogp.png";
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      url: `/s/${id}`,
      siteName: "英クワたん",
      title: TITLE,
      description: DESCRIPTION,
      images: [{ url: image, width: 1200, height: 630, alt: TITLE }],
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [image] },
  };
}

const primaryButton =
  "block w-full rounded-full border-4 border-[#eaaccb] bg-[#e5215a] px-6 py-3.5 text-center text-lg font-black tracking-wide text-white shadow-[0_4px_0_#a8153f] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none";

export default async function SharedCardPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const image = await cardUrl(id);
  // utm_*（どの場面のシェアから来たか）は紹介ページにもそのまま渡す
  const utm = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k.startsWith("utm_") && typeof v === "string") utm.set(k, v);
  const welcomeHref = `/welcome${utm.size ? `?${utm.toString()}` : ""}`;
  if (!image) redirect(welcomeHref);

  const user = await getCurrentUser();
  const campaign = typeof sp.utm_campaign === "string" ? sp.utm_campaign : undefined;

  return (
    <div className="min-h-dvh bg-[#fffaeb] text-[#3c2819]">
      <TrackOnMount event="share_landing_view" params={{ campaign }} />
      <main className="mx-auto max-w-xl px-5 pb-10 pt-8 text-center">
        <p className="text-sm font-black text-[#e5215a]">友だちが英クワたんで遊んでるよ！</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="シェアされたカード" className="mx-auto mt-4 w-full max-w-md rounded-2xl shadow-lg" />
        <h1 className="mt-6 text-2xl font-black leading-tight">
          英語を喋って、
          <span className="text-[#e5215a]">クワガタを育てよう！</span>
        </h1>
        <p className="mt-2 text-sm font-bold text-zinc-600">登録なしで、すぐ遊べます</p>
        <div className="mx-auto mt-6 max-w-sm">
          {user ? (
            <Link href="/roadmap" className={primaryButton}>
              続きを始める
            </Link>
          ) : (
            <GuestStartButton className={primaryButton} />
          )}
          <Link href={welcomeHref} className="mt-4 inline-block text-sm font-bold text-[#e5215a] underline underline-offset-4">
            どんなゲームか見てみる
          </Link>
        </div>
      </main>
    </div>
  );
}
