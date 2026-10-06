-- 節目のタマゴ（練習日数・習得数）用のDB変更。Supabaseに未適用ならSQL Editorで実行する。

-- 入手経路に「event」を追加する。
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.kuwagata_individuals'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%obtained_via%'
  loop
    execute format('alter table public.kuwagata_individuals drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.kuwagata_individuals
  add constraint kuwagata_individuals_obtained_via_check
  check (obtained_via in ('stage_clear', 'roll', 'event'));

-- 節目のタマゴを配った記録（同じ節目で二重に配らないための台帳）。
create table if not exists public.kuwagata_egg_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  individual_id uuid references public.kuwagata_individuals(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

alter table public.kuwagata_egg_events enable row level security;
