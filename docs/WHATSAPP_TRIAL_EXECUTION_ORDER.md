# WhatsApp profitability and trial-extension deployment

Run these steps in this exact order.

## 1. Create the pre-migration backup

From PowerShell in the AdminMyFitdesk folder:

```powershell
cd "C:\Users\user\Documents\my vault\AdminMyFitdesk"
npm run backup:pre-migration
```

Stop if this command fails. Do not continue without a verified backup.

## 2. Apply the database SQL

1. Open the correct Supabase project.
2. Open **SQL Editor** and create a new query.
3. Open `docs/COPY_PASTE_WHATSAPP_TRIAL_ADMIN.sql` in Codex.
4. Copy the complete file, paste it into Supabase SQL Editor, and click **Run** once.

Do not also run the canonical migration manually. Both files contain the same database change.

## 3. Verify the database change

1. Create another query in Supabase SQL Editor.
2. Open `docs/COPY_PASTE_VERIFY_WHATSAPP_TRIAL_ADMIN.sql`.
3. Copy the complete file, paste it into the editor, and click **Run**.
4. Confirm:
   - `meta_cost_rate_table` is `whatsapp_meta_cost_rates`.
   - Both RPC columns contain function names instead of `null`.
   - Function permissions are `false, true, false, true`.
   - `ogoxygengym@gmail.com` shows `Shaik` / `Riyaz`.

## 4. Configure Meta rates

After the updated admin app is deployed:

1. Open **WhatsApp Credits**.
2. Select **Meta rates**.
3. Enter the current utility, marketing, and authentication per-message costs from the Meta rate card or invoice.
4. Set the correct effective date and save.

Until rates are entered, Meta payable and gross margin deliberately show an understated estimate with a warning.

## 5. Verify and deploy the application

```powershell
cd "C:\Users\user\Documents\my vault\AdminMyFitdesk"
npm ci
npm run typecheck
npm run lint
npm run build
```

Then deploy the application using the normal hosting workflow. The database SQL must be applied before the new application build goes live.
