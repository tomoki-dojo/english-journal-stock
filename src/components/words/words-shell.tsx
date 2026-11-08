import Link from "next/link";

// 記事ページ・一覧ページ共通の外枠（紹介ページ /welcome と同じ色味）。
export function WordsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#fffaeb] text-[#3c2819]">
      <header className="border-b border-[#f2d5b8] bg-[#fffaeb]/95">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
          <Link href="/welcome" className="text-base font-black tracking-tight">
            英クワたん
          </Link>
          <Link href="/words" className="text-sm font-bold text-[#e5215a]">
            和製英語
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-12">{children}</main>
      <footer className="border-t border-[#f2d5b8] px-5 py-6 text-center text-xs text-zinc-500">
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/welcome" className="underline underline-offset-2">
            英クワたんとは
          </Link>
          <Link href="/terms" className="underline underline-offset-2">
            利用規約
          </Link>
          <Link href="/privacy" className="underline underline-offset-2">
            プライバシーポリシー
          </Link>
        </nav>
      </footer>
    </div>
  );
}
