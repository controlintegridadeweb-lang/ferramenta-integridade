-- ════════════════════════════════════════════════════════════════════════════
-- SCHEMA SUPABASE — Anotações do Analista
-- Ferramenta de Avaliação de Integridade (Decreto 34.196/2024)
-- ────────────────────────────────────────────────────────────────────────────
-- Como usar:
--   1. Abra o Supabase → SQL Editor
--   2. Cole TODO este arquivo e clique em "Run"
--   3. Em Settings → API, copie a Project URL e a SERVICE_ROLE key para
--      server/.env (SUPABASE_URL e SUPABASE_SERVICE_KEY).
--
-- MODELO DE ACESSO
--   O acesso ao banco passa EXCLUSIVAMENTE pelo back-end Node, que usa a
--   service_role key. A anon key NÃO é mais usada por este projeto e não tem
--   nenhuma permissão sobre estas tabelas (RLS ligado, sem políticas para anon).
--   A autenticação dos usuários é feita no back-end (ver server/.env: API_*).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tabela principal ─────────────────────────────────────────────────────────
-- Guarda APENAS o trabalho manual do analista. Os dados brutos da planilha
-- permanecem no Google Sheets (fonte da verdade) e são lidos em tempo real.
--
--   uid             chave estável da linha (processo|edital|uasg) — gerada no front
--   dados           JSON com os campos do analista (whitelist validada no back-end)
--   versao          contador de versão para controle de conflito (optimistic lock)
--   atualizado_por  identificador do usuário que fez a última gravação
--   atualizado_em   timestamp da última gravação
--   criado_em       timestamp de criação

create table if not exists public.anotacoes_analista (
  uid             text primary key,
  dados           jsonb       not null default '{}'::jsonb,
  versao          integer     not null default 1,
  atualizado_por  text,
  atualizado_em   timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

-- Colunas novas para bases que já existiam antes desta migração:
alter table public.anotacoes_analista
  add column if not exists versao integer not null default 1;
alter table public.anotacoes_analista
  add column if not exists atualizado_por text;

create index if not exists idx_anotacoes_atualizado
  on public.anotacoes_analista (atualizado_em desc);

-- ── Tabela de auditoria ──────────────────────────────────────────────────────
-- Registro append-only de toda operação de escrita (upsert/delete). Não é
-- apagada pela aplicação. Permite reconstruir o histórico de cada anotação.

create table if not exists public.auditoria_anotacoes (
  id            bigint generated always as identity primary key,
  uid           text        not null,
  acao          text        not null check (acao in ('upsert', 'delete')),
  ator          text,
  versao_nova   integer,
  dados_antes   jsonb,
  dados_depois  jsonb,
  origem_ip     text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_auditoria_uid
  on public.auditoria_anotacoes (uid, criado_em desc);
create index if not exists idx_auditoria_criado
  on public.auditoria_anotacoes (criado_em desc);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- RLS LIGADO e SEM POLÍTICAS para anon/authenticated. Resultado: nenhuma chave
-- pública (anon) consegue ler ou escrever. Apenas a service_role (usada só pelo
-- back-end) acessa os dados, pois a service_role ignora o RLS por definição.

alter table public.anotacoes_analista  enable row level security;
alter table public.auditoria_anotacoes enable row level security;

drop policy if exists "anon_select" on public.anotacoes_analista;
drop policy if exists "anon_insert" on public.anotacoes_analista;
drop policy if exists "anon_update" on public.anotacoes_analista;
drop policy if exists "anon_delete" on public.anotacoes_analista;
drop policy if exists "auth_all"    on public.anotacoes_analista;

-- (Nenhuma política é criada de propósito: acesso só via service_role no back-end.)

-- ── Função de upsert com controle de conflito + auditoria ────────────────────
-- Numa única transação: valida a versão esperada (optimistic lock), grava
-- incrementando a versão e registra na auditoria. p_versao_esperada = null pula
-- a checagem de conflito (last-write-wins explícito), mas ainda audita.

create or replace function public.upsert_anotacao(
  p_uid              text,
  p_dados            jsonb,
  p_ator             text,
  p_origem_ip        text,
  p_versao_esperada  integer default null
) returns public.anotacoes_analista
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual   public.anotacoes_analista;
  v_result  public.anotacoes_analista;
  v_existia boolean := false;
begin
  select * into v_atual from public.anotacoes_analista where uid = p_uid;
  v_existia := found;

  if v_existia and p_versao_esperada is not null and v_atual.versao <> p_versao_esperada then
    raise exception 'conflito_versao: esperado %, atual %', p_versao_esperada, v_atual.versao
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes_analista (uid, dados, versao, atualizado_por, atualizado_em)
    values (p_uid, p_dados, 1, p_ator, now())
  on conflict (uid) do update
    set dados          = excluded.dados,
        versao         = public.anotacoes_analista.versao + 1,
        atualizado_por = excluded.atualizado_por,
        atualizado_em  = now()
  returning * into v_result;

  insert into public.auditoria_anotacoes
    (uid, acao, ator, versao_nova, dados_antes, dados_depois, origem_ip)
    values (p_uid, 'upsert', p_ator, v_result.versao,
            case when v_existia then v_atual.dados else null end, p_dados, p_origem_ip);

  return v_result;
end;
$$;

-- ── Função de delete com auditoria ───────────────────────────────────────────
create or replace function public.delete_anotacao(
  p_uid       text,
  p_ator      text,
  p_origem_ip text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.anotacoes_analista;
begin
  select * into v_atual from public.anotacoes_analista where uid = p_uid;
  if not found then
    return; -- idempotente: apagar o que não existe não é erro
  end if;

  delete from public.anotacoes_analista where uid = p_uid;

  insert into public.auditoria_anotacoes
    (uid, acao, ator, versao_nova, dados_antes, dados_depois, origem_ip)
    values (p_uid, 'delete', p_ator, null, v_atual.dados, null, p_origem_ip);
end;
$$;
