"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

/**
 * アカウントページ
 * ---------------------------------------------------
 * モック認証（authStore, persist）の状態を表示する。
 * persist の hydration ズレを避けるため mounted 後に描画し、
 * 未ログイン時はログインへ誘導、ログイン時はプロフィールと導線を出す。
 */
export default function AccountPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  // persist ストアの hydration ズレを避けるため mounted 後に描画
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // 表示名 / メールから頭文字を1文字取り出す（アバター用）
  const initial =
    (user?.name || user?.email || "").trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="container-lux py-14 md:py-20">
      {/* ページ見出し */}
      <header className="animate-fade-up">
        <p className="eyebrow">MAISON — MY ACCOUNT</p>
        <h1 className="font-display text-4xl md:text-5xl text-cream mt-3">
          アカウント
        </h1>
        <span className="rule-gold mt-5" />
      </header>

      <div className="hairline mt-8 mb-10" />

      {!mounted ? (
        /* mounted 前はプレースホルダ（hydration 対策） */
        <p className="text-faint text-sm">読み込み中…</p>
      ) : !user ? (
        /* 未ログイン時: ログインへ誘導 */
        <div className="panel p-8 md:p-10 text-center max-w-md mx-auto animate-fade-in">
          <h2 className="font-display text-2xl md:text-3xl text-cream">
            ログインが必要です
          </h2>
          <p className="text-muted mt-3 leading-relaxed">
            アカウント情報をご覧いただくには、ログインしてください。
          </p>
          <Link href="/login" className="btn btn-gold mt-8">
            ログインへ
          </Link>
        </div>
      ) : (
        /* ログイン時: プロフィール + 導線 */
        <div className="panel p-8 max-w-md mx-auto animate-fade-in">
          {/* アバター（頭文字の丸）+ name + email */}
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface-2 border border-gold-deep text-gold font-display text-3xl">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="font-display text-2xl text-cream truncate">
                {user.name}
              </p>
              <p className="text-muted text-sm mt-1 truncate">{user.email}</p>
            </div>
          </div>

          <div className="hairline my-7" />

          {/* 導線 */}
          <div className="flex flex-col gap-4">
            <Link href="/orders" className="link-underline text-gold-soft w-fit">
              注文履歴を見る
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-outline btn-block mt-2"
            >
              ログアウト
            </button>
          </div>
        </div>
      )}
    </main>
  );
}