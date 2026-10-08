import StatusMessage from "@/components/ui/StatusMessage";
import Button from "@/components/ui/Button";

export const metadata = { title: "決済のキャンセル" };

export default function CancelPage() {
  return (
    <StatusMessage
      icon="cancel"
      eyebrow="MAISON"
      title="決済がキャンセルされました"
      lead="お支払いは完了していません。ご請求は発生しておりませんのでご安心ください。カートの内容はそのまま保持されていますので、いつでもお手続きを再開いただけます。"
      actions={
        <>
          <Button href="/cart">カートに戻る</Button>
          <Button href="/product" variant="outline">
            買い物を続ける
          </Button>
        </>
      }
    />
  );
}
