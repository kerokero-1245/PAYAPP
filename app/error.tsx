"use client";

import StatusMessage from "@/components/ui/StatusMessage";
import Button from "@/components/ui/Button";

/**
 * 想定外のエラーで描画できなかったときの画面（Next の error boundary。ヘッダーとフッターはそのまま出る）
 * ---------------------------------------------------
 * 主に DB が使えないとき（Neon の無料枠の超過・冷えた起動の失敗など）に出る。セッションの cookie を持つ人は、
 * /orders・/account に加えて、/login・/signup も DB でセッションを引くので同じ画面になる（cookie を持たない人の閲覧と購入は
 * DB を使わず、これまでどおり動く。e2e/db-unavailable.spec.ts が DB の使えないサーバで確かめている）。
 * 原因（例外の中身）は画面に出さない（サーバのログにだけ残る）。「もう一度読み込む」はページ全体を読み直す（サーバでの取得をやり直す）。
 */
export default function ErrorPage() {
  return (
    <StatusMessage
      icon="notice"
      role="alert"
      eyebrow="Temporarily Unavailable"
      title="ただいま表示できません"
      lead="一時的に表示できない状態です。しばらくしてから、もう一度お試しください。"
      actions={
        <>
          <Button onClick={() => window.location.reload()}>
            もう一度読み込む
          </Button>
          <Button href="/" variant="outline">
            トップへ戻る
          </Button>
        </>
      }
    />
  );
}
