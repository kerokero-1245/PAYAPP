type StatusIconProps = {
  kind: "check" | "notice" | "cancel";
};

/**
 * 結果画面のマーク（円 + 記号）。大きさ・色は .status-icon（96px・金）で全種類そろえる。
 */
export default function StatusIcon({ kind }: StatusIconProps) {
  if (kind === "cancel") {
    return (
      <svg
        viewBox="0 0 88 88"
        className="status-icon"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="44"
          cy="44"
          r="40"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.5"
        />
        <path
          d="M32 32 L56 56 M56 32 L32 56"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 80 80"
      className="status-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin={kind === "check" ? "round" : undefined}
      aria-hidden="true"
    >
      <circle cx="40" cy="40" r="36" strokeWidth="1.5" strokeOpacity="0.45" />
      {kind === "check" ? (
        <path d="M25 41.5 L36 52 L56 29" strokeWidth="2.5" />
      ) : (
        <>
          <path d="M40 24 L40 46" strokeWidth="2.5" />
          <path d="M40 55 L40 56" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
