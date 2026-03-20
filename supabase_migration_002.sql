-- LinkedIn Lead Radar — Dashboard Schema (run after 001_init.sql)

create table public.leads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  name         text not null,
  headline     text,
  company      text,
  profile_url  text,
  avatar_url   text,
  notes        text,
  tags         text[] default '{}',
  status       text default 'new',
  source       text default 'manual',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table public.saved_comments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  lead_id      uuid references public.leads(id) on delete set null,
  post_text    text,
  comment_text text not null,
  post_author  text,
  post_url     text,
  used         boolean default false,
  rating       integer check (rating between 1 and 5),
  created_at   timestamptz default now()
);

create index leads_user_id on public.leads (user_id, created_at desc);
create index leads_status  on public.leads (user_id, status);
create index comments_user on public.saved_comments (user_id, created_at desc);

alter table public.leads          enable row level security;
alter table public.saved_comments enable row level security;

create policy "own_leads"    on public.leads          for all using (auth.uid() = user_id);
create policy "own_comments" on public.saved_comments for all using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger leads_updated_at before update on public.leads
  for each row execute procedure public.set_updated_at();

create or replace function public.get_dashboard_stats(p_user_id uuid)
returns json language sql stable security definer as $$
  select json_build_object(
    'total_leads',    (select count(*) from public.leads          where user_id = p_user_id),
    'total_comments', (select count(*) from public.saved_comments where user_id = p_user_id),
    'used_comments',  (select count(*) from public.saved_comments where user_id = p_user_id and used = true),
    'comments_this_week', (
      select count(*) from public.usage
      where user_id = p_user_id
        and created_at >= date_trunc('week', now())
    )
  );
$$;

-- Add tone_profile and output_language to profiles table
alter table public.profiles 
  add column if not exists tone_profile    text,
  add column if not exists output_language text default 'auto';
