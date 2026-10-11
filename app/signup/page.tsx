import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/server";
import { LOGIN_PATH, authPageHref, safeNextPath } from "@/lib/auth/next-path";
import { NO_PASSWORD_RESET_NOTE } from "@/lib/policies";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import Eyebrow from "@/components/ui/Eyebrow";
import Heading from "@/components/ui/Heading";
import Divider from "@/components/ui/Divider";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "新規登録" };

/**
 * 新規登録ページ（サーバ）
 * ---------------------------------------------------
 * 作りは /login と同じ（同じ部品・同じ余白）。ログイン済みの人には登録は要らないので、行き先（?next=）かアカウントへ送る。
 * ?next= は URL に書ける値（誰でも作れる）なので、safeNextPath で自サイトの中のパスだけに絞ってから使う。
 */
export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  if (await getViewer()) redirect(next);

  return (
    <Section spacing="md" as="div">
      <div className="max-w-md mx-auto animate-fade-up">
        <Card variant="panel" padding="md">
          <div className="text-center">
            <Eyebrow>MAISON</Eyebrow>
            <Heading as="h1" size="page" className="mt-3">
              新規登録
            </Heading>
            <Divider variant="rule" className="mt-4" />
          </div>

          <SignupForm next={next} />

          <Divider className="my-7" />

          <p className="fine fine-relaxed text-center">
            すでにアカウントをお持ちの方は{" "}
            <Link
              href={authPageHref(
                LOGIN_PATH,
                typeof rawNext === "string" ? next : undefined,
              )}
              className="link-underline accent"
            >
              ログイン
            </Link>
          </p>
          <p className="fine fine-relaxed text-center mt-3">
            ※ {NO_PASSWORD_RESET_NOTE}
          </p>
        </Card>
      </div>
    </Section>
  );
}
