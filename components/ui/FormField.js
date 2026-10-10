import { cx } from "./cx";

/**
 * 入力欄 1 つ分（ラベル + 入力 + 補足 / エラー）。
 * エラーがあると入力に aria-invalid と aria-describedby を付け、.input-lux[aria-invalid] で枠が赤くなる。
 *
 * @param {{ id: string, label: React.ReactNode, hint?: React.ReactNode, error?: string, required?: boolean,
 *   requiredMark?: boolean, as?: "input" | "textarea" | "select", className?: string,
 *   children?: React.ReactNode }} props
 *   requiredMark: 必須の印（*）をラベルに付けるか（既定は required と同じ）。
 *   ほかの props は入力要素へそのまま渡す。select の選択肢は children
 */
export default function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  requiredMark = required,
  as: Tag = "input",
  className,
  children,
  ...rest
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("field", className)}>
      <label htmlFor={id} className="field-label">
        {label}
        {requiredMark && (
          <span className="field-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      <Tag
        id={id}
        name={id}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        required={required || undefined}
        className={cx("input-lux", Tag === "textarea" && "input-area")}
        {...rest}
      >
        {children}
      </Tag>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="fine">
          {hint}
        </p>
      )}
    </div>
  );
}
