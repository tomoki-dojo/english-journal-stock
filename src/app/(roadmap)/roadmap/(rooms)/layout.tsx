import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { ensureGuestRoadmapState } from "@/lib/supabase/guest";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { RoomCarousel } from "@/components/roadmap/room-carousel";
import { RoomHomeView, ShelfRoomView } from "@/components/roadmap/room-views";

// 部屋(飼育部屋 /roadmap ・棚の部屋 /roadmap/shelf)をまとめて持つレイアウト。
// 部屋どうしの移動ではこのレイアウトは作り直されず、隣の部屋は読み込み済みのまま横に並んでいる
// (スワイプで隣の部屋が見えるように)。各 page は中身を持たず、どの部屋を出すかはURLで決まる。
// ゲストは棚の部屋だけ(飼育部屋はゲストには開かない)。
export default async function RoomsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap");
  }

  if (user.isAnonymous) await ensureGuestRoadmapState(user.id);

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  return (
    <>
      <RoomCarousel
        showArrows={!user.isAnonymous}
        panes={{
          ...(user.isAnonymous
            ? {}
            : {
                room: (
                  <Suspense fallback={null}>
                    <RoomHomeView user={user} state={state} />
                  </Suspense>
                ),
              }),
          shelf: (
            <Suspense fallback={null}>
              <ShelfRoomView user={user} />
            </Suspense>
          ),
        }}
      />
      {children}
    </>
  );
}
