interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function BackButton({ onClick, label = '戻る', className = '' }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`quiz-back-button ${className}`.trim()}
      aria-label={label}
    >
      ‹
    </button>
  );
}
