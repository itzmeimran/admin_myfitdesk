import type { AdminEnvironment } from "@/core/config/environments";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { ADMIN_STATUS_LABEL, type AdminStatus } from "@/core/auth/permissions";

/** "Active" / "Pending" / … / "No access" / "Unknown" for one environment. */
function describe(status: string): { text: string; on: boolean } {
  if (status === "none") return { text: "No access", on: false };
  if (status === "unknown") return { text: "Unknown", on: false };
  const label = ADMIN_STATUS_LABEL[status as AdminStatus] ?? status;
  return { text: label, on: status === "active" };
}

function Row({ environment, status }: { environment: AdminEnvironment; status: string }) {
  const { text, on } = describe(status);
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px]">
      <span
        aria-hidden="true"
        className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${on ? (environment === "prod" ? "bg-accent" : "bg-ink") : "bg-mute3/50"}`}
      />
      <span className="font-bold text-ink">{environment === "prod" ? "Production" : "Development"}</span>
      <span className="text-mute">{text}</span>
    </span>
  );
}

/** The two environments side by side, in a fixed order (Development first). */
export function EnvAccessSummary({
  current,
  currentStatus,
  other,
  otherStatus,
}: {
  current: AdminEnvironment;
  currentStatus: string;
  other: AdminEnvironment;
  otherStatus: string;
}) {
  const rows: { environment: AdminEnvironment; status: string }[] = [
    { environment: current, status: currentStatus },
    { environment: other, status: otherStatus },
  ].sort((a, b) => (a.environment === b.environment ? 0 : a.environment === "dev" ? -1 : 1));

  return (
    <span className="flex flex-col gap-0.5" aria-label={`${ADMIN_ENVIRONMENT_LABEL.dev} and ${ADMIN_ENVIRONMENT_LABEL.prod} access`}>
      {rows.map((row) => (
        <Row key={row.environment} environment={row.environment} status={row.status} />
      ))}
    </span>
  );
}
