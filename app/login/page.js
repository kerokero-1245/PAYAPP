"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // persist ストアのため、初期描画では user を参照せず
  // マウント後に「ログイン済み」表示を出して hydration ズレを防ぐ
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    login({ email: email.trim(), name });
    router.push("/account");
  };

  return (
    <div className="container-lux py-20">
      <div className="max-w-md mx-auto animate-fade-up">
        {mounted && user ? (
          // ── 既にログイン済み ──
          <div className="panel p-8 text-center">
            <p className="eyebrow">ACCOUNT</p>
            <h1 className="font-display text-2xl md:text-3xl text-cream mt-3">
              ログイン中です
            </h1>
            <span className="rule-gold mt-4" />
            <p className="text-muted mt-4 leading-relaxed">
              <span className="text-gold-soft">{user.name}</span> 様として
              サインインしています。
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <Link href="/account" className="btn btn-gold btn-block">
                アカウントへ
              </Link>
              <Link href="/product" className="btn btn-outline btn-block">
                買い物を続ける
              </Link>
            </div>
          </div>
        ) : (
          // ── ログインフォーム ──
          <div className="panel p-8">
            <div className="text-center">
              <p className="eyebrow">MAISON</p>
              <h1 className="font-display text-2xl md:text-3xl text-cream mt-3">
                サインイン
              </h1>
              <span className="rule-gold mt-4" />
            </div>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="email"
                  className="text-xs tracking-widest uppercase text-muted"
                >
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-lux"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="name"
                  className="text-xs tracking-widest uppercase text-muted"
                >
                  表示名（任意）
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="山田 花子"
                  className="input-lux"
                />
                <p className="text-xs text-faint">
                  未入力の場合はメールアドレスから自動で設定されます。
                </p>
              </div>

              <button type="submit" className="btn btn-gold btn-block mt-1">
                ログイン
              </button>
            </form>

            <div className="hairline my-7" />

            <p className="text-xs text-faint leading-relaxed text-center">
              ※ これはポートフォリオ用のデモ認証です。パスワードは検証されず、
              入力内容はこのブラウザにのみ保存されます。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}