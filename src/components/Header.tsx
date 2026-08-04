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
    <header className="relative shrink-0 overflow-hidden rounded-b-[26px] border-b border-[#10AEB2]/15 bg-gradient-to-br from-white via-[#F5FBFD] to-[#E7F6F8] px-4 pb-4 shadow-[0_5px_20px_rgba(42,77,96,0.07)] safe-top">
      <div className="pointer-events-none absolute -left-14 top-0 h-32 w-32 -skew-x-12 bg-[#10AEB2]/10" />
      <div className="relative flex min-h-[58px] items-center gap-3">
        <div className="flex w-14 shrink-0 items-center justify-start">
          {leftLabel && onLeft ? (
            <BackButton onClick={onLeft} label={leftLabel} />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DEF5F5] text-xl font-black text-[#087F83]">
              Q
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[20px] font-black tracking-tight text-[#173042]">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] font-bold text-[#607586]">{subtitle}</p> : null}
        </div>

        <div className="flex w-14 shrink-0 items-center justify-end">
          {right ?? <div className="h-11 w-11" />}
        </div>
      </div>
    </header>
  );
}
