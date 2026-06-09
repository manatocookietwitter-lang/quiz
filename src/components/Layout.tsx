import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-[#050505] text-white">
      <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-[#050505] safe-bottom">
        {children}
      </div>
    </div>
  );
}
