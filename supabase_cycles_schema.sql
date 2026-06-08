-- ════════════════════════════════════════════════════════════════════════════
-- SCHEMA SUPABASE — Ciclos de Análise e Relatórios
-- Ferramenta de Avaliação de Integridade (Decreto 34.196/2024)
-- ────────────────────────────────────────────────────────────────────────────
-- Rode DEPOIS de supabase_schema.sql, no mesmo SQL Editor.
--
-- MODELO
--   Eixo de CONFORMIDADE (classificador, no front): diz se um registro é
--     'avaliacao-obrigatoria', 'dispensada', etc. NÃO vive aqui.
--   Eixo de CICLO DE VIDA (este schema): para os registros obrigatórios,
--     controla PENDENTE → EM_ANALISE → VALIDADO → FINALIZADO e a vinculação a
--     relatórios. Um registro entra no ciclo pelo seu uid determinístico
--     (processo|edital|uasg), gerado no front. Sincronizações repetidas NÃO
--     recriam nem reabrem registros.
--
--   Acesso só via service_role (back-end). RLS ligado, sem políticas públicas.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tabela de análises (ciclo de vida por registro obrigatório) ──────────────
--   uid            chave estável do registro (mesma do anotacoes_analista)
--   status         PENDENTE | EM_ANALISE | VALIDADO | FINALIZADO
--   processo       rótulo legível do processo (para o histórico/auditoria)
--   snapshot       cópia dos dados do registro no momento relevante (auditoria)
--   analista_id    quem está/esteve avaliando
--   data_validacao quando passou para VALIDADO
--   relatorio_id   relatório que finalizou o registro (null até FINALIZADO)

create table if not exists public.analises (
  uid             text primary key,
  status          text not null default 'PENDENTE'
                    check (status in ('PENDENTE', 'EM_ANALISE', 'VALIDADO', 'FINALIZADO')),
  processo        text,
  snapshot        jsonb       not null default '{}'::jsonb,
  analista_id     text,
  data_validacao  timestamptz,
  relatorio_id    bigint,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_analises_status on public.analises (status);
create index if not exists idx_analises_relatorio on public.analises (relatorio_id);

-- ── Tabela de relatórios (lote fechado de análises) ──────────────────────────
--   numero          sequencial humano (#001, #002, ...) — único
--   gerado_por      analista responsável pela geração
--   total_registros quantos registros o lote incluiu
--   pdf_path        caminho do PDF no Supabase Storage (bucket 'relatorios')
--   pdf_url         URL pública/assinada para download

create table if not exists public.relatorios (
  id              bigint generated always as identity primary key,
  numero          integer     not null unique,
  gerado_por      text,
  gerado_em       timestamptz not null default now(),
  total_registros integer     not null default 0,
  pdf_path        text,
  pdf_url         text
);

-- ── Tabela de vínculo relatório ↔ análises ───────────────────────────────────
create table if not exists public.relatorio_registros (
  relatorio_id  bigint not null references public.relatorios(id) on delete cascade,
  uid           text   not null references public.analises(uid),
  snapshot      jsonb  not null default '{}'::jsonb,   -- estado do registro no fechamento
  primary key (relatorio_id, uid)
);

create index if not exists idx_rel_reg_uid on public.relatorio_registros (uid);

-- FK de analises.relatorio_id → relatorios.id (após ambas existirem)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_analises_relatorio'
  ) then
    alter table public.analises
      add constraint fk_analises_relatorio
      foreign key (relatorio_id) references public.relatorios(id);
  end if;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.analises            enable row level security;
alter table public.relatorios          enable row level security;
alter table public.relatorio_registros enable row level security;
-- Sem políticas: acesso exclusivo via service_role no back-end.

-- ── Sincronização de registros obrigatórios ──────────────────────────────────
-- Recebe um array de {uid, processo, snapshot} com os registros obrigatórios do
-- ciclo atual. Insere SÓ os que ainda não existem (PENDENTE). Nunca reabre nem
-- altera registros já existentes (inclusive FINALIZADOS). Idempotente.
-- Retorna quantos foram efetivamente inseridos.

create or replace function public.sincronizar_obrigatorios(p_registros jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inseridos integer := 0;
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_registros, '[]'::jsonb))
  loop
    insert into public.analises (uid, status, processo, snapshot)
      values (
        v_item->>'uid',
        'PENDENTE',
        v_item->>'processo',
        coalesce(v_item->'snapshot', '{}'::jsonb)
      )
    on conflict (uid) do nothing;     -- já existe: não recria, não reabre
    if found then v_inseridos := v_inseridos + 1; end if;
  end loop;
  return v_inseridos;
end;
$$;

-- ── Transição de status de uma análise ───────────────────────────────────────
-- Aplica transições válidas e bloqueia retrocessos. FINALIZADO é terminal:
-- nunca volta para PENDENTE/EM_ANALISE/VALIDADO.
-- Transições permitidas:
--   PENDENTE   → EM_ANALISE
--   EM_ANALISE → VALIDADO   (define data_validacao e analista)
--   EM_ANALISE → PENDENTE   (analista desiste; reversível antes de validar)
--   VALIDADO   → EM_ANALISE  (reabre para correção, antes do relatório)
-- (PENDENTE→VALIDADO direto é permitido por conveniência do front.)

create or replace function public.transicionar_analise(
  p_uid       text,
  p_novo      text,
  p_analista  text
) returns public.analises
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.analises;
begin
  select * into v_atual from public.analises where uid = p_uid for update;
  if not found then
    raise exception 'analise_inexistente: %', p_uid using errcode = 'P0002';
  end if;

  if v_atual.status = 'FINALIZADO' then
    raise exception 'finalizado_imutavel: % já está FINALIZADO', p_uid using errcode = 'P0001';
  end if;

  if p_novo not in ('PENDENTE', 'EM_ANALISE', 'VALIDADO') then
    raise exception 'status_invalido: %', p_novo using errcode = 'P0001';
  end if;

  update public.analises
    set status         = p_novo,
        analista_id    = coalesce(p_analista, analista_id),
        data_validacao = case when p_novo = 'VALIDADO' then now()
                              when p_novo = 'EM_ANALISE' then null
                              else data_validacao end,
        atualizado_em  = now()
    where uid = p_uid
    returning * into v_atual;

  return v_atual;
end;
$$;

-- ── Geração de relatório (encerramento de ciclo, atômico) ─────────────────────
-- Numa única transação:
--   1. Seleciona os uids informados que estão VALIDADO (ignora o resto).
--   2. Cria o relatório com numero sequencial (max+1), travando contra corrida.
--   3. Vincula os registros e os marca FINALIZADO apontando para o relatório.
-- Retorna o relatório criado. Se nenhum registro elegível, ergue exceção.
-- O PDF é anexado depois por atualizar_pdf_relatorio (precisa do id/numero).

create or replace function public.gerar_relatorio(
  p_uids      text[],
  p_gerado_por text
) returns public.relatorios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero    integer;
  v_relatorio public.relatorios;
  v_total     integer;
begin
  -- Trava a tabela de relatórios para serializar a numeração e evitar duplicatas.
  lock table public.relatorios in exclusive mode;

  -- Conta quantos dos uids informados estão realmente VALIDADO.
  select count(*) into v_total
    from public.analises
    where uid = any(p_uids) and status = 'VALIDADO';

  if v_total = 0 then
    raise exception 'sem_registros_validados: nenhum registro elegível para o relatório'
      using errcode = 'P0001';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.relatorios;

  insert into public.relatorios (numero, gerado_por, total_registros)
    values (v_numero, p_gerado_por, v_total)
    returning * into v_relatorio;

  -- Vincula e finaliza, em uma passada, somente os VALIDADO.
  insert into public.relatorio_registros (relatorio_id, uid, snapshot)
    select v_relatorio.id, a.uid, a.snapshot
      from public.analises a
      where a.uid = any(p_uids) and a.status = 'VALIDADO';

  update public.analises
    set status        = 'FINALIZADO',
        relatorio_id  = v_relatorio.id,
        atualizado_em = now()
    where uid = any(p_uids) and status = 'VALIDADO';

  return v_relatorio;
end;
$$;

-- ── Anexar o PDF ao relatório (após upload no Storage) ───────────────────────
create or replace function public.atualizar_pdf_relatorio(
  p_id       bigint,
  p_pdf_path text,
  p_pdf_url  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.relatorios
    set pdf_path = p_pdf_path, pdf_url = p_pdf_url
    where id = p_id;
end;
$$;
