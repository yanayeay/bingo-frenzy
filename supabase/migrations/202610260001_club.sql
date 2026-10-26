-- Run once in the SQL Editor of your Supabase project.
begin;

create table if not exists public.bingo_players (
 id text primary key,
 name text not null check (char_length(name) between 1 and 40),
 name_key text not null unique,
 game_id text not null default '',
 updated_at bigint not null
);

create table if not exists public.bingo_listings (
 id text primary key,
 player_id text not null references public.bingo_players(id),
 name text not null check (char_length(name) between 1 and 100),
 card_key text not null,
 album text not null default '',
 sender text not null default '' check (char_length(sender)<=80),
 star bigint check (star between 1 and 9007199254740991),
 card_type text not null default 'Regular' check (card_type in ('Regular','Gold','King')),
 kind text not null check (kind in ('have','need')),
 quantity integer not null default 1 check (quantity between 1 and 99),
 updated_at bigint not null,
 unique(player_id,card_key),
 check (kind <> 'need' or quantity=1)
);

create index if not exists bingo_listings_player on public.bingo_listings(player_id);
alter table public.bingo_players enable row level security;
alter table public.bingo_listings enable row level security;
-- Browsers use /api/club. Only the Vercel server key accesses these tables.
revoke all on public.bingo_players, public.bingo_listings from anon, authenticated;
grant select,insert,update,delete on public.bingo_players, public.bingo_listings to service_role;

-- Optional one-time import of the old club. All rows commit together or none do.
create or replace function public.bingo_import_club(data jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare member_count integer; card_count integer;
begin
 lock table public.bingo_players, public.bingo_listings in exclusive mode;
 if exists(select 1 from public.bingo_players) or exists(select 1 from public.bingo_listings) then
  raise exception 'Import requires empty club tables; existing data was not changed.';
 end if;
 insert into public.bingo_players(id,name,name_key,game_id,updated_at)
 select id,name,name_key,game_id,updated_at from jsonb_to_recordset(data->'players')
 as p(id text,name text,name_key text,game_id text,updated_at bigint);
 get diagnostics member_count=row_count;
 insert into public.bingo_listings(id,player_id,name,card_key,album,sender,star,card_type,kind,quantity,updated_at)
 select id,player_id,name,card_key,album,sender,star,card_type,kind,quantity,updated_at
 from jsonb_to_recordset(data->'listings') as c(id text,player_id text,name text,card_key text,album text,sender text,star bigint,card_type text,kind text,quantity integer,updated_at bigint);
 get diagnostics card_count=row_count;
 return jsonb_build_object('members',member_count,'cards',card_count);
end;
$$;
revoke all on function public.bingo_import_club(jsonb) from public,anon,authenticated;
grant execute on function public.bingo_import_club(jsonb) to service_role;

commit;
