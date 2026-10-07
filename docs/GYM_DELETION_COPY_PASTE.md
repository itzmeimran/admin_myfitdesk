# Gym deletion: DEV and PROD copy-paste scripts

These scripts have been tested locally. They have **not** been run against either live project. SQL alone cannot deploy the cleanup worker or configure its storage credentials.

## Run order

Use the Supabase SQL Editor as `postgres`. Open the relevant `.sql` file, copy its **entire** contents into a new query, and run it. Each file is standalone: there are no `\i` commands, shell variables or missing migration sections.

| Environment | SQL Editor | First: install | Later: activate |
| --- | --- | --- | --- |
| DEV | https://supabase.com/dashboard/project/pgedlnxuuelmtpmbkdwm/sql/new | `COPY_PASTE_GYM_DELETION_DEV_INSTALL.sql` | `COPY_PASTE_GYM_DELETION_DEV_ACTIVATE.sql` |
| PROD | https://supabase.com/dashboard/project/clbphruocsqsmklmrloq/sql/new | `COPY_PASTE_GYM_DELETION_PROD_INSTALL.sql` | `COPY_PASTE_GYM_DELETION_PROD_ACTIVATE.sql` |

1. Confirm a verified platform backup and existing admin migrations through 1026. Run **DEV INSTALL** first. It installs the complete shared migration 1027 and includes verification queries. No editing is required.
2. Deploy the admin changes and matching FitDeskApp changes. Configure the admin deployment as described below, redeploy, and check the worker with an authenticated GET. Run the disposable two-gym DEV rehearsal described in `GYM_DELETION_WORKFLOW.md`.
3. Run **DEV ACTIVATE** after replacing its secret placeholder. It stores the Vault URL/secret, enables requests, schedules cleanup every 15 minutes and dispatches the worker immediately.
4. After DEV passes, repeat installation, deployment/configuration, readiness checks and activation for PROD. Use the **PROD** files and a separate PROD secret.

New installations remain disabled until activation. Installation reruns preserve an already enabled configuration. No migration-history records are rewritten. Both scripts reject the wrong `disaster_recovery_config` environment **and project identifier** before writing; do not edit the database's identity to bypass an error.

Expected installation results: `default_days=7`, `enabled=false` on a new installation; three installed-function flags `true`; worker privileges `false / true / false`; no tables in the missing-isolation-trigger result. Activation should show `enabled=true` and one active `purge-expired-gyms` job with schedule `*/15 * * * *`. Check HTTP worker results and logs separately: cron success only confirms dispatch.

## Admin deployment environment variables

Generate independent DEV and PROD authorization secrets on your own computer. Run this PowerShell snippet once for each environment; it copies a new secret to your clipboard without printing it. Paste it into the corresponding deployment variable and the matching activation script's `worker_secret` placeholder in SQL Editor. Never save the filled-in SQL file in Git.

```powershell
$gymDeletionBytes = New-Object byte[] 32
$gymDeletionRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $gymDeletionRng.GetBytes($gymDeletionBytes) } finally { $gymDeletionRng.Dispose() }
Set-Clipboard -Value ([Convert]::ToBase64String($gymDeletionBytes))
```

Set these variables in the admin deployment serving the worker:

```dotenv
GYM_DELETION_CRON_SECRET_DEV=<independent DEV secret>
GYM_DELETION_CRON_SECRET_PROD=<independent PROD secret>
GYM_DELETION_R2_BUCKETS_DEV=<verified DEV asset bucket JSON array>
GYM_DELETION_R2_BUCKETS_PROD=<verified PROD asset bucket JSON array>
GYM_DELETION_STORAGE_CONFIRMED_DEV=true
GYM_DELETION_STORAGE_CONFIRMED_PROD=true
```

The angle-bracket values above are placeholders. Each bucket entry has this shape:

```json
[{"accountId":"ACCOUNT_ID","bucket":"ASSET_BUCKET","accessKeyId":"ACCESS_KEY_ID","secretAccessKey":"SECRET_ACCESS_KEY"}]
```

Include every asset bucket, including old and mirrored buckets. **Exclude database backup buckets.** Use `[]` only when that environment has no R2 assets and used Supabase Storage exclusively. Set the confirmation flag only after checking the inventory and organization-UUID-first object paths. R2 cleanup also needs the peer environment's inventory and existing Supabase service credentials to protect shared folders. These flags are required worker configuration, not a substitute for inventory verification.

## Check the deployed worker before activation

These are read-only requests; they do not initiate cleanup. DEV example:

```powershell
$gymDeletionSecret = [System.Net.NetworkCredential]::new('', (Read-Host 'DEV worker secret' -AsSecureString)).Password
$gymDeletionHeaders = @{ Authorization = "Bearer $gymDeletionSecret" }
# For a protected deployment, add the matching bypass header to this hashtable:
# $gymDeletionHeaders['x-vercel-protection-bypass'] = [System.Net.NetworkCredential]::new('', (Read-Host 'Vercel bypass secret' -AsSecureString)).Password
Invoke-RestMethod -Method Get -Uri 'https://admin.myfitdesk.app/api/cron/gym-deletions?environment=dev' -Headers $gymDeletionHeaders
Remove-Variable gymDeletionSecret,gymDeletionHeaders
```

For PROD, repeat with the PROD secret and `?environment=prod`. Expect `ready: true` and the matching environment. Use your actual canonical admin HTTPS origin if it differs from `https://admin.myfitdesk.app`; update `admin_origin` near the top of the activation script too. Avoid a redirecting hostname. If Vercel deployment protection applies, configure the existing `vercel_protection_bypass` Vault secret in that project as well as using the header for readiness checks.

Activation uses the documented Supabase [Vault create/update functions](https://supabase.com/docs/guides/database/vault). It preserves any existing Vercel bypass secret and never returns decrypted secrets in its query results. Supabase SQL Editor can retain query text, so manage the filled-in query as sensitive configuration.

## Copy a script directly to the clipboard

From this repository's PowerShell terminal, run whichever line you need, then paste into the corresponding Supabase SQL Editor. Activate scripts still require filling the secret placeholder **in the editor**.

```powershell
Set-Clipboard -Value (Get-Content -Raw -LiteralPath '.\docs\COPY_PASTE_GYM_DELETION_DEV_INSTALL.sql')
```

```powershell
Set-Clipboard -Value (Get-Content -Raw -LiteralPath '.\docs\COPY_PASTE_GYM_DELETION_DEV_ACTIVATE.sql')
```

```powershell
Set-Clipboard -Value (Get-Content -Raw -LiteralPath '.\docs\COPY_PASTE_GYM_DELETION_PROD_INSTALL.sql')
```

```powershell
Set-Clipboard -Value (Get-Content -Raw -LiteralPath '.\docs\COPY_PASTE_GYM_DELETION_PROD_ACTIVATE.sql')
```

If the source migration or activation SQL changes, regenerate the delivery copies with `node scripts/build-gym-deletion-sql.cjs`. Keep migration 1027 in the admin sequence; both applications share its database changes.
