"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function AdminEditorDialog({
  title,
  busy = false,
  error,
  onClose,
  children,
}: {
  title: string;
  busy?: boolean;
  error: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    // Start every new editor at its heading without scrolling the underlying list.
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <dialog
      ref={dialogRef}
      className="admin-editor admin-editor-dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="admin-editor-dialog-header">
        <h3 id={titleId} tabIndex={-1}>
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Cerrar formulario"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div className="admin-editor-dialog-body" inert={busy || undefined}>
        {error && (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        )}
        {children}
      </div>
      {busy && (
        <p className="admin-editor-saving" role="status">
          Guardando cambios…
        </p>
      )}
    </dialog>
  );
}
