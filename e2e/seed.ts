// 注文履歴（/orders）の E2E が見る利用者と注文を、E2E 専用の DB（.pglite-e2e）に入れる。実行: node e2e/seed.ts
//
// playwright.config.ts の webServer が、db:migrate と db:seed の後・next start の前に打つ（PGlite のファイルを開けるのは 1 プロセスだけ）。
// 買う操作は E2E では行えない（Stripe に通信しない）ので、「Webhook が先に確定していた注文」を DB に直接入れておく。
//  - 利用者は本物の Better Auth で登録する（パスワードのハッシュも本物。画面からこのメールとパスワードでログインできる）
//  - 注文は fulfillCheckout と同じ行の組み立て（toOrderRows）で作る。持ち主を決めるのは利用者の id だけ
//  - 前回の seed が残した自分の利用者と注文だけを消して作り直す（カタログの価格が変わっても期待がずれない。ほかの行には触れない）
// E2E 専用の PGlite 以外には書かない（開発の DB や Neon を、環境変数の取り違えで書き換えないため）。
import { eq, inArray } from "drizzle-orm";
import { createAuth, resolveAuthSettings } from "../lib/auth/config.ts";
import { connectDb, resolveDbTarget } from "../lib/db/connect.ts";
import { orderItems, orders, user } from "../lib/db/schema.ts";
import { toOrderRows } from "../lib/fulfillment.ts";
import { E2E_PGLITE_DIR } from "./constants.ts";
import { paidOrder } from "./support/catalog.ts";
import { BUYER_ORDERS, GUEST_ORDER, HISTORY_BUYER } from "./support/history.ts";
import type { SeededOrder } from "./support/history.ts";

const target = resolveDbTarget(process.env);
if (target.kind !== "pglite" || target.dataDir !== E2E_PGLITE_DIR) {
  throw new Error(
    `E2E の seed は ${E2E_PGLITE_DIR}（PGLITE_DATA_DIR）の PGlite にだけ書きます。DATABASE_URL は空にして、PGLITE_DATA_DIR=${E2E_PGLITE_DIR} で打ってください`,
  );
}

const connection = await connectDb(target);
try {
  const { db } = connection;
  const seeded: { order: SeededOrder; userId: string | null }[] = [];

  // 前回の残りを消す（注文を先に。明細は注文と一緒に消える。利用者を消すとセッションと口座も消える）
  const sessionIds = [...Object.values(BUYER_ORDERS), GUEST_ORDER].map(
    (order) => order.sessionId,
  );
  await db.delete(orders).where(inArray(orders.stripeSessionId, sessionIds));
  await db.delete(user).where(eq(user.email, HISTORY_BUYER.email));

  const auth = createAuth(db, resolveAuthSettings(process.env));
  const signedUp = await auth.api.signUpEmail({ body: HISTORY_BUYER });
  seeded.push(
    ...Object.values(BUYER_ORDERS).map((order) => ({
      order,
      userId: signedUp.user.id,
    })),
    { order: GUEST_ORDER, userId: null },
  );

  for (const { order, userId } of seeded) {
    const paidAt = new Date(order.paidAt);
    const rows = toOrderRows(paidOrder(order.sessionId, order.items), {
      orderNo: order.orderNo,
      paidAt,
      userId,
    });
    const [inserted] = await db
      .insert(orders)
      .values({ ...rows.order, createdAt: paidAt })
      .returning({ id: orders.id });
    if (!inserted) throw new Error(`${order.orderNo} を入れられませんでした`);
    await db
      .insert(orderItems)
      .values(rows.items.map((item) => ({ ...item, orderId: inserted.id })));
  }

  console.log(
    `e2e/seed: ${HISTORY_BUYER.email} と注文 ${seeded.length} 件（うちゲスト 1 件）を ${E2E_PGLITE_DIR} に入れました`,
  );
} finally {
  await connection.close();
}
