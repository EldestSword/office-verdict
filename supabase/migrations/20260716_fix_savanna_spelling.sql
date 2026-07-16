update public.people
set name = replace(name, 'Savannah', 'Savanna')
where name like '%Savannah%';
