import Link from "next/link";
import { formatTime, requestLabel, type Thresholds } from "@/features/api-performance/format";
import type { RequestRow } from "@/features/api-performance/queries";
import { LatencyPill, MethodTag, StatusPill } from "./ui";

const ENV_LABEL: Record<string, string> = { production: "Production", preview: "Preview", development: "Development" };

/** Shared by the Request Explorer and the endpoint detail's slow/failed lists. */
export function RequestsTable({ rows, thresholds }: { rows: RequestRow[]; thresholds: Thresholds }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[12px]">
        <thead>
          <tr className="text-left">
            {["Time", "Request ID", "Endpoint", "Method", "Status", "Time taken", "Organization", "Environment"].map((h) => (
              <th key={h} scope="col" className="mfd-micro-label border-b border-line px-3 py-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.requestId} className="mfd-table-row">
              <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-mute">{formatTime(r.occurredAt, true)}</td>
              <td className="whitespace-nowrap border-b border-line px-3 py-2.5 font-mono text-[11px]">
                <Link href={`/admin/api-performance/requests/${r.requestId}`} className="font-bold text-accent hover:underline">
                  {requestLabel(r.requestId)}
                </Link>
              </td>
              <td className="border-b border-line px-3 py-2.5 font-mono text-[11.5px]">{r.route}</td>
              <td className="border-b border-line px-3 py-2.5"><MethodTag method={r.method} /></td>
              <td className="border-b border-line px-3 py-2.5"><StatusPill status={r.status} /></td>
              <td className="border-b border-line px-3 py-2.5"><LatencyPill ms={r.durationMs} thresholds={thresholds} /></td>
              <td className="border-b border-line px-3 py-2.5">
                {r.organizationId ? (
                  <Link href={`/admin/gyms/${r.organizationId}`} className="hover:text-accent">{r.organizationName ?? "Gym"}</Link>
                ) : (
                  <span className="text-mute3">—</span>
                )}
              </td>
              <td className="border-b border-line px-3 py-2.5 text-mute">{ENV_LABEL[r.environment] ?? r.environment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
