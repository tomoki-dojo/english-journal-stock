"use client";

import { useEffect } from "react";
import { trackEvent, trackEventOnce, type AnalyticsParams } from "@/lib/analytics";

// 表示されたときにGA4イベントを1回送るだけのコンポーネント（何も描画しない）。
// onceKeyを渡すと、同じキーではこのタブの間1回だけ送る。
export function TrackOnMount({
  event,
  params,
  onceKey,
}: {
  event: string;
  params?: AnalyticsParams;
  onceKey?: string;
}) {
  const paramsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    const p = JSON.parse(paramsKey) as AnalyticsParams;
    if (onceKey) trackEventOnce(onceKey, event, p);
    else trackEvent(event, p);
  }, [event, paramsKey, onceKey]);
  return null;
}
