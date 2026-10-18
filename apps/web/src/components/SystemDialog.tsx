import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Blocker } from 'react-router-dom';
import { AlertTriangle, PanelsTopLeft, X } from 'lucide-react';
type Options = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  minLength?: number;
};
type Request = {
  kind: 'confirm' | 'prompt';
  message: string;
  options: Options;
  resolve: (result: boolean | string | null) => void;
};
type Dialogs = {
  confirm: (message: string, options?: Options) => Promise<boolean>;
  prompt: (message: string, options?: Options) => Promise<string | null>;
};
const Context = createContext<Dialogs | null>(null);
export function SystemDialogProvider({ children }: { children: ReactNode }) {
  const queue = useRef<Request[]>([]),
    dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    reason = useRef<HTMLTextAreaElement>(null);
  const [request, setRequest] = useState<Request>(),
    [error, setError] = useState('');
  const api = useMemo<Dialogs>(() => {
    const enqueue = (item: Request) => {
      queue.current.push(item);
      if (queue.current.length === 1) setRequest(item);
    };
    return {
      confirm: (message, options = {}) =>
        new Promise<boolean>((resolve) =>
          enqueue({
            kind: 'confirm',
            message,
            options,
            resolve: (result) => resolve(result === true),
          }),
        ),
      prompt: (message, options = {}) =>
        new Promise<string | null>((resolve) =>
          enqueue({
            kind: 'prompt',
            message,
            options,
            resolve: (result) => resolve(typeof result === 'string' ? result : null),
          }),
        ),
    };
  }, []);
  const finish = useCallback((value: boolean | string | null) => {
    const item = queue.current.shift();
    dialog.current?.close();
    setError('');
    item?.resolve(value);
    setRequest(queue.current[0]);
  }, []);
  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    if (reason.current) reason.current.value = '';
    (request.kind === 'prompt' ? reason.current : cancel.current)?.focus();
    return () => {
      dialog.current?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [request]);
  return (
    <Context.Provider value={api}>
      {children}
      <dialog
        ref={dialog}
        className="system-dialog"
        aria-labelledby="system-dialog-title"
        aria-describedby="system-dialog-message"
        onCancel={(e) => {
          e.preventDefault();
          finish(null);
        }}
      >
        {request && (
          <>
            <div className="system-dialog-chrome">
              <span>
                <PanelsTopLeft size={14} aria-hidden />
                Charme Total
              </span>
              <button type="button" aria-label="Fechar aviso" onClick={() => finish(null)}>
                <X size={15} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (request.kind === 'prompt') {
                  const value = reason.current?.value.trim() ?? '';
                  if (value.length < (request.options.minLength ?? 1)) {
                    setError(
                      'Informe pelo menos ' + (request.options.minLength ?? 1) + ' caracteres.',
                    );
                    return;
                  }
                  finish(value);
                } else finish(true);
              }}
            >
              <div className="system-dialog-body">
                <AlertTriangle className="system-dialog-icon" size={32} aria-hidden />
                <div>
                  <h2 id="system-dialog-title">
                    {request.options.title ??
                      (request.kind === 'prompt' ? 'Informe o motivo' : 'Confirmar operação')}
                  </h2>
                  <p id="system-dialog-message">{request.message}</p>
                  {request.kind === 'prompt' && (
                    <label className="system-dialog-reason">
                      Motivo
                      <textarea
                        ref={reason}
                        rows={3}
                        aria-invalid={!!error}
                        aria-describedby={error ? 'dialog-reason-error' : undefined}
                        maxLength={1000}
                      />
                    </label>
                  )}
                  {error && (
                    <p id="dialog-reason-error" className="field-error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              </div>
              <div className="system-dialog-footer">
                <span>Esc para voltar</span>
                <button type="button" ref={cancel} onClick={() => finish(null)}>
                  {request.options.cancelLabel ?? 'Cancelar'}
                </button>
                <button
                  type="submit"
                  className={request.options.danger ? 'dialog-danger' : 'primary'}
                >
                  {request.options.confirmLabel ?? 'Confirmar'}
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </Context.Provider>
  );
}
export function useSystemDialog() {
  const api = useContext(Context);
  if (!api) throw new Error('SystemDialogProvider ausente.');
  return api;
}
export function useDiscardConfirmation(blocker: Blocker, message: string) {
  const { confirm } = useSystemDialog(),
    handled = useRef<string | undefined>(undefined),
    current = useRef(blocker);
  current.current = blocker;
  useEffect(() => {
    if (blocker.state !== 'blocked') {
      handled.current = undefined;
      return;
    }
    const key = blocker.location.key;
    if (handled.current === key) return;
    handled.current = key;
    void confirm(message, {
      title: 'Alterações não salvas',
      confirmLabel: 'Descartar alterações',
      cancelLabel: 'Continuar editando',
      danger: true,
    }).then((accepted) => {
      const latest = current.current;
      if (latest.state !== 'blocked' || latest.location.key !== key) return;
      if (accepted) latest.proceed();
      else latest.reset();
    });
  }, [blocker, message, confirm]);
}
