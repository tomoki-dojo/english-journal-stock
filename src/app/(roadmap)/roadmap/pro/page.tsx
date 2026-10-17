import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { FREE_SHELF_NEW_SPECIES_TANK_CAP } from "@/lib/supabase/kuwagata";
import { RoadmapProPlan } from "@/components/roadmap/roadmap-pro-plan";

// 英クワたん用のPro案内ページ。売っているのは本体と同じ「UpskillEnglish Pro」(Stripeの商品も共通)で、
// 見せ方だけ英クワたんに合わせる。「ゲームの課金」ではなく「英クワたん＋本体アプリ2つ分のPro」として並べる。
// 本体アプリの画面イメージは public/roadmap/pro/upskill_1.(webp|png) 〜 upskill_3 に置くと表示される。
const SCREENSHOT_NAMES = ["upskill_1", "upskill_2", "upskill_3"];

function findScreenshots(): string[] {
  const dir = path.join(process.cwd(), "public", "roadmap", "pro");
  const found: string[] = [];
  for (const name of SCREENSHOT_NAMES) {
    for (const ext of ["webp", "png", "jpg"]) {
      if (fs.existsSync(path.join(dir, `${name}.${ext}`))) {
        found.push(`/roadmap/pro/${name}.${ext}`);
        break;
      }
    }
  }
  return found;
}

export default async function RoadmapProPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/pro");
  }

  const [plan, params] = await Promise.all([getPlan(user.id), searchParams]);

  return (
    <div>
      <Link
        href="/roadmap"
        className="mb-6 inline-flex items-center gap-1 text-sm text-amber-700 transition-colors hover:text-amber-900"
      >
        <ChevronLeft className="h-4 w-4" />
        部屋に戻る
      </Link>
      <RoadmapProPlan
        isPro={plan !== "free"}
        checkoutResult={params.checkout === "success" ? "success" : null}
        screenshots={findScreenshots()}
        shelfCap={FREE_SHELF_NEW_SPECIES_TANK_CAP}
      />
    </div>
  );
}
