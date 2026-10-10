import type { Metadata } from "next";
import StatusMessage from "@/components/ui/StatusMessage";
import Button from "@/components/ui/Button";

export const metadata: Metadata = { title: "ページが見つかりません" };

/** 存在しない URL・存在しない商品（/product/999 など）用の 404 ページ（サイトの配色・書体に合わせた日本語版） */
export default function NotFound() {
  return (
    <StatusMessage
      eyebrow="404 — Not Found"
      title="ページが見つかりませんでした"
      lead="お探しのページ・商品は、移動または販売を終了したか、URL が誤っている可能性がございます。"
      actions={
        <>
          <Button href="/">トップへ戻る</Button>
          <Button href="/product" variant="outline">
            商品一覧を見る
          </Button>
        </>
      }
    />
  );
}
