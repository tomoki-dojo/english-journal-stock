import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { NotebookWordList } from "@/components/roadmap/notebook-word-list";

export default async function NotebookWordsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/notebook/words");
  }
  return (
    <div>
      <div className="mb-4">
        <Link
          href="/roadmap/notebook"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <ChevronLeft className="h-4 w-4" />
          単語ノートに戻る
        </Link>
      </div>
      <h1 className="mb-4 text-lg font-bold text-zinc-800">単語一覧</h1>
      <NotebookWordList />
    </div>
  );
}
