import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/server";
import { SIGNUP_PATH, authPageHref, safeNextPath } from "@/lib/auth/next-path";
import { NO_PASSWORD_RESET_NOTE } from "@/lib/policies";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import Eyebrow from "@/components/ui/Eyebrow";
import Heading from "@/components/ui/Heading";
import Divider from "@/components/ui/Divider";
import Actions from "@/components/ui/Actions";
import Button from "@/components/ui/Button";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "ログイン" };

/**
 * ログインページ（サーバ）
 * ---------------------------------------------------
 * サーバでセッションを確かめる。ログイン済みなら、?next= があればそこへ（ログインが要るページから来て、別のタブですでに
 * ログインしていた場合など）、無ければ「ログイン中です」を出す。未ログインならフォーム（LoginForm）。
 * ?next= は URL に書ける値（誰でも作れる）なので、safeNextPath で自サイトの中のパスだけに絞ってから使う。
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const viewer = await getViewer();
  if (viewer && typeof rawNext === "string") redirect(next);

  return (
    <Section spacing="md" as="div">
      <div className="max-w-md mx-auto animate-fade-up">
        {viewer ? (
          // ── 既にログイン済み ──
          <Card variant="panel" padding="md" className="text-center">
            <Eyebrow>ACCOUNT</Eyebrow>
            <Heading as="h1" size="page" className="mt-3">
              ログイン中です
            </Heading>
            <Divider variant="rule" className="mt-4" />
            <p className="lead mt-4">
              <span className="accent">{viewer.name}</span>{" "}
              様としてサインインしています。
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
              <Heading as="h1" size="page" className="mt-3">
                サインイン
              </Heading>
              <Divider variant="rule" className="mt-4" />
            </div>

            <LoginForm next={next} />

            <Divider className="my-7" />

            <p className="fine fine-relaxed text-center">
              アカウントをお持ちでない方は{" "}
              <Link
                href={authPageHref(
                  SIGNUP_PATH,
                  typeof rawNext === "string" ? next : undefined,
                )}
                className="link-underline accent"
              >
                新規登録
              </Link>
            </p>
            <p className="fine fine-relaxed text-center mt-3">
              ※ {NO_PASSWORD_RESET_NOTE}
            </p>
          </Card>
        )}
      </div>
    </Section>
  );
}
