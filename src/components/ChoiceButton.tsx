interface ChoiceButtonProps {
  index: number;
  text: string;
  disabled: boolean;
  isSelected: boolean;
  isCorrectChoice: boolean;
  answered: boolean;
  onClick: () => void;
}

export function ChoiceButton({ index, text, disabled, isSelected, isCorrectChoice, answered, onClick }: ChoiceButtonProps) {
  const label = `${index + 1}`;
  const base = 'min-h-[56px] w-full rounded-2xl border px-4 py-3 text-left text-sm font-bold leading-relaxed transition active:scale-[0.99]';
  let stateClass = 'border-white/10 bg-neutral-800 text-neutral-100';
  let badgeClass = 'bg-neutral-950 text-cyan-300';

  if (!answered && isSelected) {
    stateClass = 'border-cyan-400 bg-cyan-500/20 text-white';
    badgeClass = 'bg-cyan-500 text-neutral-950';
  }

  if (answered && isCorrectChoice) {
    stateClass = 'border-emerald-400 bg-emerald-500/20 text-emerald-50';
    badgeClass = 'bg-emerald-500 text-white';
  } else if (answered && isSelected && !isCorrectChoice) {
    stateClass = 'border-rose-400 bg-rose-500/20 text-rose-50';
    badgeClass = 'bg-rose-500 text-white';
  } else if (answered) {
    stateClass = 'border-white/5 bg-neutral-900 text-neutral-500';
    badgeClass = 'bg-neutral-800 text-neutral-500';
  }

  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${stateClass}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${badgeClass}`}>
          {label}
        </span>
        <span className="min-w-0 flex-1">{text}</span>
      </div>
      {answered && isSelected ? <span className="mt-2 block pl-10 text-[11px] font-black opacity-80">あなたの選択</span> : null}
    </button>
  );
}
