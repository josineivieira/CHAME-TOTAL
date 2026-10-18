import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { processing } from '../services/processing';
import './processing.css';
export function ProcessingOverlay() {
  const pending = useSyncExternalStore(processing.subscribe, processing.snapshot),
    dialog = useRef<HTMLDialogElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (visible && pending && !element.open) element.showModal();
    else if ((!visible || !pending) && element.open) element.close();
  }, [visible, pending]);
  return (
    <dialog
      ref={dialog}
      className="erp-processing"
      aria-label="Processando operação"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="erp-processing-content" role="status" aria-live="polite" aria-busy="true">
        <span className="erp-processing-ring" aria-hidden="true" />
        <strong>Processando...</strong>
        <span>Aguarde a conclusão da operação.</span>
      </div>
    </dialog>
  );
}
