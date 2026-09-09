-- Policy correction: retain historical destination records; disallow new Bakebe free visits.
update public.family_visit_destinations set active=false where brand='Bakebe';

update public.benefit_types set description='Four different BU visits per calendar year: The Dessert Museum, Gootopia, The Fun Roof and Inflatable Island. Each approved visit covers entry for the employee and up to four immediate family members (five total guests). Each BU may be used once per calendar year, regardless of branch. Bakebe is excluded from free entry and has a separate 20% discount benefit requiring prior booking and approval. Food and drinks are not included in free entry; a separate 20% discount applies where available. Other charges are excluded. Unused visits expire at year end and cannot be transferred or converted to cash.',updated_at=now()
where name ilike '%family%visit%';

insert into public.benefit_types(name,description,max_value,requires_bod_approval,is_active)
select 'Bakebe — 20% Discount','20% off at Bakebe. Prior booking and approval are required before use. Include your selected Bakebe branch and booking details in the request. This is a discount, not free entry, and does not consume an annual Family Visit credit.',null,true,true
where not exists(select 1 from public.benefit_types where name='Bakebe — 20% Discount');

insert into public.benefit_types(name,description,max_value,requires_bod_approval,is_active)
select 'Food & Drinks — 20% Discount','20% off food and drinks at participating sites where available, including The Fun Roof and Inflatable Island. Include the intended site and visit date in your request so availability can be confirmed through the existing benefit approval process. Food and drinks are not free. This separate discount does not consume an annual Family Visit credit.',null,true,true
where not exists(select 1 from public.benefit_types where name='Food & Drinks — 20% Discount');
