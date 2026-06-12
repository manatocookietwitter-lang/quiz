interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '削除する',
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.65)] p-5">
      <div className="w-[calc(100vw-40px)] max-w-[360px] rounded-[20px] bg-[#202020] p-6 text-white shadow-2xl">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-[#bdbdbd]">{message}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[52px] rounded-[14px] bg-[#2B2B2B] text-sm font-bold text-white active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[52px] rounded-[14px] bg-[#EF4444] text-sm font-bold text-white active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
