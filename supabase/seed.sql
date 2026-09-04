-- Optional seed data for local testing of the desktop app against Supabase.
-- EDIT the two phone numbers to match how you'll log in, then run this after
-- the migration (the bot also upserts these profiles from its config).

insert into profiles (role, phone, display_name)
values
  ('approver', '+10000000002', 'Approver'),
  ('doer',     '+10000000001', 'Doer')
on conflict (role) do update
  set phone = excluded.phone, display_name = excluded.display_name;

-- A sample recurring template + a couple of approved tasks so the dashboard
-- and history have something to show before the bot starts writing real data.
do $$
declare
  v_doer bigint;
  v_appr bigint;
  v_tmpl bigint;
  v_inst bigint;
begin
  select id into v_doer from profiles where role = 'doer';
  select id into v_appr from profiles where role = 'approver';

  insert into task_templates (title, description, amount_cents, schedule_cron, assignee_id, approver_id)
  values ('Wash the car', 'Soap, rinse, dry', 1000, '0 18 * * *', v_doer, v_appr)
  returning id into v_tmpl;

  insert into task_instances (template_id, kind, title, description, amount_cents, assignee_id, approver_id, status, created_at)
  values (v_tmpl, 'assigned', 'Wash the car', 'Soap, rinse, dry', 1000, v_doer, v_appr, 'approved', now() - interval '3 days')
  returning id into v_inst;
  insert into ledger_entries (user_id, instance_id, amount_cents, type, note, created_at)
  values (v_doer, v_inst, 1000, 'earning', 'Task: Wash the car', now() - interval '3 days');

  insert into task_instances (template_id, kind, title, description, amount_cents, assignee_id, approver_id, status, created_at)
  values (null, 'appraisal', 'Cleaned the garage', 'Swept + organized', 2000, v_doer, v_appr, 'approved', now() - interval '1 day')
  returning id into v_inst;
  insert into ledger_entries (user_id, instance_id, amount_cents, type, note, created_at)
  values (v_doer, v_inst, 2000, 'earning', 'Appraisal: Cleaned the garage', now() - interval '1 day');

  -- A recorded cash-out (V1: number only)
  insert into ledger_entries (user_id, instance_id, amount_cents, type, note, created_at)
  values (v_doer, null, -500, 'cashout', 'Cash-out (recorded)', now() - interval '2 hours');
end $$;
