-- TaskBounty — initial Supabase (Postgres) schema.
--
-- Mirrors the bot's data model (see docs/architecture.md) so the Telegram bot
-- and the desktop app can share one cloud datastore. Money is integer cents.
--
-- SECURITY NOTE (V1): RLS is enabled, but because V1 logs in with a phone code
-- delivered over Telegram (not Supabase Auth), the policies below grant the
-- `anon` role broad access — the login gate, not the database, is what keeps
-- strangers out. This is fine for a private two-person project. V2 hardening
-- (real per-user RLS via Supabase Auth or a bot-minted JWT) is tracked in
-- docs/payments-v2.md's sibling: docs/desktop-supabase-setup.md.

-- ---------------------------------------------------------------- tables ----

create table if not exists profiles (
  id                bigint generated always as identity primary key,
  role              text not null unique check (role in ('approver', 'doer')),
  phone             text,
  telegram_id       bigint,
  telegram_username text,
  display_name      text,
  telegram_chat_id  bigint,
  created_at        timestamptz not null default now()
);

create table if not exists task_templates (
  id            bigint generated always as identity primary key,
  title         text not null,
  description   text,
  amount_cents  integer not null check (amount_cents >= 0),
  schedule_cron text,
  assignee_id   bigint not null references profiles(id),
  approver_id   bigint not null references profiles(id),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists task_instances (
  id               bigint generated always as identity primary key,
  template_id      bigint references task_templates(id),
  kind             text not null default 'assigned' check (kind in ('assigned', 'appraisal')),
  title            text not null,
  description      text,
  amount_cents     integer not null check (amount_cents >= 0),
  assignee_id      bigint not null references profiles(id),
  approver_id      bigint not null references profiles(id),
  due_at           timestamptz,
  status           text not null default 'assigned'
                     check (status in ('assigned', 'submitted', 'approved', 'rejected')),
  created_at       timestamptz not null default now(),
  last_reminded_at timestamptz
);

create table if not exists submissions (
  id               bigint generated always as identity primary key,
  instance_id      bigint not null references task_instances(id),
  telegram_file_id text,
  storage_path     text,            -- object path in the 'proofs' storage bucket
  note             text,
  submitted_at     timestamptz not null default now()
);

create table if not exists reviews (
  id            bigint generated always as identity primary key,
  submission_id bigint not null references submissions(id),
  approver_id   bigint not null references profiles(id),
  decision      text not null check (decision in ('approved', 'rejected')),
  note          text,
  decided_at    timestamptz not null default now()
);

create table if not exists ledger_entries (
  id           bigint generated always as identity primary key,
  user_id      bigint not null references profiles(id),
  instance_id  bigint references task_instances(id),
  amount_cents integer not null,     -- positive = earning, negative = cash-out
  type         text not null check (type in ('earning', 'cashout')),
  note         text,
  created_at   timestamptz not null default now()
);

-- One-time login codes, delivered to the user over Telegram by the bot.
create table if not exists login_codes (
  id         bigint generated always as identity primary key,
  phone      text not null,
  code       text not null,
  expires_at timestamptz not null,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_instances_assignee on task_instances(assignee_id, status);
create index if not exists idx_instances_created on task_instances(created_at);
create index if not exists idx_ledger_user on ledger_entries(user_id);
create index if not exists idx_login_phone on login_codes(phone) where consumed = false;

-- --------------------------------------------------------- login RPCs -------

-- Create a login code for a phone. The bot (service role, listening on this
-- table) delivers it over Telegram. Returns nothing sensitive to the caller.
create or replace function request_login(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into login_codes (phone, code, expires_at)
  values (p_phone, v_code, now() + interval '5 minutes');
end;
$$;

-- Verify a phone + code. On success marks the code consumed and returns the
-- matching profile (if any). The app treats the returned row as its session.
create or replace function verify_login(p_phone text, p_code text)
returns table (profile_id bigint, role text, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  select lc.id into v_id
    from login_codes lc
   where lc.phone = p_phone
     and lc.code = p_code
     and lc.consumed = false
     and lc.expires_at > now()
   order by lc.id desc
   limit 1;

  if v_id is null then
    return; -- no rows => invalid/expired code
  end if;

  update login_codes set consumed = true where id = v_id;

  return query
    select p.id, p.role, p.display_name
      from profiles p
     where p.phone = p_phone;
end;
$$;

grant execute on function request_login(text) to anon;
grant execute on function verify_login(text, text) to anon;

-- --------------------------------------------------------------- RLS --------
-- V1: broad anon access (see SECURITY NOTE at top). login_codes is intentionally
-- left with NO anon policy so codes can't be read from the client.

alter table profiles       enable row level security;
alter table task_templates enable row level security;
alter table task_instances enable row level security;
alter table submissions    enable row level security;
alter table reviews        enable row level security;
alter table ledger_entries enable row level security;
alter table login_codes    enable row level security;

create policy anon_read_profiles       on profiles       for select to anon using (true);
create policy anon_read_templates      on task_templates for select to anon using (true);
create policy anon_write_templates     on task_templates for all    to anon using (true) with check (true);
create policy anon_read_instances      on task_instances for select to anon using (true);
create policy anon_read_submissions    on submissions    for select to anon using (true);
create policy anon_read_reviews        on reviews        for select to anon using (true);
create policy anon_read_ledger         on ledger_entries for select to anon using (true);

-- ------------------------------------------------------------ storage -------

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

create policy anon_read_proofs on storage.objects
  for select to anon using (bucket_id = 'proofs');
