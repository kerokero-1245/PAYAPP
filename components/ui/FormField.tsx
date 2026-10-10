import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import type { PolymorphicProps } from "./polymorphic";

type FormFieldOwnProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** 必須の印（*）をラベルに付けるか（既定は required と同じ） */
  requiredMark?: boolean;
  className?: string;
  /** select の選択肢 */
  children?: ReactNode;
};

/** 入力要素（as で選ぶ） */
type FieldTag = "input" | "textarea" | "select";

/**
 * 入力欄 1 つ分（ラベル + 入力 + 補足 / エラー）。
 * エラーがあると入力に aria-invalid と aria-describedby を付け、.input-lux[aria-invalid] で枠が赤くなる。
 * ほかの props は入力要素へそのまま渡す（onChange などのイベントの型は as の要素で決まる）。
 */
export default function FormField<T extends FieldTag = "input">(props: PolymorphicProps<T, FormFieldOwnProps>): ReactElement;
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
}: FormFieldOwnProps & { as?: FieldTag }) {
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
