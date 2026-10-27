import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { GuestRegisterForm } from "@/components/roadmap/guest-register-form";

// ゲスト(匿名ログイン)が、いまのアカウントに登録(Google/メール)を紐付ける画面。
export default async function RoadmapRegisterPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap");
  }
  if (!user.isAnonymous) {
    redirect("/roadmap");
  }
  return <GuestRegisterForm />;
}
