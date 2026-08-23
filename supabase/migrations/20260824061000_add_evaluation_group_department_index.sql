-- Follow-up for the production rollout of the Evaluation workflow repair.
-- The primary repair migration is also updated so fresh environments receive
-- this index in one pass; IF NOT EXISTS keeps this migration idempotent.

create index if not exists evaluation_evaluators_department_evaluation_idx
  on public.evaluation_evaluators(department_id, evaluation_id)
  where lower(type) = 'group' and department_id is not null;
