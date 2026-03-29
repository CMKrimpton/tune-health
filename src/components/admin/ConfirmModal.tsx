import { useEffect, useRef, useCallback, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── Hook: useConfirm ───────────────────────────────────────────────
// Replaces native confirm() — returns { ask, ConfirmDialog }
// Usage:
//   const { ask, ConfirmDialog } = useConfirm();
//   const ok = await ask({ title: '...', message: '...' });
//   if (ok) doThing();
//   // Render <ConfirmDialog /> in JSX

interface AskOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<AskOptions | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback((opts: AskOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState(opts);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  }, []);

  const ConfirmDialog = state ? (
    <ConfirmModal
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { ask, ConfirmDialog };
}

// ─── Component ──────────────────────────────────────────────────────

export default function ConfirmModal({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onCancel,
}: ConfirmModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button on open
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
    };
    document.addEventListener('keydown', onKey as unknown as EventListener);
    return () => document.removeEventListener('keydown', onKey as unknown as EventListener);
  }, [open, onCancel]);

  // Focus trap — Tab cycles within the modal
  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = card.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onTab as unknown as EventListener);
    return () => document.removeEventListener('keydown', onTab as unknown as EventListener);
  }, [open]);

  if (!open) return null;

  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="admin-modal-backdrop" onClick={onCancel} />
      <div className="admin-modal-card" ref={cardRef}>
        <h3 className="admin-modal-title" id="confirm-modal-title">{title}</h3>
        <p className="admin-modal-text">{message}</p>
        <div className="admin-modal-actions">
          <button
            ref={cancelRef}
            className="admin-action-btn admin-action-btn-muted"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`admin-action-btn ${danger ? 'admin-action-delete' : 'admin-action-btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
