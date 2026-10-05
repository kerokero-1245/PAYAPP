import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * クライアントで描画しているか（サーバ描画と hydration 中は false）。
 *
 * persist（localStorage）のストアはサーバでは空なので、サーバの HTML と
 * 食い違わないよう、ストアの値は mounted が true になってから出す。
 * 以前の `useEffect(() => setMounted(true), [])` と同じ役割を、effect 内の
 * setState なしで実現する。
 */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
