import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/server";
import { ACCOUNT_PATH, loginPathFor } from "@/lib/auth/next-path";
import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Heading from "@/components/ui/Heading";
import Divider from "@/components/ui/Divider";
import LogoutButton from "./LogoutButton";

export const metadata: Metadata = { title: "アカウント" };

/**
 * アカウントページ（サーバ）
 * ---------------------------------------------------
 * ログイン中の利用者（Better Auth のセッション）の名前とメールアドレスを出す。
 * 未ログインなら、描画せずに /login?next=/account へ転送する（ログインしたらここへ戻る）。ブラウザの保存（localStorage）は見ない。
 */
export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(loginPathFor(ACCOUNT_PATH));

  // 表示名 / メールから頭文字を1文字取り出す（アバター用）
  const initial =
    (viewer.name || viewer.email).trim().charAt(0).toUpperCase() || "?";

  return (
    <Section spacing="md" as="div">
      <PageHeader
        eyebrow="MAISON — MY ACCOUNT"
        title="アカウント"
        dividerClassName="mt-8 mb-10"
        dividerOutside
      />

      {/* プロフィール + 導線 */}
      <Card
        variant="panel"
        padding="md"
        className="max-w-md mx-auto animate-fade-in"
      >
        {/* アバター（頭文字の丸）+ name + email */}
        <div className="flex items-center gap-5">
          <div className="circle-icon avatar type-display">{initial}</div>
          <div className="min-w-0">
            <Heading as="p" size="block" className="truncate">
              {viewer.name}
            </Heading>
            <p className="meta mt-1 truncate">{viewer.email}</p>
          </div>
        </div>

        <Divider className="my-7" />

        {/* 導線 */}
        <div className="flex flex-col gap-4">
          <Link href="/orders" className="link-underline accent w-fit">
            注文履歴を見る
          </Link>

          <LogoutButton />
        </div>
      </Card>
    </Section>
  );
}
