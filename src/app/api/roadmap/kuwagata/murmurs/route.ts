import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getMasteredMurmurs } from "@/lib/supabase/kuwagata-murmur";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }
  try {
    const murmurs = await getMasteredMurmurs(user.id);
    return NextResponse.json({ murmurs }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "つぶやきの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
