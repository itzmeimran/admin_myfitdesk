import { istDateKey } from '@/core/dates/ist';
import { addDays, DEMO_TIMES, formatDemoDate, weekdayOf } from '@/features/demo-requests/slots';
export const TIME_SLOTS=DEMO_TIMES.map(t=>t.label);
export function schedulingDays(demo:boolean,now=new Date()) {
 const today=istDateKey(now);
 return Array.from({length:30},(_,i)=>addDays(today,i+1)).filter(d=>!demo||weekdayOf(d)!==0).map(value=>({value,label:formatDemoDate(value)}));
}
