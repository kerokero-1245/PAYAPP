"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import Button from "@/components/ui/Button";

/** ログアウトできなかったときの文（通信の失敗・サーバの失敗。ログイン状態は残っている） */
const LOGOUT_FAILED_MESSAGE =
  "ログアウトできませんでした。時間をおいてもう一度お試しください";

/**
 * ログアウトのボタン
 * ---------------------------------------------------
 * Better Auth の /api/auth/sign-out に送る（サーバがセッションの行を消し、cookie を消す）。
 * 成功したらトップへ。失敗したら、ログイン状態が残っていることが分かるように文を出して、画面は動かさない。
 */
export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { error: failure } = await authClient.signOut();
      if (failure) {
        setError(LOGOUT_FAILED_MESSAGE);
        setPending(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(LOGOUT_FAILED_MESSAGE);
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        block
        onClick={handleLogout}
        disabled={pending}
        className="mt-2"
      >
        ログアウト
      </Button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </>
  );
}
