-- Modern Awards Studio. Additive only: historical awards and certificate snapshots remain unchanged.
begin;

alter table public.award_templates
  add column if not exists badge_key text,
  add column if not exists template_status text not null default 'published',
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_system boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'award_templates_status_check' and conrelid = 'public.award_templates'::regclass) then
    alter table public.award_templates add constraint award_templates_status_check check (template_status in ('draft', 'published', 'archived'));
  end if;
end $$;

create index if not exists award_templates_studio_sort_idx on public.award_templates(template_status, is_active, sort_order, title);
create index if not exists award_templates_business_unit_idx on public.award_templates(business_unit_id, is_preset, template_status);

-- Refresh only the five system-owned starter presets. Issued awards retain their stored certificate snapshot.
with brands(bu_name, preset_key, title, description, primary_color, accent_color, background_color, text_color, wordmark, badge_key) as (
  values
    ('Dessert Museum', 'dessert-museum-award', 'Sweet Service Star', 'A warm, playful recognition style for Dessert Museum.', '#9F1239', '#F43F5E', '#FFF9F5', '#4C0519', 'THE DESSERT\nMUSEUM', 'guest-experience-star'),
    ('Gootopia', 'gootopia-award', 'Gootopia Good Vibes', 'A clean, playful recognition style for Gootopia.', '#5B21B6', '#22D3EE', '#FAF7FF', '#312E81', 'GOOTOPIA', 'customer-delight-champion'),
    ('Bakebe', 'bakebe-award', 'Bakebe Baking Brilliance', 'A warm editorial recognition style for Bakebe.', '#9A3412', '#EA580C', '#FFFAF2', '#431407', 'BAKEBE', 'service-excellence'),
    ('Inflatable Island', 'inflatable-island-award', 'Inflatable Island Wave Maker', 'A bright coastal recognition style for Inflatable Island.', '#0F766E', '#FB7185', '#EFFCFC', '#134E4A', 'INFLATABLE\nISLAND', 'above-and-beyond'),
    ('Fun Roof', 'fun-roof-award', 'Fun Roof Rooftop All-Star', 'A bold nightlife recognition style for Fun Roof.', '#111318', '#FF2D9A', '#111318', '#FFFFFF', 'FUN\nROOF', 'guest-experience-star')
), prepared as (
  select b.*, bu.id as business_unit_id,
    jsonb_build_object(
      'backgroundColor', b.background_color, 'backgroundImageUrl', '', 'borderWidth', 0, 'borderColor', b.primary_color,
      'fontFamily', 'Inter, ui-sans-serif, system-ui, sans-serif', 'titleColor', b.text_color, 'textColor', b.text_color,
      'headerText', upper(b.title), 'bodyText', 'For {{award_reason}}',
      'signatories', jsonb_build_array(jsonb_build_object('name', 'Authorized Signatory', 'title', 'Management')),
      'logoUrl', '', 'accentColor', b.accent_color, 'secondaryAccentColor', b.primary_color,
      'orientation', 'portrait', 'badgeStyle', 'outline', 'badgeKey', b.badge_key,
      'layoutVersion', 'modern-v2', 'brandName', b.bu_name, 'wordmarkText', b.wordmark
    ) as design
  from brands b left join public.business_units bu on lower(btrim(bu.name)) = lower(btrim(b.bu_name))
)
insert into public.award_templates(title, description, badge_icon_url, is_active, design, business_unit_id, category, is_default, is_preset, preset_key, badge_key, template_status, sort_order, is_system)
select title, description, '', true, design, business_unit_id, 'Employee Recognition', false, true, preset_key, badge_key, 'published', 0, true from prepared
on conflict (preset_key) where preset_key is not null do update set
  title = excluded.title, description = excluded.description, design = excluded.design,
  business_unit_id = coalesce(excluded.business_unit_id, public.award_templates.business_unit_id),
  badge_key = excluded.badge_key, template_status = 'published', is_active = true, is_preset = true,
  is_system = true, updated_at = now();

-- Any future business unit receives a cohesive editable starter automatically when this migration is applied.
insert into public.award_templates(title, description, badge_icon_url, is_active, design, business_unit_id, category, is_default, is_preset, preset_key, badge_key, template_status, sort_order, is_system)
select bu.name || ' Recognition', 'A modern recognition preset for ' || bu.name || '.', '', true,
  jsonb_build_object(
    'backgroundColor', '#FFFFFF', 'backgroundImageUrl', '', 'borderWidth', 0, 'borderColor', coalesce(nullif(bu.color, ''), '#3730A3'),
    'fontFamily', 'Inter, ui-sans-serif, system-ui, sans-serif', 'titleColor', '#111827', 'textColor', '#111827',
    'headerText', upper(bu.name || ' Recognition'), 'bodyText', 'For {{award_reason}}',
    'signatories', jsonb_build_array(jsonb_build_object('name', 'Authorized Signatory', 'title', 'Management')),
    'logoUrl', '', 'accentColor', coalesce(nullif(bu.color, ''), '#6366F1'), 'secondaryAccentColor', '#3730A3',
    'orientation', 'portrait', 'badgeStyle', 'outline', 'badgeKey', 'guest-experience-star',
    'layoutVersion', 'modern-v2', 'brandName', bu.name, 'wordmarkText', upper(bu.name)
  ), bu.id, 'Employee Recognition', false, true, 'business-unit-' || bu.id::text, 'guest-experience-star', 'published', 0, true
from public.business_units bu
where not exists (select 1 from public.award_templates existing where existing.business_unit_id = bu.id and existing.is_preset);

-- Exactly one active default per business unit; the existing partial unique index continues to enforce this rule.
update public.award_templates candidate set is_default = true, updated_at = now()
where candidate.id in (
  select distinct on (source.business_unit_id) source.id from public.award_templates source
  where source.business_unit_id is not null and source.is_preset and source.is_active and source.template_status = 'published'
    and not exists (select 1 from public.award_templates current_default where current_default.business_unit_id = source.business_unit_id and current_default.is_default and current_default.is_active)
  order by source.business_unit_id, source.is_system desc, source.updated_at desc
);

with standard_awards(preset_key, title, description, badge_key, sort_order, color) as (
  values
    ('standard-guest-experience-star', 'Guest Experience Star', 'Creates moments guests will never forget.', 'guest-experience-star', 1, '#E11D48'),
    ('standard-customer-delight-champion', 'Customer Delight Champion', 'Turns every interaction into delight.', 'customer-delight-champion', 2, '#7C3AED'),
    ('standard-team-player-award', 'Team Player Award', 'Collaborates, supports, and lifts the team.', 'team-player-award', 3, '#4F46E5'),
    ('standard-above-and-beyond', 'Above & Beyond', 'Goes the extra mile without being asked.', 'above-and-beyond', 4, '#EA580C'),
    ('standard-service-excellence', 'Service Excellence', 'Delivers outstanding service, every time.', 'service-excellence', 5, '#0891B2'),
    ('standard-problem-solver', 'Problem Solver', 'Finds solutions and makes things better.', 'problem-solver', 6, '#0F766E'),
    ('standard-safety-champion', 'Safety Champion', 'Puts safety first, every single day.', 'safety-champion', 7, '#DC2626'),
    ('standard-reliability-consistency', 'Reliability & Consistency', 'Dependable, consistent, and always delivers.', 'reliability-consistency', 8, '#92400E'),
    ('standard-sales-spark', 'Sales Spark', 'Drives results and creates opportunities.', 'sales-spark', 9, '#0E7490'),
    ('standard-culture-builder', 'Culture Builder', 'Builds a positive culture where people thrive.', 'culture-builder', 10, '#DB2777')
), prepared as (
  select a.*, jsonb_build_object(
    'backgroundColor', '#FFFFFF', 'backgroundImageUrl', '', 'borderWidth', 0, 'borderColor', a.color,
    'fontFamily', 'Inter, ui-sans-serif, system-ui, sans-serif', 'titleColor', '#111827', 'textColor', '#111827',
    'headerText', upper(a.title), 'bodyText', 'For {{award_reason}}',
    'signatories', jsonb_build_array(jsonb_build_object('name', 'Authorized Signatory', 'title', 'Management')),
    'logoUrl', '', 'accentColor', a.color, 'secondaryAccentColor', '#312E81',
    'orientation', 'portrait', 'badgeStyle', 'outline', 'badgeKey', a.badge_key,
    'layoutVersion', 'modern-v2', 'brandName', 'TNG HRIS', 'wordmarkText', 'TNG HRIS'
  ) design from standard_awards a
)
insert into public.award_templates(title, description, badge_icon_url, is_active, design, category, is_default, is_preset, preset_key, badge_key, template_status, sort_order, is_system)
select title, description, '', true, design, 'Core Recognition', false, false, preset_key, badge_key, 'published', sort_order, true from prepared
on conflict (preset_key) where preset_key is not null do update set
  title = excluded.title, description = excluded.description, badge_key = excluded.badge_key,
  sort_order = excluded.sort_order, is_system = true, is_active = true, template_status = 'published', updated_at = now();

-- RLS remains enabled and the existing policies/permission matrix remain authoritative.
alter table public.award_templates enable row level security;

commit;
