import { MIN_QUANTITY, MAX_QUANTITY } from "@/lib/cart";
import { cx } from "./cx";

type QuantityStepperProps = {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  size?: "md" | "sm";
  /** aria-label の主語（「Éclat Automatic 41 の」）。省略時は「数量を減らす」 */
  label?: string;
};

/**
 * 数量の増減（− 数 +）。下限・上限は lib/cart.ts の MIN_QUANTITY / MAX_QUANTITY。
 */
export default function QuantityStepper({
  value,
  onDecrement,
  onIncrement,
  size = "md",
  label = "",
}: QuantityStepperProps) {
  const sm = size === "sm";
  const btn = cx("stepper-btn", sm && "stepper-btn-sm");
  return (
    <div className={cx("stepper", sm && "stepper-sm")}>
      <button
        type="button"
        onClick={onDecrement}
        disabled={value <= MIN_QUANTITY}
        aria-label={`${label}数量を減らす`}
        className={btn}
      >
        −
      </button>
      <span className={cx("stepper-value", sm && "stepper-value-sm")}>
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={value >= MAX_QUANTITY}
        aria-label={`${label}数量を増やす`}
        className={btn}
      >
        +
      </button>
    </div>
  );
}
