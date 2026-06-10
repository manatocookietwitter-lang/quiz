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
    <header className="relative shrink-0 overflow-hidden rounded-b-[26px] bg-[#202020] px-4 pb-4 safe-top">
      <div className="pointer-events-none absolute -left-14 top-0 h-32 w-32 -skew-x-12 bg-cyan-500/15" />
      <div className="relative flex min-h-[58px] items-center gap-3">
        <div className="flex w-14 shrink-0 items-center justify-start">
          {leftLabel && onLeft ? (
            <BackButton onClick={onLeft} label={leftLabel} />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2B2B2B] text-xl">
              Q
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[20px] font-black tracking-tight text-white">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-400">{subtitle}</p> : null}
        </div>

        <div className="flex w-14 shrink-0 items-center justify-end">
          {right ?? <div className="h-11 w-11" />}
        </div>
      </div>
    </header>
  );
}
