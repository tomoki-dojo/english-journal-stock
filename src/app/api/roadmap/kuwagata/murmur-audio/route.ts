import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getMurmurAudioUrl } from "@/lib/supabase/kuwagata-murmur";

// つぶやきの吹き出しをタップしたときの音声URL。習得済みの表現にだけ発行する。
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  }
  try {
    const url = await getMurmurAudioUrl(user.id, id);
    if (!url) {
      return NextResponse.json({ error: "音声がありません" }, { status: 404 });
    }
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "音声URLの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
