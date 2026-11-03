# MACMAN launch notes

This is not a deployment. Billing, Twilio, Gmail, and Outlook stay off.

## Hosting

- A Node host that can run `npm run build` and serve the TanStack Start app over HTTPS.
- The public site must be HTTPS before any OAuth redirect or Twilio webhook is attached.
- Do not put server secrets in `VITE_` variables. Those are sent to the browser.

## Server-only secrets

Leave these unset until each service is approved:

- `XAI_API_KEY` for desk answers, transcription, and spoken replies.
- `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN`.
- `MAILBOX_TOKEN_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
- `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`.
- `BILLING_WEBHOOK_SECRET` for a future hosted payment provider.

The browser may keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only.

## Database order, after approval

1. Existing tables are already in Supabase project `bexuyxicdxtviapavdwi`. Do not drop them.
2. `supabase/owner-writes.sql` is already applied.
3. Then, only if approved: `supabase/phone-lines.sql`.
4. Then `supabase/phase4-awaiting-approval.sql`.
5. Then `supabase/billing-awaiting-approval.sql`.

None of the last three files have been executed. Each enables row-level security and revokes anonymous access.

## Callbacks, later

- Google and Outlook redirect URLs must be `https` on the real domain. They are not configured.
- Twilio voice webhook: `https://<domain>/api/twilio/voice`.
- Twilio SMS webhook: `https://<domain>/api/twilio/sms`.
- Payment webhook: `https://<domain>/api/billing/webhook`.
- All three routes refuse traffic until the matching secret exists and the feature is approved.

## Backup and rollback

- Back up the Supabase project before any approved migration.
- A rollback is restoring that backup, or reverting the Git commit and redeploying the previous build.
- Do not delete rows to undo a migration.

## Monitoring

- Watch the host error log and Supabase authentication logs.
- A refused webhook returns HTTP 403. That is expected while billing and telephone are off.
- There is no paid error tracker connected.

## What is still simulated

Desk answers, browser voice, letters, and texts stay on the signed-in account. They are not delivered to an outside inbox, a telephone, or a payment provider.
