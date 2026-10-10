// 合格の見本: 配置のユーティリティと部品クラスだけ。計算されたキーやコードの ! は違反ではない
export function Ok({ open, field, size }) {
  const state = { [field]: !open };
  return (
    <div className="flex flex-col gap-4 md:flex-row" data-open={!open}>
      <p className={`heading heading-${size}`}>見出し</p>
      <p className="btn btn-gold mt-6">{state[field] ? "はい" : "いいえ"}</p>
    </div>
  );
}
