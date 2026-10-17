import type { Metadata } from "next";
import Link from "next/link";
import { Bug, MessageCircle, Mic } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { ROADMAP_TITLE_PATH } from "@/lib/roadmap-title";
import { ShareButton } from "@/components/share-button";

// 紹介ページ(LP)。ログイン不要。シェアされたリンクの行き先になる。
// シェア時のプレビュー(OGP)画像は public/lp/ogp.png(1200×630)。
const TITLE = "喋って！育てろ！英クワたん";
const DESCRIPTION = "英語を話して、クワたんを育てよう！AIがフィードバックしてくれる、英語を話すことに特化した育成×英会話アプリ。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/welcome",
    siteName: "英クワたん",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/lp/ogp.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/lp/ogp.png"],
  },
};

const FEATURES = [
  { icon: Mic, title: "英語を練習してクワたんを育てよう", text: "全然英語が話せなくても大丈夫！沢山練習するほどクワたんが育っていくぞ！" },
  { icon: MessageCircle, title: "AIと練習できるから安心", text: "自分なりに英語を喋ればOK！AIが自然な会話とフィードバックをその場で返してくれるぞ！" },
  { icon: Bug, title: "50種類以上の仲間が待ってる", text: "色んなエリアに採集に行ける！英語の実力を上げればレアな種類をゲットできるチャンスが高まるぞ！" },
] as const;

const GALLERY = [
  { code: "KW-0001", name: "エークワたん" },
  { code: "KW-0006", name: "テントたん" },
  { code: "KW-0011", name: "チョウたん" },
  { code: "KW-0012", name: "ミツたん" },
  { code: "KW-0014", name: "カブたん" },
  { code: "KW-0048", name: "コメたん" },
  { code: "KW-0052", name: "クジャクたん" },
  { code: "KW-0002", name: "ヒビクワたん" },
] as const;

const primaryButton =
  "block w-full rounded-full border-4 border-[#eaaccb] bg-[#e5215a] px-6 py-3.5 text-center text-lg font-black tracking-wide text-white shadow-[0_4px_0_#a8153f] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none";

export default async function WelcomePage() {
  const user = await getCurrentUser();

  // サインアップ・サインインの行き先は、タイトル画面と同じ(ログイン後はタイトル画面→ロードマップへ)。
  const titleUrl = `${ROADMAP_TITLE_PATH}?next=${encodeURIComponent("/roadmap")}`;
  const loginHref = `/login?reason=roadmap&next=${encodeURIComponent(titleUrl)}`;
  const signupHref = `${loginHref}&mode=magic`;

  const cta = user ? (
    <Link href="/roadmap" className={primaryButton}>
      続きを始める
    </Link>
  ) : (
    <>
      <Link href={signupHref} className={primaryButton}>
        無料で始める
      </Link>
      <p className="mt-3 text-center text-sm font-semibold text-zinc-500">
        登録済みの方は{" "}
        <Link href={loginHref} className="text-[#e5215a] underline underline-offset-4">
          サインイン
        </Link>
      </p>
    </>
  );

  return (
    <div className="min-h-dvh bg-[#fffaeb] text-[#3c2819]">
      <main className="mx-auto max-w-xl px-5 pb-10">
        <section className="pt-6 text-center">
          <div className="relative mx-auto w-full max-w-sm overflow-hidden" style={{ aspectRatio: "1080 / 1180" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/roadmap/title/title_bg.webp"
              alt="英クワたん 喋って！育てろ！"
              className="absolute left-0 w-full select-none"
              style={{ top: "-18.6%" }}
              draggable={false}
            />
          </div>
          <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            英語を話して、
            <br />
            <span className="text-[#e5215a]">クワたんを育てよう！</span>
          </h1>
          <p className="mt-3 text-base font-bold text-zinc-600">AIがフィードバックしてくれる、英語を話すことに特化した育成×英会話アプリ</p>
          <div className="mx-auto mt-6 max-w-sm">{cta}</div>
        </section>

        <section className="mt-12 space-y-3">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="flex items-center gap-4 rounded-3xl border-2 border-[#f2d5b8] bg-white px-4 py-4 shadow-sm"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e5215a] text-white shadow">
                <feature.icon className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="mb-1.5 text-xs font-black text-[#e5215a]">楽しく英会話が学べる仕組み{i + 1}</p>
                <p className="text-lg font-black leading-snug">{feature.title}</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-500">{feature.text}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-center text-xl font-black">水槽で、のんびり眺める</h2>
          <p className="mb-3 mt-1 text-center text-sm font-bold text-zinc-600">眺めるだけでも楽しい！じっと見てたら面白い行動をする種もいるぞ！</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lp/tank_preview.webp"
            alt="水槽で暮らす英クワたん"
            className="w-full rounded-3xl border-4 border-[#f2d5b8] shadow-md"
          />
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-center text-xl font-black">こんな虫たちが待ってる</h2>
          <div className="grid grid-cols-4 gap-2">
            {GALLERY.map((creature) => (
              <div key={creature.code} className="rounded-2xl bg-white p-1.5 text-center shadow-sm ring-1 ring-[#f2d5b8]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/lp/creatures/${creature.code}.webp`} alt={creature.name} className="w-full" loading="lazy" />
                <p className="pb-1 text-[10px] font-bold leading-tight text-zinc-600 sm:text-xs">{creature.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-3xl bg-gradient-to-br from-[#fff1c9] to-[#ffe3ec] px-5 py-7 text-center">
          <h2 className="mb-4 text-2xl font-black">喋って！育てろ！英クワたん！</h2>
          <div className="mx-auto max-w-sm">{cta}</div>
        </section>

        <div className="mt-6 text-center">
          <ShareButton
            campaign="lp"
            text="英語を話して、クワたんを育てよう！AIがフィードバックしてくれる育成×英会話アプリ「喋って！育てろ！英クワたん」 #英クワたん"
          />
        </div>
      </main>

      <footer className="border-t border-[#f2d5b8] px-5 py-6 text-center text-xs text-zinc-500">
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/terms" className="underline underline-offset-2">
            利用規約
          </Link>
          <Link href="/privacy" className="underline underline-offset-2">
            プライバシーポリシー
          </Link>
          <Link href="/tokushoho" className="underline underline-offset-2">
            特定商取引法に基づく表記
          </Link>
        </nav>
      </footer>
    </div>
  );
}
