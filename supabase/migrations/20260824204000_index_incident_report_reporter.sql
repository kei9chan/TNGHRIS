-- Supports reporter-scoped incident visibility and filing-history queries.
create index if not exists incident_reports_reported_by_idx
  on public.incident_reports (reported_by);
