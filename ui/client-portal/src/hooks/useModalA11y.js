import { useEffect, useRef } from 'react';

/**
 * Keyboard and focus behaviour shared by every modal dialog.
 *
 * - Escape calls `onClose` (pass `enabled: false` while an action is in flight so it cannot be interrupted).
 * - Focus moves into the dialog when it opens and returns to the element that opened it on close.
 *
 * Attach the returned ref to the element that has `role="dialog"` and give that element `tabIndex={-1}`.
 */
export default function useModalA11y(onClose, { enabled = true } = {}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  return dialogRef;
}
