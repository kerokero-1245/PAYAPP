import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 認証状態管理用の Zustand ストア（モック実装）
 *
 * ※ バックエンドを持たないポートフォリオ用のため、パスワード検証は行わない
 *   デモ用のモック認証。ログイン状態を localStorage に永続化する。
 *   実運用では NextAuth 等に差し替える想定。
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null, // { name, email } | null

      login: ({ email, name }) =>
        set({
          user: {
            email,
            // 名前未入力ならメールのローカル部を表示名に流用
            name: name?.trim() || email.split("@")[0],
          },
        }),

      logout: () => set({ user: null }),
    }),
    {
      name: "auth-storage",
    }
  )
);