// 注文履歴（lib/order-history.ts の listOrdersByUser・findOrderOfUser・listAllOrdersByUser）のテスト。実行: npm test
//
// なぜあるか: 「自分の注文だけが見える」は、この関数の where の 1 行で守られている。GraphQL の myOrders・order と /orders のページは、
// どれもこの関数を呼ぶので、ここで次を固定する。
//  - 自分の注文だけを新しい順に返す（他の人の注文・ゲストの注文は含まない）
//  - ページに分けても、重ならず欠けない（作成時刻が同じ注文も境目で落ちない）。他の人の注文の番号を after に渡しても何も返らない
//  - 他の人の注文・ゲストの注文・存在しない番号は、番号を知っていても返さない（区別のつかない undefined）
//  - カタログから消えた商品を含む注文も読める（名前と単価は注文時の写し）
// DB は PGlite をテストごとにメモリ上に立てる（lib/db/test-helpers.ts）。外部には通信しない。
import assert from "node:assert/strict";
import { test } from "node:test";

import { eq } from "drizzle-orm";

import { getProductById } from "../lib/catalog.ts";
import { orderItems, products } from "../lib/db/schema.ts";
import { seedProducts } from "../lib/db/seed.ts";
import { withTestDb } from "../lib/db/test-helpers.ts";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  findOrderOfUser,
  isValidPageSize,
  listAllOrdersByUser,
  listOrdersByUser,
} from "../lib/order-history.ts";
import type { OrderPage } from "../lib/order-history.ts";
import {
  DEFAULT_ITEMS,
  insertUser,
  orderNoOf,
  placeOrder,
  timeAt,
} from "./support/orders.ts";

const numbers = (page: OrderPage) => page.orders.map((o) => o.orderNo);

test("listOrdersByUser: 自分の注文だけを新しい順に返す。他の人の注文とゲストの注文は含まない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_a");
    await insertUser(db, "user_b");
    // 入れた順と時刻の順をずらす（並びが挿入順でなく created_at の降順であることを見分ける）
    await placeOrder(db, 1, { userId: "user_a", at: timeAt(30) });
    await placeOrder(db, 2, { userId: "user_b", at: timeAt(40) });
    await placeOrder(db, 3, { userId: "user_a", at: timeAt(50) });
    await placeOrder(db, 4, { at: timeAt(60) }); // ゲスト
    await placeOrder(db, 5, { userId: "user_a", at: timeAt(10) });

    const mine = await listOrdersByUser(db, "user_a");
    assert.deepEqual(numbers(mine), [orderNoOf(3), orderNoOf(1), orderNoOf(5)]);
    assert.equal(mine.nextCursor, null);
    assert.ok(mine.orders.every((o) => o.userId === "user_a"));

    // 中身は DB の写し: 名前と単価は購入した時点の値、明細は商品 id の順
    const [latest] = mine.orders;
    assert.ok(latest);
    assert.equal(latest.status, "paid");
    assert.deepEqual(
      latest.items.map(({ id, name, price, quantity }) => ({
        id,
        name,
        price,
        quantity,
      })),
      DEFAULT_ITEMS.map(({ id, quantity }) => ({
        id,
        name: getProductById(id)!.name,
        price: getProductById(id)!.price,
        quantity,
      })),
    );
    assert.deepEqual(latest.paidAt, timeAt(50));
    assert.deepEqual(latest.createdAt, timeAt(50));

    assert.deepEqual(numbers(await listOrdersByUser(db, "user_b")), [
      orderNoOf(2),
    ]);
    // 注文を持たない利用者・存在しない利用者には、ゲストの注文も含めて何も返らない
    await insertUser(db, "user_c");
    for (const userId of ["user_c", "user_none", ""]) {
      assert.deepEqual(
        await listOrdersByUser(db, userId),
        { orders: [], nextCursor: null },
        userId,
      );
    }
  }));

test("listOrdersByUser: ページに分けても、重ならず欠けずに新しい順に全部返す。作成時刻が同じ注文も境目で落ちない", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_a");
    await insertUser(db, "user_b");
    // 時刻が同じ注文を 3 件（id の降順で決まる）。間に他の人の注文とゲストの注文を挟む
    const same = timeAt(30);
    for (const [n, userId, time] of [
      [1, "user_a", timeAt(10)],
      [2, "user_a", same],
      [3, "user_b", timeAt(35)],
      [4, "user_a", same],
      [5, "user_a", same],
      [6, null, timeAt(45)],
      [7, "user_a", timeAt(50)],
    ] as const) {
      await placeOrder(db, n, { userId, at: time });
    }

    const whole = await listOrdersByUser(db, "user_a", { first: 50 });
    assert.equal(whole.orders.length, 5);
    assert.equal(whole.nextCursor, null);
    const expected = numbers(whole);

    for (const size of [1, 2, 3, 4, 5]) {
      const collected: string[] = [];
      let after: string | null = null;
      let pages = 0;
      do {
        const page: OrderPage = await listOrdersByUser(db, "user_a", {
          first: size,
          after,
        });
        pages += 1;
        collected.push(...numbers(page));
        assert.ok(page.orders.length <= size, `ページの件数 (first=${size})`);
        // 続きがあるなら、nextCursor はそのページの最後の注文の番号。最後のページは null
        assert.equal(
          page.nextCursor,
          collected.length < expected.length
            ? (page.orders.at(-1)?.orderNo ?? null)
            : null,
          `first=${size} ${pages} ページ目の nextCursor`,
        );
        after = page.nextCursor;
      } while (after !== null && pages < 20);
      assert.deepEqual(collected, expected, `first=${size}`);
      assert.equal(pages, Math.ceil(expected.length / size), `first=${size}`);
    }
  }));

test("listOrdersByUser: after に他の人の注文の番号・知らない番号を渡すと、空のページになる（他の人の注文は返らず、番号の存在も分からない）", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_a");
    await insertUser(db, "user_b");
    await placeOrder(db, 1, { userId: "user_a", at: timeAt(10) });
    await placeOrder(db, 2, { userId: "user_b", at: timeAt(20) });
    await placeOrder(db, 3, { userId: "user_a", at: timeAt(30) });
    await placeOrder(db, 4, { at: timeAt(40) }); // ゲスト

    for (const after of [orderNoOf(2), orderNoOf(4), "ORD-NOSUCHORDER", ""]) {
      assert.deepEqual(
        await listOrdersByUser(db, "user_a", { after }),
        { orders: [], nextCursor: null },
        after,
      );
    }
    // 自分の注文の番号なら、それより古いものが返る
    assert.deepEqual(
      numbers(await listOrdersByUser(db, "user_a", { after: orderNoOf(3) })),
      [orderNoOf(1)],
    );
  }));

test("listOrdersByUser: first は 1〜50 の整数だけを受け付け、既定は 20", async () => {
  assert.equal(DEFAULT_PAGE_SIZE, 20);
  assert.equal(MAX_PAGE_SIZE, 50);
  for (const ok of [1, 20, 50])
    assert.equal(isValidPageSize(ok), true, `${ok}`);
  for (const ng of [
    0,
    -1,
    51,
    1.5,
    Number.NaN,
    Infinity,
    "20",
    null,
    undefined,
  ])
    assert.equal(isValidPageSize(ng), false, String(ng));

  await withTestDb(async ({ db }) => {
    for (const first of [0, -1, 51, 1.5, Number.NaN]) {
      await assert.rejects(
        listOrdersByUser(db, "user_a", { first }),
        RangeError,
        String(first),
      );
    }
  });
});

test("findOrderOfUser: 持ち主の注文だけを返す。他の人の注文・ゲストの注文・存在しない番号は、区別のつかない undefined", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_a");
    await insertUser(db, "user_b");
    const mine = await placeOrder(db, 1, { userId: "user_a" });
    const others = await placeOrder(db, 2, { userId: "user_b" });
    const guest = await placeOrder(db, 3);

    const found = await findOrderOfUser(db, "user_a", mine);
    assert.equal(found?.orderNo, mine);
    assert.equal(found?.userId, "user_a");
    assert.deepEqual(
      found?.items.map(({ id, quantity }) => ({ id, quantity })),
      DEFAULT_ITEMS,
    );

    for (const orderNo of [others, guest, "ORD-NOSUCHORDER", ""]) {
      assert.equal(await findOrderOfUser(db, "user_a", orderNo), undefined);
    }
    // 持ち主が違えば、同じ番号でも見つからない（逆向きも同じ）
    assert.equal(await findOrderOfUser(db, "user_b", mine), undefined);
    assert.equal(
      (await findOrderOfUser(db, "user_b", others))?.orderNo,
      others,
    );
    // 持ち主の無い（空の）利用者 id で、ゲストの注文（user_id が null）に当たらない
    assert.equal(await findOrderOfUser(db, "", guest), undefined);
  }));

test("listAllOrdersByUser: ページをまたいで新しい順に全部集め、上限の件数で止まる", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_a");
    await insertUser(db, "user_b");
    for (let n = 1; n <= 7; n += 1) {
      await placeOrder(db, n, { userId: n % 3 === 0 ? "user_b" : "user_a" });
    }
    // user_a は 1, 2, 4, 5, 7。新しい順は 7, 5, 4, 2, 1
    const newestFirst = [7, 5, 4, 2, 1].map(orderNoOf);

    const all = await listAllOrdersByUser(db, "user_a", { pageSize: 2 });
    assert.deepEqual(
      all.map((o) => o.orderNo),
      newestFirst,
    );
    // 既定の設定でも同じ
    assert.deepEqual(
      (await listAllOrdersByUser(db, "user_a")).map((o) => o.orderNo),
      newestFirst,
    );
    // 上限（ページの途中で届いても、ちょうどで止まる）
    for (const limit of [1, 2, 3, 4]) {
      assert.deepEqual(
        (await listAllOrdersByUser(db, "user_a", { pageSize: 2, limit })).map(
          (o) => o.orderNo,
        ),
        newestFirst.slice(0, limit),
        `limit=${limit}`,
      );
    }
    assert.deepEqual(await listAllOrdersByUser(db, "user_none"), []);
  }));

test("注文履歴: カタログから消えた商品を含む注文も読める（名前と単価は注文時の写しで、画像とカテゴリは無い）", () =>
  withTestDb(async ({ db }) => {
    await seedProducts(db);
    await insertUser(db, "user_a");
    const orderNo = await placeOrder(db, 1, { userId: "user_a" });
    // カタログに無い商品（products 表には行がある = 昔は売っていた）に、明細の 1 行を付け替える
    await db.insert(products).values({ id: "999", price: 1234 });
    await db
      .update(orderItems)
      .set({ productId: "999", name: "販売終了の商品", unitPrice: 1234 })
      .where(eq(orderItems.productId, "5"));

    const [order] = (await listOrdersByUser(db, "user_a")).orders;
    assert.equal(order?.orderNo, orderNo);
    const gone = order?.items.find((item) => item.id === "999");
    assert.deepEqual(gone, {
      id: "999",
      name: "販売終了の商品",
      price: 1234,
      quantity: 1,
      image: null,
      category: null,
    });
    // 残りの商品は今のカタログの画像とカテゴリを持つ
    const kept = order?.items.find((item) => item.id === "1");
    assert.equal(kept?.image, getProductById("1")!.images[0]);
    assert.equal(kept?.category, getProductById("1")!.category);
    assert.equal(
      (await findOrderOfUser(db, "user_a", orderNo))?.items.length,
      order?.items.length,
    );
  }));
