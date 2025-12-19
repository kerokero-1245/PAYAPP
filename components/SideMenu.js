import Link from "next/link";

/**
 * 製品一覧画面用のサイドメニューコンポーネント
 *
 * @description
 * 商品一覧ページに表示されるカテゴリナビゲーション。
 * 現在はリンクをべた書きしているため、製品一覧画面専用の実装。
 *
 * @todo
 * - 表示するメニューの出し分け
 * - カテゴリを動的に生成する処理の追加
 *
 * @returns {JSX.Element} サイドメニューUI
 */
export default function SideMenu() {
  return (
    <aside className="w-56 bg-white border-r p-4 sticky top-0 h-screen">
      <h2 className="font-bold mb-4">カテゴリ</h2>

      <ul className="space-y-2">
        <li>
          <Link href="/product" className="text-gray-600 font-semibold hover:text-blue-600">
            全商品
          </Link>
        </li>
        <li>
          <Link href="/product?category=a" className="text-gray-600 font-semibold">カテゴリA</Link>
        </li>
        <li>
          <Link href="/product?category=b" className="text-gray-600 font-semibold">カテゴリB</Link>
        </li>
        <li>
          <Link href="/cart" className="text-blue-600 font-semibold">
            カート
          </Link>
        </li>
      </ul>
    </aside>
  );
}
