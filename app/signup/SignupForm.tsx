"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { authErrorMessage } from "@/lib/auth/messages";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";

/**
 * 新規登録のフォーム（表示名・メールアドレス・パスワード）
 * ---------------------------------------------------
 * Better Auth の /api/auth/sign-up/email に送る。登録できたら、そのままログイン状態になる（メール確認は付けていない）。
 * 表示名は任意で、空ならメールアドレスの @ より前を使う（以前のログイン画面と同じ）。
 * パスワードの長さの制限は、サーバの検査（lib/auth/config.ts）と同じ値（lib/auth/constants.ts）を入力欄にも付ける。
 * 成功したら next（サーバが safeNextPath を通した自サイトのパス）へ移る。
 */
export default function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const address = email.trim();
    try {
      const { error: failure } = await authClient.signUp.email({
        // 名前未入力ならメールのローカル部を表示名に流用
        name: name.trim() || address.split("@")[0],
        email: address,
        password,
      });
      if (failure) {
        setError(authErrorMessage("sign-up", failure));
        setSubmitting(false);
        return;
      }
      // 画面が切り替わるまで、送信中のまま（二重に登録しない）
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(authErrorMessage("sign-up", cause));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
      <FormField
        id="name"
        label="表示名（任意）"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="山田 花子"
        hint="未入力の場合はメールアドレスから自動で設定されます。"
      />
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
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={`${MIN_PASSWORD_LENGTH} 文字以上で入力してください。`}
      />

      <Button type="submit" block disabled={submitting} className="mt-1">
        登録する
      </Button>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
