'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

export type ActionConfirmation = { title: string; description: string; confirmLabel?: string; danger?: boolean };
type ConfirmAction = <T>(options: ActionConfirmation, action: () => T | Promise<T>) => Promise<T | undefined>;
type Request = ActionConfirmation & { action: () => Promise<unknown>; resolve: (value: unknown) => void };
const Context = createContext<ConfirmAction | null>(null);

/** One explicit decision and visible pending state for an admin write. */
export function ActionConfirmationProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [request, setRequest] = useState<Request | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<Request | null>(null);
  const running = useRef(false);
  const confirmAction = useCallback<ConfirmAction>((options, action) => {
    if (active.current) return Promise.resolve(undefined);
    return new Promise(resolve => {
      const next: Request = { ...options, action: async () => action(), resolve: value => resolve(value as never) };
      active.current = next;
      setRequest(next);
    });
  }, []);
  const cancel = () => {
    if (running.current) return;
    active.current?.resolve(undefined);
    active.current = null;
    setRequest(null);
  };
  const execute = async () => {
    const current = active.current;
    if (!current || running.current) return;
    running.current = true;
    setPending(true);
    try { current.resolve(await current.action()); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to complete the action'); current.resolve(undefined); }
    finally { running.current = false; active.current = null; setPending(false); setRequest(null); }
  };
  return <Context.Provider value={confirmAction}>
    {children}
    <ConfirmDialog open={request !== null} title={request?.title ?? 'Are you sure?'}
      description={request?.description ?? ''} confirmLabel={request?.confirmLabel ?? 'Yes, continue'}
      danger={request?.danger} pending={pending} onCancel={cancel} onConfirm={() => void execute()} />
  </Context.Provider>;
}

export function useActionConfirmation(): ConfirmAction {
  const confirm = useContext(Context);
  // Public/auth forms outside /admin keep their own existing behavior.
  return confirm ?? (async (_options, action) => action());
}
