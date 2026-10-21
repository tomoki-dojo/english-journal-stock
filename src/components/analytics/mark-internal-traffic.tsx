"use client";

import { useEffect } from "react";
import { markInternalTraffic } from "@/lib/analytics-internal";

// 管理画面に置く。管理者がこの端末で一度開けば、以降この端末のアクセスはGA4で「自分」として除かれる。
// （今開いているページの計測は対象外。次に読み込んだページから反映される）
export function MarkInternalTraffic() {
  useEffect(() => {
    markInternalTraffic();
  }, []);
  return null;
}
