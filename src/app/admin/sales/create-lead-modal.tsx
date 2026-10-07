'use client';

import { useState } from 'react';
import { stateCityForPincode } from '@/core/geo/indian-pincode';
import { BRANCH_RANGES, INDIAN_STATES, MEMBER_RANGES } from '@/features/demo-requests/validation';
import { MANUAL_LEAD_SOURCES, manualLeadSchema, type ManualLeadInput } from '@/features/sales/manual-lead';
import { useSalesCrm } from '@/features/sales/use-sales-crm';
import { AreaField, ModalFrame, SelectField, TextField } from './crm-modal';

export function CreateLeadModal() {
  const crm=useSalesCrm();
  const [requestId]=useState(()=>crypto.randomUUID());
  const [values,setValues]=useState<Omit<ManualLeadInput,'state'> & {state:string}>({gym:'',contact:'',phone:'',email:'',city:'',state:'',area:'',pin:'',branches:'Unknown',members:'Unknown',source:'Field visit',note:''});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const change=(key:keyof ManualLeadInput)=>(value:string)=>setValues(previous=>({...previous,[key]:value}));
  const changePin=(value:string)=>{
    const pin=value.replace(/\D/g,'').slice(0,6);
    const match=stateCityForPincode(pin);
    setValues(previous=>({...previous,pin,...(match??{})}));
    setErrors(previous=>{
      const next={...previous};
      delete next.pin;
      if(match){delete next.city;delete next.state;}
      return next;
    });
  };
  const pin=values.pin??'';
  const location=stateCityForPincode(pin);
  const pinHelp=pin.length!==6
    ? 'Enter a 6-digit PIN to fill city and state where available.'
    : !/^[1-9]\d{5}$/.test(pin)
      ? 'A valid Indian PIN code cannot start with 0.'
      : !location
        ? 'This PIN is not in our current list. Enter city and state manually.'
        : location.city===values.city&&location.state===values.state
          ? `City and state filled: ${location.city}, ${location.state}. You can edit them below.`
          : 'City and state can be edited manually.';
  const submit=(next:'lead'|'gym')=>{
    const result=manualLeadSchema.safeParse(values);
    if(!result.success){setErrors(Object.fromEntries(result.error.issues.map(issue=>[String(issue.path[0]),issue.message])));return;}
    setErrors({});crm.createLead(requestId,result.data,next);
  };
  return <ModalFrame title="Add lead" sub="Record a gym you met, called or were referred to" onClose={crm.closeModal}
    primaryLabel="Save lead" onPrimary={()=>submit('lead')} secondaryLabel="Save & create gym" onSecondary={()=>submit('gym')}
    note="This saves a CRM lead. An existing phone or email opens the matching lead instead of creating a duplicate. Gym creation is reviewed separately.">
    <TextField label="Gym name" value={values.gym} onChange={change('gym')} error={errors.gym} />
    <TextField label="Owner / contact name" value={values.contact} onChange={change('contact')} error={errors.contact} />
    <TextField label="Mobile / WhatsApp" type="tel" value={values.phone} onChange={change('phone')} placeholder="10-digit Indian mobile number" error={errors.phone} />
    <TextField label="Email (optional)" type="email" value={values.email} onChange={change('email')} error={errors.email} />
    <SelectField label="Lead source" value={values.source} onChange={change('source')} options={[...MANUAL_LEAD_SOURCES]} />
    <TextField label="PIN code (optional)" value={pin} onChange={changePin} inputMode="numeric" maxLength={6} placeholder="e.g. 500001" error={errors.pin} help={pinHelp} />
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="City" value={values.city} onChange={change('city')} error={errors.city} />
      <SelectField label="State" value={values.state??''} onChange={change('state')} options={[{value:'',label:'Choose state'},...INDIAN_STATES]} />
    </div>
    {errors.state?<p role="alert" className="text-accent">{errors.state}</p>:null}
    <TextField label="Area (optional)" value={values.area??''} onChange={change('area')} error={errors.area} />
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField label="Branches" value={values.branches??'Unknown'} onChange={change('branches')} options={['Unknown',...BRANCH_RANGES]} />
      <SelectField label="Members (approx.)" value={values.members??'Unknown'} onChange={change('members')} options={['Unknown',...MEMBER_RANGES]} />
    </div>
    <AreaField label="Visit / sales notes (optional)" value={values.note??''} onChange={change('note')} error={errors.note} />
  </ModalFrame>;
}
