"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useMounted } from "@/lib/useMounted";
import Section from "@/components/ui/Section";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Divider from "@/components/ui/Divider";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Loading from "@/components/ui/Loading";

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
  const mounted = useMounted();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // 表示名 / メールから頭文字を1文字取り出す（アバター用）
  const initial =
    (user?.name || user?.email || "").trim().charAt(0).toUpperCase() || "?";

  return (
    <Section spacing="md" as="div">
      <PageHeader eyebrow="MAISON — MY ACCOUNT" title="アカウント" dividerClassName="mt-8 mb-10" dividerOutside />

      {!mounted ? (
        /* mounted 前はプレースホルダ（hydration 対策） */
        <Loading />
      ) : !user ? (
        /* 未ログイン時: ログインへ誘導 */
        <EmptyState
          framed="panel"
          padding="md"
          className="max-w-md mx-auto animate-fade-in"
          title="ログインが必要です"
          description="アカウント情報をご覧いただくには、ログインしてください。"
          action={{ href: "/login", label: "ログインへ" }}
        />
      ) : (
        /* ログイン時: プロフィール + 導線 */
        <Card variant="panel" padding="md" className="max-w-md mx-auto animate-fade-in">
          {/* アバター（頭文字の丸）+ name + email */}
          <div className="flex items-center gap-5">
            <div className="avatar">{initial}</div>
            <div className="min-w-0">
              <p className="heading heading-block truncate">{user.name}</p>
              <p className="meta mt-1 truncate">{user.email}</p>
            </div>
          </div>

          <Divider className="my-7" />

          {/* 導線 */}
          <div className="flex flex-col gap-4">
            <Link href="/orders" className="link-underline accent w-fit">
              注文履歴を見る
            </Link>

            <Button variant="outline" block onClick={handleLogout} className="mt-2">
              ログアウト
            </Button>
          </div>
        </Card>
      )}
    </Section>
  );
}
