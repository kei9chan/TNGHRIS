create index if not exists nte_approvals_approver_employee_idx
on public.nte_approvals(approver_employee_id);

create index if not exists nte_approvals_selected_by_idx
on public.nte_approvals(selected_by);

create index if not exists nte_approvals_selection_role_idx
on public.nte_approvals(selection_role_id);
