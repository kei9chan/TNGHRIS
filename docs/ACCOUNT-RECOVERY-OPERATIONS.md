# Account recovery operations

Password recovery uses one server sender. Employees do not need Google OAuth access and their addresses must never be added as Google OAuth test users. When Resend is configured, the recovery Edge Function sends through the verified Resend domain. Gmail is retained only as a fallback for existing HR/Admin connections.

Configure these Supabase Edge Function secrets once:

- `RESEND_API_KEY`: a Resend API key with send access
- `RESEND_FROM_EMAIL`: `TNG HRIS <no-reply@your-verified-domain>`

The Resend domain must be verified first. The endpoint does not expose whether an email exists. It records only a hashed request address, the linked HRIS user ID after eligibility checks, provider acceptance status, provider message ID, and a sanitized failure code.

The provider accepting an email does not establish inbox delivery. `provider_accepted` records a Resend or Gmail message ID; inbox receipt and completed password change require employee verification. Historical `legacy_unknown` rows cannot establish the reason for a failed reset. Retained Auth audit records do not provide reliable historical failed-login counts; diagnostics explicitly show these as unavailable.

If diagnostics report a Resend configuration or delivery failure, verify the Resend API key, verified sender domain, SPF/DKIM records, and provider logs. If the service falls back to Gmail and reports `gmail_authorization_expired`, reconnect an authorized HR Manager/Admin Gmail sender using HRIS Gmail settings. Then send a recovery email from User Management and ask the employee to open the link, choose their password, log in, and confirm their existing records and Employee dashboard.

Never share passwords or recovery URLs through Admin controls. Do not mark email ownership verified manually to bypass recovery. Do not merge employees based on names: verify employee ID and email first. Existing HRIS IDs, roles, RLS and employment status remain authoritative.

Implementation validation: `node tests/accountRecoveryTest.cjs`; production build; database rollback checks for anonymous denial and Admin diagnostic access. Live inbox receipt and completed reset still require an employee test after the sender is configured.
