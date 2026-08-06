// src/lib/supabase/notifications.ts
// 全ユーザー向けお知らせ（ヘッダーのベルアイコン）まわり。
// 既読管理はDBに持たず、クライアント側(localStorage)で最終閲覧日時と比較する設計にしているため、
// ここでは配信内容のCRUDのみを扱う。
import { supabaseAdmin } from "@/lib/supabase/server";

export type Notification = {
  id: string;
  title: string;
  body: string;
  url?: string;
  createdAt: string;
};

type DbNotificationRow = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
};

function fromDbRow(row: DbNotificationRow): Notification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    url: row.url ?? undefined,
    createdAt: row.created_at,
  };
}

const NOTIFICATION_LIST_LIMIT = 10;

// ヘッダーのベル用：最新N件（誰でも呼べる想定。RLSもselectは公開済み）
export async function listNotifications(limit = NOTIFICATION_LIST_LIMIT): Promise<Notification[]> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select()
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as DbNotificationRow[]).map(fromDbRow);
}

export async function getIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .single();

  if (error || !data) return false;
  return Boolean(data.is_admin);
}

type NotificationInput = { title: string; body: string; url?: string };

export async function createNotification(input: NotificationInput): Promise<Notification | null> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert({ title: input.title, body: input.body, url: input.url || null })
    .select()
    .single();

  if (error || !data) return null;
  return fromDbRow(data as DbNotificationRow);
}

export async function updateNotification(
  id: string,
  input: NotificationInput
): Promise<Notification | null> {
  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({ title: input.title, body: input.body, url: input.url || null })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) return null;
  return fromDbRow(data as DbNotificationRow);
}

export async function deleteNotification(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from("notifications").delete().eq("id", id);
  return !error;
}
