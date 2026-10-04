import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/core/db/database.types';
import { loose } from '@/core/db/loose-client';
export async function getSalesAttentionCount(db:SupabaseClient<Database>):Promise<number|null> {
 const {data,error}=await loose(db).rpc('admin_sales_attention_count');
 return error?null:typeof data==='number'?data:null;
}
