-- The conditional approval processor already routes Leave through PendingGM
-- and PendingBOD, but the legacy check constraint rejected those valid states.
alter table public.leave_requests
  drop constraint if exists leave_requests_status_check;

alter table public.leave_requests
  add constraint leave_requests_status_check
  check (status in (
    'Draft', 'Pending', 'PendingGM', 'PendingBOD',
    'Approved', 'Rejected', 'Cancelled'
  ));
