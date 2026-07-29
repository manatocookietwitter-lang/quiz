interface BackButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function BackButton({ onClick, label = '戻る', className = '', disabled = false }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`quiz-back-button ${className}`.trim()}
      aria-label={label}
    >
      <span className="quiz-back-button-icon" aria-hidden="true">‹</span>
    </button>
  );
}
