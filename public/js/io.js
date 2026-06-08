
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1 — (entrada de dados)
   ───────────────────────────────────────────────────────────────────────────
   A ferramenta tem um único fluxo oficial de entrada: a sincronização com o
   Google Sheets (ver sheets.js / App.carregarSheets). O upload manual de
   arquivo foi removido para garantir uma fonte de verdade única e rastreável.
   O pipeline compartilhado de processamento (parseWorkbook, abaixo) é usado
   pela leitura do Sheets.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {ArrayBuffer} buffer        — conteúdo binário do .xlsx
 * @param {string}      nomeFonte     — rótulo exibido na UI (nome do arquivo ou "Google Sheets")
 * @param {Object}      [opts]
 * @param {string}      [opts.abaPreferida] — nome de aba a priorizar (default: "edital")
 */
async function parseWorkbook(buffer, nomeFonte, opts = {}) {
  const abaPref = (opts.abaPreferida || 'edital').toLowerCase();

  // cellDates: true → SheetJS converte automaticamente seriais de data em objetos Date
  const wb        = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.find(s => s.toLowerCase() === abaPref) ?? wb.SheetNames[0];
  const ws        = wb.Sheets[sheetName];
  const data      = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (data.length === 0) {
    showToast('Planilha vazia ou formato não reconhecido.', 'error');
    return;
  }

  _mapColumnNames(data);
  _normalizeFieldTypes(data);
  Normalizer.normalizeAll(data);
  Classifier.classifyAll(data);

  const rpt = Normalizer.getNormalizationReport(data);
  console.info(
    `[Normalizer] ${rpt.total} registros — ` +
    `modalidade: ${rpt.changed.modalidade}, tipo_objeto: ${rpt.changed.tipo_objeto}`
  );

  await loadDataset(data, nomeFonte);
  showToast(`${data.length.toLocaleString('pt-BR')} registros carregados com sucesso!`, 'success');
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1b — MAPEAMENTO AUTOMÁTICO DE COLUNAS
   (Parte do pipeline compartilhado de processamento — Seção 1a)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Mapeamento de colunas — aceita variações nos cabeçalhos da planilha.
 *
 * Problema: o código espera campos com nomes exatos (snake_case) como
 * 'valor_estimado', 'dt_public_edital', 'modalidade', etc. Planilhas reais
 * frequentemente têm cabeçalhos com espaços, acentos, maiúsculas ou abreviações
 * diferentes. Sem mapeamento, todos os campos ficam undefined e nenhum registro
 * é classificado.
 *
 * Solução: normaliza (strip acentos, lowercase, colapsa espaços) cada cabeçalho
 * e tenta match com uma tabela de aliases. Se encontrar, renomeia o campo para
 * o nome canônico esperado.
 *
 * Campos canônicos e seus aliases:
 *   valor_estimado   : "valor estimado", "vl estimado", "valor", "vl_est"...
 *   dt_public_edital : "data publicação", "dt publicação edital", "data pub"...
 *   dt_sessao        : "data sessão", "dt sessão", "data abertura"...
 *   modalidade       : "modalidade", "mod", "tipo licitação"...
 *   tipo_objeto      : "tipo objeto", "tipo do objeto", "natureza"...
 *   nome_Uasg        : "nome uasg", "órgão", "nome do orgao"...
 *   codigoUasg       : "codigo uasg", "código uasg", "cod uasg"...
 *   objeto           : "objeto", "descrição objeto", "objeto contratação"...
 *   observacoes      : "observações", "obs", "informações adicionais"...
 *   nat_despesa      : "natureza despesa", "nat despesa", "natureza"...
 *   fonte_recursos   : "fonte recursos", "fonte", "fonte de recursos"...
 *   processo         : "processo", "nº processo", "numero processo"...
 *   numero_ano_edital: "numero edital", "nº edital", "edital"...
 *   criterio         : "critério", "criterio", "critério julgamento"...
 *
 * @param {Object[]} data — dataset bruto do SheetJS (mutado in-place)
 * @returns {Object[]} — mesmo dataset com campos renomeados
 */
function _mapColumnNames(data) {
  if (!data || data.length === 0) return data;

  // ── Mapa de aliases → nome canônico ──────────────────────────────────────
  // Chave: forma normalizada do alias (sem acento, lowercase, sem espaço extra)
  // Valor: nome canônico esperado pelo código
  const ALIASES = {
    // valor_estimado
    'valor estimado':           'valor_estimado',
    'vl estimado':              'valor_estimado',
    'valor_estimado':           'valor_estimado',
    'valor':                    'valor_estimado',
    'vl est':                   'valor_estimado',
    'vl_est':                   'valor_estimado',
    'vlr estimado':             'valor_estimado',
    'vlr_estimado':             'valor_estimado',
    'valorestimado':            'valor_estimado',
    'valor estimado r$':        'valor_estimado',
    'valor (r$)':               'valor_estimado',
    'valor global':             'valor_estimado',
    'valor contrato':           'valor_estimado',
    'valor do contrato':        'valor_estimado',
    'vr estimado':              'valor_estimado',

    // dt_public_edital
    'dt publicacao edital':     'dt_public_edital',
    'dt_public_edital':         'dt_public_edital',
    'data publicacao':          'dt_public_edital',
    'data de publicacao':       'dt_public_edital',
    'data publicacao edital':   'dt_public_edital',
    'dt publicacao':            'dt_public_edital',
    'data pub':                 'dt_public_edital',
    'dt pub edital':            'dt_public_edital',
    'publicacao':               'dt_public_edital',
    'data publicação edital':   'dt_public_edital',
    'data pub edital':          'dt_public_edital',
    'dt pub':                   'dt_public_edital',
    'data abertura edital':     'dt_public_edital',
    'abertura edital':          'dt_public_edital',

    // dt_sessao
    'dt sessao':                'dt_sessao',
    'dt_sessao':                'dt_sessao',
    'data sessao':              'dt_sessao',
    'data da sessao':           'dt_sessao',
    'data abertura':            'dt_sessao',
    'data abertura sessao':     'dt_sessao',
    'data abertura proposta':   'dt_sessao',
    'dt abertura':              'dt_sessao',

    // modalidade
    'modalidade':               'modalidade',
    'modalidade licitacao':     'modalidade',
    'modalidade licitação':     'modalidade',
    'mod licitacao':            'modalidade',
    'tipo licitacao':           'modalidade',
    'tipo licitação':           'modalidade',
    'tipo de licitacao':        'modalidade',
    'mod':                      'modalidade',

    // tipo_objeto
    'tipo objeto':              'tipo_objeto',
    'tipo_objeto':              'tipo_objeto',
    'tipo do objeto':           'tipo_objeto',
    'tipo contratacao':         'tipo_objeto',
    'tipo de objeto':           'tipo_objeto',
    'tipo contratação':         'tipo_objeto',
    'natureza objeto':          'tipo_objeto',
    'natureza contratacao':     'tipo_objeto',

    // nome_Uasg
    'nome uasg':                'nome_Uasg',
    'nome_uasg':                'nome_Uasg',
    'nome_Uasg':                'nome_Uasg',
    'orgao':                    'nome_Uasg',
    'órgão':                    'nome_Uasg',
    'nome orgao':               'nome_Uasg',
    'nome do orgao':            'nome_Uasg',
    'unidade':                  'nome_Uasg',
    'nome da unidade':          'nome_Uasg',
    'nome unidade':             'nome_Uasg',
    'uasg':                     'nome_Uasg',
    'nome':                     'nome_Uasg',

    // codigoUasg
    'codigo uasg':              'codigoUasg',
    'codigo_uasg':              'codigoUasg',
    'codigoUasg':               'codigoUasg',
    'codigouasg':               'codigoUasg',
    'cod uasg':                 'codigoUasg',
    'cod_uasg':                 'codigoUasg',
    'codigo orgao':             'codigoUasg',
    'cod orgao':                'codigoUasg',
    'codigo da uasg':           'codigoUasg',
    'codigo':                   'codigoUasg',

    // objeto
    'objeto':                   'objeto',
    'objeto da contratacao':    'objeto',
    'objeto da licitacao':      'objeto',
    'descricao objeto':         'objeto',
    'descricao do objeto':      'objeto',
    'descricao':                'objeto',
    'objeto contratacao':       'objeto',
    'objeto contratação':       'objeto',

    // observacoes
    'observacoes':              'observacoes',
    'observações':              'observacoes',
    'obs':                      'observacoes',
    'observacao':               'observacoes',
    'observação':               'observacoes',
    'informacoes adicionais':   'observacoes',
    'informações adicionais':   'observacoes',
    'complemento':              'observacoes',

    // nat_despesa
    'natureza despesa':         'nat_despesa',
    'nat despesa':              'nat_despesa',
    'nat_despesa':              'nat_despesa',
    'natureza de despesa':      'nat_despesa',
    'natureza':                 'nat_despesa',
    'nd':                       'nat_despesa',
    'natureza da despesa':      'nat_despesa',

    // fonte_recursos
    'fonte recursos':           'fonte_recursos',
    'fonte_recursos':           'fonte_recursos',
    'fonte de recursos':        'fonte_recursos',
    'fonte':                    'fonte_recursos',
    'origem recursos':          'fonte_recursos',
    'fonte do recurso':         'fonte_recursos',

    // processo
    'processo':                 'processo',
    'numero processo':          'processo',
    'nº processo':              'processo',
    'no processo':              'processo',
    'proc':                     'processo',
    'nup':                      'processo',
    'numero do processo':       'processo',
    'n processo':               'processo',

    // numero_ano_edital
    'numero ano edital':        'numero_ano_edital',
    'numero_ano_edital':        'numero_ano_edital',
    'numero edital':            'numero_ano_edital',
    'nº edital':                'numero_ano_edital',
    'no edital':                'numero_ano_edital',
    'edital':                   'numero_ano_edital',
    'num edital':               'numero_ano_edital',
    'n edital':                 'numero_ano_edital',
    'edital/ano':               'numero_ano_edital',

    // criterio
    'criterio':                 'criterio',
    'critério':                 'criterio',
    'criterio julgamento':      'criterio',
    'critério de julgamento':   'criterio',
    'tipo criterio':            'criterio',
    'criterio de julgamento':   'criterio',
  };

  // ── Normaliza string para lookup ─────────────────────────────────────────
  function norm(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip acentos
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, ' ')  // remove caracteres especiais
      .replace(/\s+/g, ' ')           // colapsa espaços
      .trim();
  }

  // ── Detectar mapeamento a partir do primeiro registro ────────────────────
  const sample = data[0];
  const rawKeys = Object.keys(sample);

  // Mapear cada chave raw → canônica (só se não já for o nome canônico)
  const keyMap = {}; // rawKey → canonicalKey
  rawKeys.forEach(rawKey => {
    const normalized = norm(rawKey);
    const canonical  = ALIASES[normalized];
    if (canonical && rawKey !== canonical) {
      keyMap[rawKey] = canonical;
    }
  });

  // Se não há nada a mapear, retorna imediatamente
  if (Object.keys(keyMap).length === 0) return data;

  // Log de diagnóstico
  console.info('[ColMapper] Mapeamentos aplicados:', keyMap);

  // ── Aplicar renomeação em todo o dataset ─────────────────────────────────
  data.forEach(row => {
    Object.entries(keyMap).forEach(([rawKey, canonical]) => {
      if (rawKey in row && !(canonical in row)) {
        row[canonical] = row[rawKey];
        delete row[rawKey];
      }
    });
  });

  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1c — NORMALIZAÇÃO DE TIPOS DE CAMPOS
   (Parte do pipeline compartilhado de processamento — Seção 1a)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Normaliza tipos de campos de data e valor no dataset.
 *
 * CAMPOS DE DATA:
 *   Caso 1 (principal): SheetJS com cellDates:true → campo já é um objeto Date
 *     → converte para ISO YYYY-MM-DD via toISOString().
 *   Caso 2 (fallback): campo é número (serial Excel) → converte manualmente.
 * Correção: Excel conta erroneamente 29/02/1900 (que não existiu).
 *     Para seriais > 60 (datas após 01/03/1900), subtrai 25569 para obter Unix epoch.
 *     Para seriais <= 60 (raramente usados), subtrai 25568 para compensar o bug.
 *     Na prática, contratos públicos sempre terão datas > 1900, então o caso > 60
 *     cobre 100% dos casos reais.
 *   Caso 3: campo é string → usa normalizeDateToISO() do classifier para converter.
 *
 * CAMPO VALOR:
 *   Strings sigilosas (ex.: "sigiloso", "não informado", "n/a") → 0
 *   Valores numéricos → parseFloat
 *
 * @param {Object[]} data — dataset bruto do SheetJS (mutado in-place)
 */
function _normalizeFieldTypes(data) {
  const SIGILOSO_STRINGS = ['sigiloso', 'não informado', 'nao informado', 'n/a', '-', '—'];

  data.forEach(row => {
    ['dt_public_edital', 'dt_sessao'].forEach(field => {
      if (row[field] instanceof Date) {
        // Caso 1 (principal): SheetJS já converteu para Date com cellDates:true
        row[field] = row[field].toISOString().split('T')[0];

      } else if (typeof row[field] === 'number' && row[field] > 0) {
        // Caso 2 (fallback): serial numérico do Excel
        // Excel tem um bug histórico: conta 29/02/1900 (inexistente) como dia 60.
        // Para datas modernas (serial > 60), o offset Unix correto é 25569.
        // Para seriais <= 60, aplica offset de 25568 para compensar o dia fantasma.
        const EXCEL_EPOCH_OFFSET = row[field] > 60 ? 25569 : 25568;
        const utcMs = (row[field] - EXCEL_EPOCH_OFFSET) * 86400000;
        const d  = new Date(utcMs);
        const yr = d.getUTCFullYear();
        const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dy = String(d.getUTCDate()).padStart(2, '0');
        row[field] = `${yr}-${mo}-${dy}`;

      } else if (typeof row[field] === 'string' && row[field].trim()) {
        // Caso 3 (fallback): string — tenta normalizar via classifier
        const iso = Classifier.normalizeDateToISO(row[field].trim());
        if (iso) row[field] = iso;
      }
    });

    const rawVal = String(row.valor_estimado ?? '').trim().toLowerCase();
    if (SIGILOSO_STRINGS.some(s => rawVal.includes(s)) || rawVal === '') {
      row.valor_estimado = 0;
    } else if (typeof row.valor_estimado === 'number') {
      // Quando o SheetJS já entrega um número JS (ex.: 303572.28),
      // NÃO aplicar replace de pontos — o ponto é o separador decimal JS,
      // não o separador de milhar brasileiro. Usa-se o número diretamente.
      row.valor_estimado = row.valor_estimado || 0;
    } else {
      // String: detectar formato automaticamente pelo ÚLTIMO separador.
      //
      // Casos cobertos:
      //   '20.818.914,58'  → BR c/ milhar  → vírgula é decimal → 20818914.58  ✓
      //   '20818914,58'    → BR s/ milhar  → vírgula é decimal → 20818914.58  ✓
      //   '20,818,914.58'  → US c/ milhar  → ponto   é decimal → 20818914.58  ✓
      //   '20818914.58'    → US s/ milhar  → ponto   é decimal → 20818914.58  ✓
      //   '30357228'       → inteiro puro                      → 30357228     ✓
      //   'R$ 20.818.914,58' → prefixo R$  → igual BR c/ milhar              ✓
      //
      // Estratégia: verificar qual separador (ponto ou vírgula) aparece POR ÚLTIMO.
      // O último separador é invariavelmente o decimal.
      // Delega ao parser único do Classifier (Classifier.parseValor), garantindo
      // que strings de valor sejam interpretadas EXATAMENTE da mesma forma na
      // ingestão (io.js) e na classificação (classifier.js). Isso corrige o caso
      // BR sem decimais — "35.000.000" agora vira 35000000 e não 35.
      const s = String(row.valor_estimado).trim().replace(/^R?\$\s*/i, '').trim();
      const parsed = (typeof Classifier !== 'undefined' && typeof Classifier.parseValor === 'function')
        ? Classifier.parseValor(s)
        : parseFloat(s);

      row.valor_estimado = parsed || 0;
    }

    row.codigoUasg = row.codigoUasg ?? row.codigo_uasg ?? '';
    row.nome_Uasg  = row.nome_Uasg  ?? row.nome_uasg  ?? '';
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 3 — CARREGAMENTO DO DATASET NA UI
   ═══════════════════════════════════════════════════════════════════════════ */

async function loadDataset(data, filename) {
  // ── Chave estável por linha + reidratação de anotações do analista ───────
  // Cada linha recebe um _uid determinístico (Supa.makeUid). Em seguida, se a
  // persistência estiver ativa, buscamos as anotações salvas no Supabase e as
  // aplicamos por cima dos dados recém-lidos do Sheets. Como valores/validações
  // manuais afetam a classificação, RECLASSIFICAMOS as linhas reidratadas.
  if (window.Supa) {
    data.forEach(row => { row._uid = Supa.makeUid(row); });

    if (Supa.isReady()) {
      try {
        const mapa = await Supa.carregarTodas();
        const n    = Supa.reidratar(data, mapa);
        if (n > 0) {
          data.forEach(row => {
            // Só reclassifica quem recebeu alguma anotação que muda o status.
            if (row._valor_manual || row._validacao_art8 ||
                row._data_referencia_manual || row._avaliacao_obrig_dados) {
              Classifier.classifyRowFull(row);
            }
          });
          console.info(`[Supa] ${n} anotação(ões) reaplicada(s) do banco.`);
        }
      } catch (e) {
        console.error('[Supa] Falha na reidratação:', e);
        showToast('Dados carregados, mas não foi possível recuperar as anotações salvas.', 'error', 4000);
      }
    }
  }

  State.allData = data;

  if (DOM.sheetsStatus) {
    DOM.sheetsStatus.innerHTML = `
      <div class="file-loaded">
        ${Icons.get('checkCircle', 14)}
        ${escapeHtml(filename)} — ${data.length.toLocaleString('pt-BR')} registros
      </div>
      <p class="upload-reload-hint">Use o botão acima para sincronizar novamente quando a planilha mudar.</p>
    `;
  }

  // ── Aba Geral: registra a data/hora da última sincronização ──────────────
  const elUltimaSync = document.getElementById('geralUltimaSync');
  if (elUltimaSync) elUltimaSync.textContent = new Date().toLocaleString('pt-BR');

  // Modo compacto: oculta ícone/título/texto intro mas mantém norma-box e steps.
  // O botão de recolher/expandir torna-se visível após o upload.
  DOM.welcomeState.classList.add('welcome-state--compact');

  // Injeta label SVG outline "Referência Normativa" (substitui emoji do ::before)
  if (!document.getElementById('normaCompactLabel')) {
    const lbl = document.createElement('div');
    lbl.id = 'normaCompactLabel';
    lbl.className = 'norma-compact-label';
    lbl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      Referência Normativa`;
    DOM.welcomeState.insertBefore(lbl, DOM.welcomeState.firstChild);
  }

  const normaToggleBtn = document.getElementById('normaToggle');
  if (normaToggleBtn) normaToggleBtn.style.display = 'inline-flex';
  DOM.dashboardContent.classList.add('visible');

  resetFilterDropdowns();
  populateFilterDropdowns();
  _updateAllStats();
  // [v5.3 — BUG-17] Usar null para mostrar TODOS os registros após o upload.
  // Antes: setActiveFilter('avaliacao-obrigatoria') → tabela vazia quando todos os
  // contratos têm data anterior a 10/03/2025 (ficam como 'verificacao-humana').
  setActiveFilter(null);

  // Se aba analytics estiver ativa, atualizar
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab && activeTab.dataset.tab === 'analytics') {
    renderAnalytics();
  }

  // ── Fluxo de ciclos: registra novos obrigatórios e atualiza o painel ──────
  // Sincroniza os obrigatórios com o back-end (só novos entram), recupera o
  // status de cada uid e reaplica os filtros para a fila refletir o ciclo.
  if (window.Ciclos && Ciclos.ativo()) {
    try {
      await Ciclos.sincronizar(State.allData);
      if (typeof renderCiclosDashboard === 'function') await renderCiclosDashboard();
      // Recalcula os contadores agora que o cache de status do ciclo já está
      // populado — assim "Avaliação obrigatória" desconta os finalizados.
      if (typeof _updateAllStats === 'function') _updateAllStats();
      applyFilters();   // reaplica para esconder os FINALIZADOS da fila
    } catch (e) {
      console.error('[Ciclos] Sincronização falhou:', e.message || e);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 4 — EXPORTAÇÃO CSV
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * exportCSV — exportação completa com 19 campos de conformidade.
 *
 * Colunas exportadas (nesta ordem):
 *   1.  Número do Processo / Edital
 *   2.  Órgão (UASG)
 *   3.  Modalidade
 *   4.  Tipo de Objeto
 *   5.  Valor Estimado (R$)
 *   6.  Valor Manual (R$)                       — quando informado pelo analista
 *   7.  Data de Publicação do Edital
 *   8.  Objeto / Descrição
 *   9.  Art. 1º — Âmbito                        — Enquadrado / Excluído (nome do órgão)
 *  10.  Art. 2º — Critério Ativado              — código do critério ativado
 *  11.  Art. 8º — Status                        — rótulo do status Art. 8º
 *  12.  Status Final                             — rótulo final em português
 *  13.  Assinatura do Contrato
 *  14.  Motivo / Observação                     — motivo do enquadramento
 *  15.  Observações do Analista
 *  16.  Categoria do Processo (Aval. Obrig.)
 *  17.  Valor de Adjudicação (Aval. Obrig.)
 *  18.  Contrato Interrompido (Aval. Obrig.)
 *  19.  Motivo Interrupção (Aval. Obrig.)
 *
 * Encoding: UTF-8 com BOM (\uFEFF) para compatibilidade com Excel pt-BR.
 * Delimitador: vírgula. Campos envolvidos em aspas duplas.
 */
function exportCSV() {
  const data = State.filteredData;
  if (data.length === 0) {
    showToast('Sem dados para exportar.', 'error');
    return;
  }

  // ── Cabeçalhos das 19 colunas ─────────────────────────────────────────────
  const CABECALHOS = [
    'Número do Processo / Edital',
    'Órgão (UASG)',
    'Modalidade',
    'Tipo de Objeto',
    'Valor Estimado (R$)',
    'Valor Manual Informado (R$)',
    'Data de Publicação do Edital',
    'Objeto / Descrição',
    'Art. 1º — Âmbito',
    'Art. 2º — Critério Ativado',
    'Art. 8º — Status',
    'Status Final',
    'Assinatura do Contrato',
    'Motivo / Observação',
    'Observações do Analista',
    'Categoria do Processo (Aval. Obrig.)',
    'Valor de Adjudicação (Aval. Obrig.)',
    'Contrato Interrompido (Aval. Obrig.)',
    'Motivo Interrupção (Aval. Obrig.)',
  ];

  // ── Rótulos de categoria (Avaliação Obrigatória) ──────────────────────────
  const AVAL_OBRIG_CAT_LABEL = {
    licitacao_andamento:    'Licitação em andamento',
    adjudicado_fornecedor:  'Processo adjudicado com seleção de fornecedor',
    contrato_firmado:       'Contrato firmado (com assinatura)',
    contrato_execucao:      'Contrato em execução',
  };

  // ── Helper: escapa aspas duplas e envolve em aspas para CSV ──────────────
  const cel = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;

  // ── Rótulos de status ─────────────────────────────────────────────────────
  const STATUS_LABEL = {
    'avaliacao-obrigatoria': 'Avaliação Obrigatória',
    'dispensada':            'Dispensada (Art. 8º)',
    'verificacao-humana':    'Verificação Pendente (analista)',
    'nao-enquadrado':        'Não Enquadrado no Art. 2º',
    'nao-enquadrado-art1':   'Não Enquadrado — Órgão excluído (Art. 1º)',
  };

  // ── Rótulos Art. 8º ───────────────────────────────────────────────────────
  const ART8_LABEL = {
    'dispensado':         'Dispensado (evento antes de 10/03/2025)',
    'vigente':            'Vigente (decreto em vigor)',
    'excecao-aditivo':    'Não dispensado (aditivo contratual)',
    'pendente-validacao': 'Pendente de validação do analista',
    'sem-data':           'Sem data — informação indisponível',
    'nao-aplicavel':      'Não aplicável (processo fora do Art. 2º)',
  };

  // ── Formata valor monetário (BRL) ─────────────────────────────────────────
  function fmtValor(v) {
    if (!v || v <= 0) return '—';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Formata data ISO → DD/MM/AAAA ─────────────────────────────────────────
  function fmtData(isoOrRaw) {
    if (!isoOrRaw) return '—';
    const iso = (typeof Classifier.normalizeDateToISO === 'function')
      ? Classifier.normalizeDateToISO(String(isoOrRaw))
      : null;
    if (!iso) return String(isoOrRaw) || '—';
    const [yyyy, mm, dd] = iso.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }

  // ── Formata Art. 1º ───────────────────────────────────────────────────────
  function fmtArt1(row) {
    if (row._excluido_art1) {
      const info = (typeof Classifier.getOrgaoExcluidoInfo === 'function')
        ? Classifier.getOrgaoExcluidoInfo(row)
        : null;
      return info ? `Excluído — ${info.nome || info.sigla}` : 'Excluído (Art. 1º)';
    }
    return 'Enquadrado no âmbito do Decreto';
  }

  // ── Formata Art. 2º ───────────────────────────────────────────────────────
  function fmtArt2(row) {
    if (!row._requerAlice) return 'Não enquadrado';
    if (row._isSigiloso && !row._valor_manual) return 'Indeterminado (valor sigiloso)';
    const reasons = (row._reasons || []).map(r => r.toUpperCase());
    return reasons.length > 0 ? reasons.join(', ') : 'Enquadrado';
  }

  // ── Formata assinatura ────────────────────────────────────────────────────
  function fmtAssinatura(row) {
    if (row._contrato_assinado === 'sim') return 'Sim';
    if (row._contrato_assinado === 'nao') return 'Não';
    if (row._validacao_art8 && row._validacao_art8.opcao === 'assinatura_antes') {
      return 'Sim (anterior a 10/03/2025)';
    }
    return 'Não informado';
  }

  // ── Formata motivo/observação ─────────────────────────────────────────────
  function fmtMotivo(row) {
    const parts = [];
    if (row._motivoArt1) parts.push(row._motivoArt1);
    else if (row._motivoArt2) parts.push(row._motivoArt2);
    if (row._motivoArt8 && row._motivoArt8 !== row._motivoArt2) parts.push(row._motivoArt8);
    if (row.observacoes) parts.push(`Obs: ${row.observacoes}`);
    return parts.join(' | ') || '—';
  }

  // ── Valor efetivo ─────────────────────────────────────────────────────────
  function getValorEfetivo(row) {
    if (row._isSigiloso && !row._valor_manual) return 'Sigiloso / Não informado';
    const v = row._valor_manual > 0 ? row._valor_manual : (row.valor_estimado || 0);
    return fmtValor(v);
  }

  // ── Monta linhas ──────────────────────────────────────────────────────────
  const linhas = data.map(r => {
    const ao = r._avaliacao_obrig_dados;
    return [
      cel(r.processo || r.numero_ano_edital || ''),               //  1. Processo
      cel(r.nome_Uasg || r.codigoUasg || ''),                     //  2. Órgão
      cel(r.modalidade || ''),                                     //  3. Modalidade
      cel(r.tipo_objeto || ''),                                    //  4. Tipo objeto
      cel(getValorEfetivo(r)),                                     //  5. Valor estimado
      cel(r._valor_manual > 0 ? fmtValor(r._valor_manual) : '—'), //  6. Valor manual
      cel(fmtData(r.dt_public_edital)),                            //  7. Data publicação
      cel(r.objeto || ''),                                         //  8. Objeto
      cel(fmtArt1(r)),                                             //  9. Art. 1º
      cel(fmtArt2(r)),                                             // 10. Art. 2º
      cel(ART8_LABEL[r._art8] || r._art8 || '—'),                  // 11. Art. 8º
      cel(STATUS_LABEL[r._statusFinal] || r._statusFinal || ''),   // 12. Status final
      cel(fmtAssinatura(r)),                                       // 13. Assinatura
      cel(fmtMotivo(r)),                                           // 14. Motivo
      cel(r._observacao_manual || ''),                             // 15. Observações do Analista
      cel(ao ? (AVAL_OBRIG_CAT_LABEL[ao.categoria] || ao.categoria || '') : ''), // 16. Categoria
      cel(ao ? (ao.valor_adjudicacao === 'sim' ? 'Sim' : (ao.valor_adjudicacao === 'nao' ? 'Não' : '')) : ''), // 17. Adjudicação
      cel(ao ? (ao.contrato_interrompido === 'sim' ? 'Sim' : (ao.contrato_interrompido === 'nao' ? 'Não' : '')) : ''), // 18. Interrompido
      cel(ao ? (ao.motivo_interrupcao || '') : ''),                // 19. Motivo interrupção
    ].join(',');
  });

  // ── Gera e dispara download ────────────────────────────────────────────────
  // UTF-8 com BOM (\uFEFF) para compatibilidade com Excel no Brasil.
  const csv  = [CABECALHOS.map(cel).join(','), ...linhas].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = `conformidade_decreto34196_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

  showToast(
    `${data.length.toLocaleString('pt-BR')} registro(s) exportados — 19 colunas — UTF-8 com BOM.`,
    'success',
    5000
  );
}
