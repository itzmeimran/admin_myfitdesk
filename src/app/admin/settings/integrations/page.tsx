import { createClient } from "@/core/db/server-client";
import { requirePermission } from "@/core/auth/access";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { getDeploymentConfig, getIntegrationHealth, type IntegrationHealth } from "@/features/settings/integrations";
import { testDatabaseConnection, testEmailConnection, testR2Connection } from "@/features/settings/integration-tests";
import { SectionError, SettingsCard, StatusPill, TextLink, formatWhen, timeAgo, HINT_CLASS, Notice } from "../_components/ui";
import { TestConnectionButton } from "./test-button";

type Card = {
  name: string;
  status: string;
  summary: string;
  facts: { label: string; value: string }[];
  test?: React.ReactNode;
  footer?: React.ReactNode;
};

/**
 * Settings -> Integrations. Only safe metadata: configured-or-not (presence of
 * a credential on this deployment, never its value) and counts/timestamps from
 * our own tables. Where there is no honest signal the card says so rather than
 * showing a made-up "Healthy".
 */
export default async function IntegrationsPage() {
  await requirePermission("integrations.view");
  const environment = await getActiveAdminEnvironment();
  const config = getDeploymentConfig(environment);
  const supabase = await createClient();
  const health = await getIntegrationHealth(supabase);

  const cards = buildCards(config, health.ok ? health.data : null, ADMIN_ENVIRONMENT_LABEL[environment]);

  return (
    <>
      <Notice>
        Secrets — API keys, tokens, passwords, connection strings — are never shown here or sent to your browser. Cards show
        whether a credential is configured on this deployment and what the platform has observed from it.
      </Notice>
      {!health.ok ? <SectionError message={health.error} notInstalled={health.notInstalled} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <SettingsCard key={card.name} title={card.name} description={card.summary} actions={<StatusPill label={card.status} />}>
            <dl className="grid gap-x-4 gap-y-2.5 text-[12.5px] sm:grid-cols-2">
              {card.facts.map((fact) => (
                <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">{fact.label}</dt>
                  <dd className="break-words text-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
            {card.test}
            {card.footer ? <div className={HINT_CLASS}>{card.footer}</div> : null}
          </SettingsCard>
        ))}
      </div>
    </>
  );
}

function buildCards(config: ReturnType<typeof getDeploymentConfig>, health: IntegrationHealth | null, environmentLabel: string): Card[] {
  const razorpay = health?.webhooks.find((w) => w.provider === "razorpay");
  const razorpayStatus = !health
    ? "No data"
    : !razorpay
      ? "No data"
      : razorpay.signature_failures_24h > 0 || razorpay.processing_errors_24h > 0
        ? "Attention"
        : "Healthy";

  const whatsapp = health?.whatsapp;
  const whatsappStatus = !whatsapp || whatsapp.total === 0 ? "No data" : whatsapp.with_error > 0 || whatsapp.tokens_expiring_7d > 0 ? "Attention" : whatsapp.connected > 0 ? "Connected" : "Not connected";

  const email = health?.email;
  const emailStatus = !config.smtpConfigured ? "Not configured" : email && email.failed_24h > 0 ? "Attention" : "Configured";

  const r2Any = config.r2.legacy || config.r2.public || config.r2.private;

  return [
    {
      name: "Supabase",
      status: "Healthy",
      summary: "The database and authentication for this environment. You are using it right now, so it is reachable.",
      facts: [
        { label: "Environment", value: environmentLabel },
        { label: "Host", value: config.supabaseHost },
      ],
      test: <TestConnectionButton run={testDatabaseConnection} />,
    },
    {
      name: "Razorpay",
      status: razorpayStatus,
      summary: "Gym subscription payments arrive through Razorpay webhooks. This reflects what has been received, not a live API call.",
      facts: [
        { label: "Last webhook received", value: razorpay?.last_received_at ? `${timeAgo(razorpay.last_received_at)} (${formatWhen(razorpay.last_received_at)})` : "None recorded" },
        { label: "Webhooks, last 24 h", value: razorpay ? String(razorpay.events_24h) : "—" },
        { label: "Signature failures, 24 h", value: razorpay ? String(razorpay.signature_failures_24h) : "—" },
        { label: "Processing errors, 24 h", value: razorpay ? String(razorpay.processing_errors_24h) : "—" },
      ],
      footer: (
        <>
          Gyms&apos; own Razorpay accounts: {health ? `${health.gateways.connected} connected of ${health.gateways.total}` : "—"}.
          Payment detail lives on <TextLink href="/admin/revenue">Platform revenue</TextLink>.
        </>
      ),
    },
    {
      name: "Meta WhatsApp",
      status: whatsappStatus,
      summary: "Each gym connects its own WhatsApp Business account. This summarises those connections across the platform.",
      facts: [
        { label: "Gyms connected", value: whatsapp ? `${whatsapp.connected} of ${whatsapp.total}` : "—" },
        { label: "Connected with errors", value: whatsapp ? String(whatsapp.with_error) : "—" },
        { label: "Tokens expiring within 7 days", value: whatsapp ? String(whatsapp.tokens_expiring_7d) : "—" },
        { label: "Last webhook received", value: whatsapp?.last_webhook_at ? `${timeAgo(whatsapp.last_webhook_at)}` : "None recorded" },
      ],
      footer: <>Credits and delivery live on <TextLink href="/admin/whatsapp-credits">WhatsApp credits</TextLink>.</>,
    },
    {
      name: "Resend (email)",
      status: emailStatus,
      summary: "Invitation emails from this dashboard go out through SMTP. Gym-side email activity is summarised from the platform's email log.",
      facts: [
        { label: "SMTP on this deployment", value: config.smtpConfigured ? "Configured" : "Not configured" },
        { label: "Gym emails sent, 24 h", value: email ? String(email.sent_24h) : "—" },
        { label: "Gym emails failed, 24 h", value: email ? String(email.failed_24h) : "—" },
        { label: "Last email sent", value: email?.last_sent_at ? timeAgo(email.last_sent_at) : "None recorded" },
      ],
      test: config.smtpConfigured ? <TestConnectionButton run={testEmailConnection} label="Test SMTP login" /> : undefined,
    },
    {
      name: "Cloudflare R2",
      status: r2Any ? "Configured" : "Not configured",
      summary: "Object storage for gym logos and member photos. Shown per bucket the dashboard can reach from this deployment.",
      facts: [
        { label: "Legacy bucket", value: config.r2.legacy ? "Configured" : "Not configured" },
        { label: "Public bucket", value: config.r2.public ? "Configured" : "Not configured" },
        { label: "Private bucket", value: config.r2.private ? "Configured" : "Not configured" },
        { label: "Rollout mode", value: config.r2.rolloutMode },
      ],
      test: r2Any ? (
        <div className="flex flex-wrap gap-3">
          {config.r2.legacy ? <TestConnectionButton run={testR2Connection.bind(null, "legacy")} label="Test legacy" /> : null}
          {config.r2.public ? <TestConnectionButton run={testR2Connection.bind(null, "public")} label="Test public" /> : null}
          {config.r2.private ? <TestConnectionButton run={testR2Connection.bind(null, "private")} label="Test private" /> : null}
        </div>
      ) : undefined,
    },
    {
      name: "Backups (GitHub Actions)",
      status: config.backupDispatchConfigured ? "Configured" : "Not configured",
      summary: "Database backups run as a GitHub Actions workflow. This is only whether this deployment can start one; results live in Recovery.",
      facts: [
        { label: "Workflow dispatch", value: config.backupDispatchConfigured ? "Configured" : "Not configured" },
        { label: "Hourly trigger secret", value: config.cronSecretConfigured ? "Configured" : "Not configured" },
      ],
      footer: <>Backup history and restore live on <TextLink href="/admin/system/disaster-recovery">Recovery</TextLink>.</>,
    },
  ];
}
