import './MissingResourceState.css';

interface MissingResourceStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction: () => void;
}

export function MissingResourceState({
  title,
  description,
  actionLabel = 'ホームへ戻る',
  onAction,
}: MissingResourceStateProps) {
  return (
    <main className="missing-resource-state" role="status" aria-live="polite">
      <div className="missing-resource-state__mark" aria-hidden="true">!</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" className="missing-resource-state__action" onClick={onAction}>{actionLabel}</button>
    </main>
  );
}
