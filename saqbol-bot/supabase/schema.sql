-- SaqBol AI: общая база индикаторов мошенников.
-- Тексты сообщений и личности пользователей здесь не хранятся.

create table if not exists indicators (
    id              bigint generated always as identity primary key,
    kind            text not null check (kind in ('phone', 'card', 'domain', 'telegram')),
    value           text not null,
    display         text not null,
    first_seen      timestamptz not null default now(),
    last_seen       timestamptz not null default now(),
    reports_count   int not null default 0,   -- всего жалоб
    reporters_count int not null default 0,   -- независимых людей
    last_scheme     text,
    -- unverified: сигнал для проверки, не приговор. confirmed/rejected ставит аналитик банка.
    status          text not null default 'unverified' check (status in ('unverified', 'confirmed', 'rejected')),
    unique (kind, value)
);

create table if not exists reports (
    id            bigint generated always as identity primary key,
    indicator_id  bigint not null references indicators (id) on delete cascade,
    reporter_hash text not null,
    verdict       text not null,
    scheme        text,
    created_at    timestamptz not null default now()
);
create index if not exists reports_indicator_idx on reports (indicator_id);
create index if not exists reports_created_idx on reports (created_at);

-- Обезличенная статистика проверок для дашборда
create table if not exists checks (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),
    verdict     text not null,
    confidence  int not null,
    scheme      text,
    source      text not null,
    lang        text,
    input_type  text not null default 'text',  -- text | photo | voice
    has_url     boolean not null default false
);
create index if not exists checks_created_idx on checks (created_at);

-- «Доверенный человек»: кого предупредить, если подопечному пришёл скам
create table if not exists guardians (
    ward_chat_id     bigint not null,
    guardian_chat_id bigint not null,
    ward_name        text,
    created_at       timestamptz not null default now(),
    primary key (ward_chat_id, guardian_chat_id)
);

create table if not exists link_codes (
    code         text primary key,
    ward_chat_id bigint not null,
    ward_name    text,
    expires_at   timestamptz not null
);

-- Одна атомарная операция: записать жалобу и вернуть, сколько людей уже жаловались ДО неё.
create or replace function report_indicator(
    p_kind text, p_value text, p_display text,
    p_reporter text, p_verdict text, p_scheme text
) returns table (prev_reporters int, prev_reports int, first_seen timestamptz, status text)
language plpgsql security definer set search_path = public as $$
declare
    v_id bigint;
    v_prev_reporters int;
    v_prev_reports int;
    v_first timestamptz;
    v_status text;
    v_is_new_reporter boolean;
begin
    insert into indicators (kind, value, display) values (p_kind, p_value, p_display)
    on conflict (kind, value) do update set last_seen = now()
    returning indicators.id, indicators.reporters_count, indicators.reports_count,
              indicators.first_seen, indicators.status
    into v_id, v_prev_reporters, v_prev_reports, v_first, v_status;

    select not exists (select 1 from reports r where r.indicator_id = v_id and r.reporter_hash = p_reporter)
    into v_is_new_reporter;

    insert into reports (indicator_id, reporter_hash, verdict, scheme)
    values (v_id, p_reporter, p_verdict, p_scheme);

    update indicators set
        reports_count = reports_count + 1,
        reporters_count = reporters_count + (case when v_is_new_reporter then 1 else 0 end),
        last_scheme = coalesce(p_scheme, last_scheme)
    where id = v_id;

    -- Собственные прошлые жалобы человека не считаем «другими людьми»
    return query select
        v_prev_reporters - (case when v_is_new_reporter then 0 else 1 end),
        v_prev_reports, v_first, v_status;
end $$;

-- Только посмотреть, не записывая жалобу (для сообщений, которые бот счёл безопасными)
create or replace function lookup_indicator(p_kind text, p_value text)
returns table (reporters int, reports int, first_seen timestamptz, status text)
language sql security definer set search_path = public as $$
    select reporters_count, reports_count, first_seen, status
    from indicators where kind = p_kind and value = p_value;
$$;

-- Доступ только у бота (service_role). Публичный ключ не видит ничего.
alter table indicators enable row level security;
alter table reports    enable row level security;
alter table checks     enable row level security;
alter table guardians  enable row level security;
alter table link_codes enable row level security;
revoke execute on function report_indicator(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function lookup_indicator(text, text) from public, anon, authenticated;
