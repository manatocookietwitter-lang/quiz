import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

function iconProps(size: IconProps['size'], props: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: 'false' as const,
    ...props,
  };
}

export function FolderOutlineIcon({ size = 42, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M3.25 7.25a2 2 0 0 1 2-2h4l1.75 2h7.75a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.25a2 2 0 0 1-2-2z" />
      <path d="M3.25 9.25h17.5" />
    </svg>
  );
}

export function DocumentOutlineIcon({ size = 34, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M6.25 3.5h7.1l4.4 4.4v12.6H6.25z" />
      <path d="M13.25 3.5v4.75H18" />
      <path d="M9 12.25h5.75M9 15.5h5.75" />
    </svg>
  );
}

export function PlusIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrashIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M5.5 7.25h13M9.25 4.5h5.5l.75 2.75H8.5zM7.5 7.25l.7 12.25h7.6l.7-12.25" />
      <path d="M10 10.25v6.5M14 10.25v6.5" />
    </svg>
  );
}

export function CheckIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="m5.5 12.25 4.1 4.1L18.75 7.5" />
    </svg>
  );
}

export function MenuIcon({ size = 23, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="m5 9 7 7 7-7" />
    </svg>
  );
}

export function CopyIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

export function DownloadIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M12 4v10M8 10l4 4 4-4M5 19h14" />
    </svg>
  );
}

export function UploadIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M12 15V5M8 9l4-4 4 4M5 19h14" />
    </svg>
  );
}

export function SyncIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} aria-hidden={props['aria-hidden'] ?? true}>
      <path d="M19 7v4h-4M5 17v-4h4" />
      <path d="M18 11a6.5 6.5 0 0 0-11-3.5L5 10M6 13a6.5 6.5 0 0 0 11 3.5l2-2.5" />
    </svg>
  );
}

export function QuizMakeMarkIcon({ size = 28, ...props }: IconProps) {
  return (
    <svg {...iconProps(size, props)} strokeWidth={1.7} aria-hidden={props['aria-hidden'] ?? true}>
      <rect x="4.5" y="4.5" width="12.5" height="13" rx="3.1" />
      <path d="m14.1 14.1 4.6 4.4" />
      <path d="M8.6 12.4a3.1 3.1 0 1 0 6.2 0 3.1 3.1 0 0 0-6.2 0Z" />
    </svg>
  );
}
