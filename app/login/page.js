"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useMounted } from "@/lib/useMounted";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import Eyebrow from "@/components/ui/Eyebrow";
import Divider from "@/components/ui/Divider";
import Actions from "@/components/ui/Actions";
import Button from "@/components/ui/Button";
import FormField from "@/components/ui/FormField";

export default function LoginPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // persist ストアのため、初期描画では user を参照せず
  // マウント後に「ログイン済み」表示を出して hydration ズレを防ぐ
  const mounted = useMounted();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    login({ email: email.trim(), name });
    router.push("/account");
  };

  return (
    <Section spacing="md" as="div">
      <div className="max-w-md mx-auto animate-fade-up">
        {mounted && user ? (
          // ── 既にログイン済み ──
          <Card variant="panel" padding="md" className="text-center">
            <Eyebrow>ACCOUNT</Eyebrow>
            <h1 className="heading heading-page mt-3">ログイン中です</h1>
            <Divider variant="rule" className="mt-4" />
            <p className="lead mt-4">
              <span className="accent">{user.name}</span> 様としてサインインしています。
            </p>
            <Actions layout="stack" className="mt-8">
              <Button href="/account" block>
                アカウントへ
              </Button>
              <Button href="/product" variant="outline" block>
                買い物を続ける
              </Button>
            </Actions>
          </Card>
        ) : (
          // ── ログインフォーム ──
          <Card variant="panel" padding="md">
            <div className="text-center">
              <Eyebrow>MAISON</Eyebrow>
              <h1 className="heading heading-page mt-3">サインイン</h1>
              <Divider variant="rule" className="mt-4" />
            </div>

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
                id="name"
                label="表示名（任意）"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 花子"
                hint="未入力の場合はメールアドレスから自動で設定されます。"
              />

              <Button type="submit" block className="mt-1">
                ログイン
              </Button>
            </form>

            <Divider className="my-7" />

            <p className="fine fine-relaxed text-center">
              ※ これはポートフォリオ用のデモ認証です。パスワードは検証されず、入力内容はこのブラウザにのみ保存されます。
            </p>
          </Card>
        )}
      </div>
    </Section>
  );
}
