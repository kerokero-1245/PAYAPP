import type { ComponentPropsWithRef, ElementType } from "react";

/**
 * `as` で描画する要素を差し替えられる部品の props。
 * P: 部品が自分で受ける props、T: 描画する要素（`as` を省略したときの要素は部品ごとに決める）。
 * 要素の props（href・type・onClick・ref など）は T から引く。P と同じ名前のものは P を優先する。
 *
 * 例: type CardProps = PolymorphicProps<T, { variant?: "card" | "panel" }>
 */
export type PolymorphicProps<T extends ElementType, P = object> = P & { as?: T } & Omit<ComponentPropsWithRef<T>, keyof P | "as">;
