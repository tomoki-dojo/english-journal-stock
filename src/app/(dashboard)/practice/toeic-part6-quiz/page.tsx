import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { buildRandomToeicPart6Passages } from "@/lib/supabase/toeic-questions";
import { ToeicPart6Quiz } from "@/components/toeic";

// TOEIC演習（Part6、長文穴埋め・3文書12問）。回答ログを記録するためログイン必須。Free/Pro問わず利用可能。
export default async function ToeicPart6QuizPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=practice");
  }

  const passages = await buildRandomToeicPart6Passages();

  return <ToeicPart6Quiz passages={passages} />;
}
