import type { ReactNode } from 'react';
import { BackButton } from './BackButton';

interface HeaderProps {
  title: string;
  subtitle?: string;
  leftLabel?: string;
  onLeft?: () => void;
  right?: ReactNode;
}

export function Header({ title, subtitle, leftLabel, onLeft, right }: HeaderProps) {
  return (
    <header className="shrink-0 border-b border-[#DCE5EF] bg-white px-4 pb-2 safe-top">
      <div className="flex min-h-[56px] items-center gap-3">
        <div className="flex w-14 shrink-0 items-center justify-start">
          {leftLabel && onLeft ? (
            <BackButton onClick={onLeft} label={leftLabel} />
          ) : (
            <div className="h-11 w-11" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[20px] font-bold tracking-tight text-[#173042]">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] font-medium text-[#607586]">{subtitle}</p> : null}
        </div>

        <div className="flex w-14 shrink-0 items-center justify-end">
          {right ?? <div className="h-11 w-11" />}
        </div>
      </div>
    </header>
  );
}
