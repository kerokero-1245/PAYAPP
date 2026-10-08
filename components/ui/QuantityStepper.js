import { cx } from "./cx";

/**
 * 数量の増減（− 数 +）。
 * @param {{ value: number, min?: number, max: number, onDecrement: () => void, onIncrement: () => void,
 *   size?: "md" | "sm", label?: string }} props
 *   label: aria-label の主語（「Éclat Automatic 41 の」）。省略時は「数量を減らす」
 */
export default function QuantityStepper({ value, min = 1, max, onDecrement, onIncrement, size = "md", label = "" }) {
  const sm = size === "sm";
  const btn = cx("stepper-btn", sm && "stepper-btn-sm");
  return (
    <div className={cx("stepper", sm && "stepper-sm")}>
      <button type="button" onClick={onDecrement} disabled={value <= min} aria-label={`${label}数量を減らす`} className={btn}>
        −
      </button>
      <span className={cx("stepper-value", sm && "stepper-value-sm")}>{value}</span>
      <button type="button" onClick={onIncrement} disabled={value >= max} aria-label={`${label}数量を増やす`} className={btn}>
        +
      </button>
    </div>
  );
}
