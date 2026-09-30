import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getRequestDetail } from "@/features/api-performance/queries";
import { formatMs, formatTime, requestLabel } from "@/features/api-performance/format";
import { BackIcon } from "@/core/ui/icons";
import { LatencyPill, MethodTag, Section, StatusPill } from "../../ui";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENV_LABEL: Record<string, string> = { production: "Production", preview: "Preview", development: "Development" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="mfd-micro-label">{label}</dt>
      <dd className="text-[13px]">{children}</dd>
    </div>
  );
}

/**
 * One request. The breakdown shows only what was actually measured: total
 * duration always; Supabase and auth time only when the tenant app persists
 * query spans (PERF_PERSIST=1 → query_perf_events, joined by the same request
 * id). External-API and application-logic time are never recorded, so they
 * say so instead of showing a derived number — Supabase calls overlap, so
 * "total minus Supabase" would be a made-up figure.
 */
export default async function ApiRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const r = await getRequestDetail(supabase, id);
  if (!r) notFound();
  const sb = r.supabase;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/api-performance/requests" className="flex items-center gap-1.5 text-[11.5px] font-bold text-mute hover:text-ink">
        <BackIcon size={13} aria-hidden />
        Request Explorer
      </Link>

      <Section title={requestLabel(r.request_id)} hint={`Full id ${r.request_id}`}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Time">{formatTime(r.occurred_at, true)} IST</Field>
          <Field label="Endpoint"><span className="break-all font-mono text-[12px]">{r.route}</span></Field>
          <Field label="Method"><MethodTag method={r.method} /></Field>
          <Field label="Status"><StatusPill status={r.status} /></Field>
          <Field label="Total duration"><LatencyPill ms={r.duration_ms} /></Field>
          <Field label="Environment">{ENV_LABEL[r.environment] ?? r.environment}</Field>
          <Field label="Organization">
            {r.organization_id ? (
              <Link href={`/admin/gyms/${r.organization_id}`} className="font-bold hover:text-accent">{r.organization_name ?? "Gym"}</Link>
            ) : (
              <span className="text-mute">Not attributed</span>
            )}
          </Field>
          <Field label="Organization ID"><span className="break-all font-mono text-[11px]">{r.organization_id ?? "—"}</span></Field>
        </dl>
      </Section>

      {r.error_type || r.error_message ? (
        <Section title="Error">
          <p className="text-[13px]">
            <strong>{r.error_type ?? "error"}</strong>
            {r.error_message ? <span className="text-mute"> — {r.error_message}</span> : null}
          </p>
          <p className="text-[11px] text-mute">Messages are scrubbed of tokens, emails, phone numbers and long identifiers before storage.</p>
        </Section>
      ) : null}

      <Section title="Where the time went" hint="Only measured values are shown.">
        <ul className="flex flex-col divide-y divide-line text-[13px]">
          <li className="flex items-center justify-between py-2"><span>Total request</span><strong>{formatMs(r.duration_ms)}</strong></li>
          {sb ? (
            <>
              <li className="flex items-center justify-between gap-3 py-2">
                <span>Supabase<span className="block text-[11px] text-mute">{sb.calls} call{sb.calls === 1 ? "" : "s"}; summed, and calls can run in parallel, so this can exceed the total</span></span>
                <strong>{formatMs(sb.total_ms)}</strong>
              </li>
              {sb.auth_calls > 0 ? (
                <li className="flex items-center justify-between gap-3 py-2">
                  <span>Authentication<span className="block text-[11px] text-mute">{sb.auth_calls} auth call{sb.auth_calls === 1 ? "" : "s"}</span></span>
                  <strong>{formatMs(sb.auth_ms)}</strong>
                </li>
              ) : null}
              {sb.slowest.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 pl-4 text-[12px] text-mute">
                  <span className="font-mono">{s.api} · {s.operation} · {s.resource}{s.status ? ` · ${s.status}` : ""}</span>
                  <span>{formatMs(s.duration_ms)}</span>
                </li>
              ))}
            </>
          ) : (
            <li className="flex items-center justify-between gap-3 py-2 text-mute">
              <span>Supabase / authentication<span className="block text-[11px]">Not measured for this request. Set PERF_PERSIST=1 on the tenant app to record query timings.</span></span>
              <span>—</span>
            </li>
          )}
          <li className="flex items-center justify-between py-2 text-mute"><span>External APIs (Razorpay, WhatsApp…)</span><span>Not measured</span></li>
          <li className="flex items-center justify-between py-2 text-mute"><span>Application logic / response processing</span><span>Not measured</span></li>
        </ul>
      </Section>
    </div>
  );
}
