'use client';

import { useRef, type ComponentProps } from 'react';
import { useActionConfirmation } from './ActionConfirmationProvider';

/** Explicitly used on mutation forms; keyboard submission is confirmed too. */
export function ConfirmedForm({ confirmation = 'Save these changes?', onSubmit, ...props }:
  ComponentProps<'form'> & { confirmation?: string }) {
  const confirmAction = useActionConfirmation();
  const allowed = useRef(false);
  return <form {...props} onSubmit={event => {
    if (allowed.current) { allowed.current = false; onSubmit?.(event); return; }
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const label = submitter?.textContent?.trim() || 'Save changes';
    void confirmAction({ title: 'Are you sure?', description: confirmation, confirmLabel: label }, () => {
      allowed.current = true;
      form.requestSubmit(submitter ?? undefined);
      // Invalid native input can prevent the submit event from consuming this flag.
      allowed.current = false;
    });
  }} />;
}
