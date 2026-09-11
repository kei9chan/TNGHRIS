# Account recovery operations

The public recovery endpoint checks connected active HR Manager/Admin Gmail senders before account lookup. Global sender outages return a generic visible error for every email. Account-specific outcomes use the same acknowledgement to prevent account enumeration; administrators inspect the recorded outcome in User Management account access.

The provider accepting an email does not establish inbox delivery. `provider_accepted` records a Gmail message ID; inbox receipt and completed password change require employee verification. Historical `legacy_unknown` rows cannot establish the reason for a failed reset. Retained Auth audit records do not provide reliable historical failed-login counts; diagnostics explicitly show these as unavailable.

If diagnostics report `gmail_authorization_expired`, reconnect an authorized HR Manager/Admin Gmail sender using HRIS Gmail settings. Then send a recovery email from User Management and ask the employee to open the link, choose their password, log in, and confirm their existing records and Employee dashboard.

Never share passwords or recovery URLs through Admin controls. Do not mark email ownership verified manually to bypass recovery. Do not merge employees based on names: verify employee ID and email first. Existing HRIS IDs, roles, RLS and employment status remain authoritative.

Implementation validation: `node tests/accountRecoveryTest.cjs`; production build; database rollback checks for anonymous denial and Admin diagnostic access. The remaining acceptance work includes live email receipt and completion, employee browser flows, duplicate-name resolution, and audited identity/email repair tooling. This change does not claim those checks are complete.
