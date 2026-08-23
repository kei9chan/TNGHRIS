insert into public.job_offer_templates (name, business_unit_id, business_unit, description, category, status, template_key, is_starter, template_data)
select seed.name, bu.id, seed.business_unit, seed.description, seed.category, 'Active', seed.template_key, true,
  jsonb_build_object(
    'jobTitle', seed.job_title,
    'businessUnit', seed.business_unit,
    'department', 'Guest Experience',
    'reportingManager', 'Operations Manager',
    'workLocation', 'Philippines',
    'workSetup', 'Onsite',
    'rolePurpose', 'Create safe, memorable guest experiences while supporting smooth day-to-day operations and strong team performance.',
    'responsibilities', jsonb_build_array(
      jsonb_build_object('id','r1','label','Welcome guests and deliver warm, attentive service.'),
      jsonb_build_object('id','r2','label','Follow operating, safety, cash-handling, and reporting procedures.'),
      jsonb_build_object('id','r3','label','Work closely with the team to keep the venue guest-ready.')
    ),
    'successOutcomes', jsonb_build_array(
      jsonb_build_object('id','s1','label','Consistently high guest satisfaction.'),
      jsonb_build_object('id','s2','label','Accurate and timely operating reports.'),
      jsonb_build_object('id','s3','label','Strong teamwork and reliable shift execution.')
    ),
    'milestones', jsonb_build_object(
      '30',jsonb_build_object('description','Complete onboarding and learn core systems and standards.'),
      '60',jsonb_build_object('description','Own regular shift responsibilities and contribute improvements.'),
      '90',jsonb_build_object('description','Complete a performance review and agree on next growth priorities.')
    ),
    'currency','PHP','payFrequency','Monthly','payrollSchedule','15th and 30th of each month',
    'grossMonthlySalary',40000,'grossAnnualizedSalary',480000,'compensationEntered',true,
    'probationarySalary',40000,'regularizationSalary',40000,
    'commissionOrIncentive','Performance-based, subject to policy and eligibility.',
    'bonusEligibility','Subject to company policy, eligibility, and performance.',
    'allowances','[]'::jsonb,
    'benefits',jsonb_build_array(
      jsonb_build_object('id','hmo','name','HMO','description','Healthcare coverage subject to plan eligibility.','included',true,'value','Standard plan'),
      jsonb_build_object('id','government','name','Government contributions','description','SSS, PhilHealth and Pag-IBIG contributions as required by law.','included',true),
      jsonb_build_object('id','leave','name','Paid leave','description','Paid leave subject to policy and eligibility.','included',true)
    ),
    'growthItems',jsonb_build_array(
      jsonb_build_object('id','onboarding','name','30-day onboarding','description','A structured introduction to the team, tools, and role expectations.','included',true),
      jsonb_build_object('id','coaching','name','60-day coaching check-in','description','A coaching conversation to review progress and remove blockers.','included',true),
      jsonb_build_object('id','review','name','90-day performance review','description','A review point to align on progress and next steps.','included',true)
    ),
    'welcomeMessage', 'We are excited to welcome you to our team. Here is a clear look at your role, compensation, benefits, and growth opportunity.',
    'requireSignature',true,'termsReviewed',false,
    'appearance', seed.appearance
  )
from (values
  ('Dessert Museum — Guest Experience','The Dessert Museum','Reusable branded offer for guest-experience roles.','Guest Experience','dessert-museum-offer','Guest Experience Associate','{"preset":"The Dessert Museum","primaryColor":"#8F234C","accentColor":"#FF72A8","textColor":"#3A1726","pageBackgroundColor":"#FFF7FA","fontFamily":"Inter","buttonStyle":"Rounded","cardStyle":"Soft","sectionLayout":"Cards"}'::jsonb),
  ('Gootopia — Experience Facilitator','Gootopia','Reusable branded offer for facilitation roles.','Guest Experience','gootopia-offer','Experience Facilitator','{"preset":"Gootopia","primaryColor":"#6D28D9","accentColor":"#A78BFA","textColor":"#251447","pageBackgroundColor":"#FAF7FF","fontFamily":"Inter","buttonStyle":"Rounded","cardStyle":"Soft","sectionLayout":"Cards"}'::jsonb),
  ('Bakebe — Baking Studio Host','Bakebe','Reusable branded offer for studio roles.','Studio Operations','bakebe-offer','Baking Studio Host','{"preset":"Bakebe","primaryColor":"#7A3E2C","accentColor":"#D97757","textColor":"#332018","pageBackgroundColor":"#FFF9EF","fontFamily":"Inter","buttonStyle":"Rounded","cardStyle":"Soft","sectionLayout":"Cards"}'::jsonb),
  ('Inflatable Island — Guest Experience & Safety','Inflatable Island Beach Club','Reusable branded offer for operations roles.','Operations','inflatable-island-offer','Guest Experience & Safety Associate','{"preset":"Inflatable Island","primaryColor":"#009C9C","accentColor":"#FF6B6B","textColor":"#0D1B2A","pageBackgroundColor":"#F5FFFF","fontFamily":"Inter","buttonStyle":"Rounded","cardStyle":"Soft","sectionLayout":"Cards"}'::jsonb),
  ('Fun Roof — Guest Experience & Reservations','The Fun Roof','Reusable branded offer for hospitality roles.','Hospitality','fun-roof-offer','Guest Experience & Reservations Host','{"preset":"The Fun Roof","primaryColor":"#171117","accentColor":"#F00083","textColor":"#211827","pageBackgroundColor":"#FFF7FC","fontFamily":"Inter","buttonStyle":"Rounded","cardStyle":"Soft","sectionLayout":"Cards"}'::jsonb),
  ('Sprinkle Saloon — Guest Experience','The Sprinkle Saloon','Reusable branded offer for guest-experience roles.','Guest Experience','sprinkle-saloon-offer','Guest Experience Associate','{"preset":"The Sprinkle Saloon","primaryColor":"#9D174D","accentColor":"#F9A8D4","textColor":"#3F1026","pageBackgroundColor":"#FFF7FB","fontFamily":"Inter","buttonStyle":"Rounded","cardStyle":"Soft","sectionLayout":"Cards"}'::jsonb)
) as seed(name,business_unit,description,category,template_key,job_title,appearance)
left join public.business_units bu on lower(bu.name) = lower(seed.business_unit)
on conflict (template_key) do nothing;

