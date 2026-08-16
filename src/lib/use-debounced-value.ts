"use client";

import { useEffect, useState } from "react";

// キーワード入力など「入力のたびに即座にAPIを叩きたくない」値をデバウンスするための小さなフック。
// 入力欄自体はvalueにそのままバインドし、フェッチのdeps側でこのフックの返り値を使う想定。
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
