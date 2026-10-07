-- Baseline claim function copied from FitDeskApp migration 20260927074316.
-- Used to verify isolation rewrites without a sibling checkout.
create or replace function public.claim_whatsapp_queue_batch(
  p_batch_size integer default 20,
  p_stale_lock_minutes integer default 15
)
returns setof public.whatsapp_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if not app.is_service_role() then
    raise exception 'Only the queue worker can claim WhatsApp messages.' using errcode = '42501';
  end if;
  if p_batch_size is null or p_batch_size <= 0 or p_batch_size > 500 then
    raise exception 'Batch size must be between 1 and 500.' using errcode = '22023';
  end if;

  return query
  with claimable as (
    select m.id
    from public.whatsapp_messages m
    where m.direction = 'outbound'
      and (m.scheduled_for is null or m.scheduled_for <= v_now)
      and (
        (m.status = 'queued' and (m.next_attempt_at is null or m.next_attempt_at <= v_now))
        or (
          m.status = 'processing'
          and m.locked_at is not null
          and m.locked_at < v_now - make_interval(
            mins => case
              -- Owner sends include biz_opaque_callback_data. Give Meta's
              -- signed webhook time to reconcile an accepted send whose
              -- worker died before saving the response, reducing the only
              -- ambiguous duplicate window in an external API outbox.
              when m.origin = 'owner_notification' then greatest(p_stale_lock_minutes, 15)
              else p_stale_lock_minutes
            end
          )
        )
      )
    order by m.scheduled_for nulls first, m.next_attempt_at nulls first, m.created_at
    limit p_batch_size
    for update skip locked
  )
  update public.whatsapp_messages m
  set status = 'processing', locked_at = v_now
  from claimable c
  where m.id = c.id
  returning m.*;
end;
$$;
