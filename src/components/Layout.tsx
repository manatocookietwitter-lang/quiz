import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-[#F1F7FA] text-[#173042]">
      <div className="mx-auto flex h-full max-w-md flex-col overflow-hidden bg-[#F1F7FA] safe-bottom">
        {children}
      </div>
    </div>
  );
}
