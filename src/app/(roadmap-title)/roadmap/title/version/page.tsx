import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CHANGELOG } from "@/lib/app-version";
import { ROADMAP_TITLE_PATH } from "@/lib/roadmap-title";

export const metadata = { title: "バージョン情報" };

export default async function RoadmapVersionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const fromRoom = from === "room";
  return (
    <div className="min-h-dvh bg-gradient-to-b from-amber-50 via-white to-sky-50 px-6 py-8">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={fromRoom ? "/roadmap" : ROADMAP_TITLE_PATH}
          className="inline-flex items-center gap-0.5 text-sm font-medium text-amber-700"
        >
          <ChevronLeft className="h-4 w-4" />
          {fromRoom ? "部屋へ戻る" : "タイトルへ"}
        </Link>
        <h1 className="mt-4 text-xl font-bold text-zinc-800">バージョン情報</h1>

        <ol className="mt-6 flex flex-col gap-4">
          {CHANGELOG.map((entry) => (
            <li key={entry.version} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-base font-bold text-zinc-800">v{entry.version}</span>
                <span className="text-xs text-zinc-400">{entry.date}</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {entry.changes.map((change) => (
                  <li key={change} className="text-sm leading-relaxed text-zinc-700">
                    ・{change}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
