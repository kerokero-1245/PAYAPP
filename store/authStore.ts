import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/types";

type AuthState = {
  /**
   * ログイン中の利用者（未ログインは null）。localStorage から戻すときは検査していない（形を信用している）ので、
   * この型は実行時の保証ではない。
   */
  user: User | null;
  /** 名前（任意）が空ならメールのローカル部を表示名にする */
  login: (input: { email: string; name?: string }) => void;
  logout: () => void;
};

/**
 * 認証状態管理用の Zustand ストア（モック実装）
 *
 * ※ バックエンドを持たないポートフォリオ用のため、パスワード検証は行わない
 *   デモ用のモック認証。ログイン状態を localStorage に永続化する。
 *   実運用では NextAuth 等に差し替える想定。
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,

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