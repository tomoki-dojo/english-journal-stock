import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { buildRandomToeicQuestions } from "@/lib/supabase/toeic-questions";
import { ToeicQuiz } from "@/components/toeic";

// TOEIC演習（Part5、10問）。回答ログを記録するためログイン必須。Free/Pro問わず利用可能。
export default async function ToeicQuizPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=practice");
  }

  const questions = await buildRandomToeicQuestions();

  return <ToeicQuiz questions={questions} />;
}
