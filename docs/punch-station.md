# Punch Station implementation and offline backup

Public URL: `/punch-station/`. Main menu: Punch Station. Administration: Payroll → Attendance Devices → Punch Station.

The dedicated public entry point does not mount HRIS Auth/Settings providers. Its RPC client always uses the anonymous project role and an expiring device capability, never the employee's HRIS session. Only explicitly paired active devices may submit. HR can revoke via Attendance Devices or rotate pairing. No employee credentials are provisioned automatically.

## Samsung Tab A9 / A9+ and ACS ACR1552U

Configure ACR1552U **keyboard emulation**, alphanumeric UID output, terminating Enter, using ACS's Windows configuration utility before connecting through compatible USB OTG. ACS documents keyboard mode and Android support at https://www.acs.com.hk/en/products/575/. Raw PC/SC mode is not implemented by this web app. Physical reader, OTG, concurrent charging and tablet browser testing are still required. UID badges are cloneable identifiers, not cryptographic proof of identity. Badge possession plus disclosed audit photo is the requested workflow; employee-ID + PIN is the online fallback.

## Photo and evidence safeguards

Each accepted punch has a JPEG in a private database schema, atomically committed with the original attendance event/time_events row. No public storage URLs exist. HR photo reads are authorized using existing scoped attendance authority and audited. The UI takes a still, not a recording; no facial encodings/matching are performed. Employee PINs are bcrypt-hashed and per-subject/device attempt limits are enforced. Supervisor PIN is a separate 8–12 digit credential with active role checks, short-lived tickets and limited diagnostic actions.

## Offline prompt addition (implemented)

- Online setup must prepare the kiosk-only service-worker shell before offline use.
- Standby identifies offline/unverified connectivity. Only badge captures are allowed offline; PIN fallback is online-only.
- Capture action, device-reported time and required photo to AES-GCM encrypted IndexedDB with a non-extractable local key. No employee directory or PIN verifier is cached.
- Display “Captured on this tablet. Pending sync and HR verification. Do not punch again.” Never call an offline capture accepted attendance.
- Sync in chronological order with a stable attempt UUID. Keep evidence until server acknowledgement. Require the original device identity when syncing after re-pairing.
- Server retains captured and received times. Offline and delayed submissions stay in the HR queue, outside attendance/payroll totals, until authorized review.
- HR checks photo, active credentials, actual shift date and sequence. Existing published-schedule/attendance transition validators apply. Unknown badges need the established attendance correction process. No disciplinary decisions are automated.
- Limit local queue to 200 captures. If storage/camera fails or the tablet is unavailable, use supervisor manual log → authorized attendance correction. A hotspot is an operational first backup.
- Device reset, browser data clearing, storage eviction or loss can destroy unsynced records. Local encryption does not defeat a compromised tablet or same-origin malicious script. Use a managed, locked-down dedicated tablet/browser.

## Rollout limitations

Physical badge testing and real-camera employee testing cannot be certified from the development environment. Photo-retention duration requires the company's policy; this release does not silently purge evidence. Use the existing data-retention process until an approved automated period is configured. Normal kiosk camera capture cannot prove that the person holding the badge is its owner. Kiosk photo review remains manual.

The public page does not provide general HR dashboards or employee-history access. HR audit lists are limited to the newest 200 captures / 100 attempts within scope; broader historical reporting is not added in this focused release.
