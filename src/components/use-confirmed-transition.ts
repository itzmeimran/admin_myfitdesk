'use client';
import { useRef, useState } from 'react';
import { useActionConfirmation } from './ActionConfirmationProvider';
import { useToast } from './Toast';

/** For imperative writes; preserve an existing stronger confirmation when present. */
export function useConfirmedTransition(description: string, alreadyConfirmed = false) {
  const confirmAction=useActionConfirmation();const toast=useToast();
  const [pending,setPending]=useState(false);const running=useRef(false);
  const run=(action:()=>Promise<void>)=>{
    const perform=async()=>{
      if(running.current)return;running.current=true;setPending(true);
      try{await action();}catch(error){toast.error(error instanceof Error?error.message:'Unable to complete the action');}
      finally{running.current=false;setPending(false);}
    };
    if(alreadyConfirmed)void perform();
    else void confirmAction({title:'Are you sure?',description},perform);
  };
  return [pending,run] as const;
}
