"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/messages";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";

/**
 * ログインのフォーム（メールアドレスとパスワード）
 * ---------------------------------------------------
 * Better Auth の /api/auth/sign-in/email に送る（検証・cookie の発行・試行回数の制限はサーバ側）。
 * 失敗の文は lib/auth/messages.ts の 1 文（メールの有無・パスワードの違いを言い分けない）。
 * 成功したら next（サーバが safeNextPath を通した自サイトのパス）へ移る。
 */
export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: failure } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (failure) {
        setError(authErrorMessage("sign-in", failure));
        setSubmitting(false);
        return;
      }
      // 画面が切り替わるまで、送信中のまま（二重に送らない）
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(authErrorMessage("sign-in", cause));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
      <FormField
        id="email"
        label="メールアドレス"
        type="email"
        required
        requiredMark={false}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <FormField
        id="password"
        label="パスワード"
        type="password"
        required
        requiredMark={false}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button type="submit" block disabled={submitting} className="mt-1">
        ログイン
      </Button>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
