
'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTES DE DOMÍNIO
   ───────────────────────────────────────────────────────────────────────────── */

/** Rótulos legíveis para os tipos de data de referência manual (Art. 8º). */
const DATA_REF_TIPOS = {
  publicacao_edital:   'Publicação do Edital',
  assinatura_contrato: 'Assinatura do Instrumento Contratual',
  inicio_dispensa:     'Início da Dispensa / Inexigibilidade',
};

/* ─────────────────────────────────────────────────────────────────────────────
   ESTADO DA APLICAÇÃO
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Estado reativo da aplicação.
 * Toda mutação de dados deve passar por este objeto,
 * garantindo rastreabilidade e evitando variáveis globais soltas.
 */
const State = {
  /** Dataset completo carregado da planilha (já classificado). */
  allData: [],

  /** Subconjunto de allData após aplicação dos filtros ativos. */
  filteredData: [],

  /** Filtro de card ativo (ex.: 'avaliacao-obrigatoria', 'dispensada'). */
  activeFilter: null,  //  null = mostrar todos os registros ao carregar

  /** Página corrente da paginação (base 1). */
  currentPage: 1,

  /** Quantidade de registros por página. */
  pageSize: 25,

  /** Timestamp da última sincronização bem-sucedida. */
  lastSyncAt: null,
};

/* ─────────────────────────────────────────────────────────────────────────────
   CACHE DE ELEMENTOS DO DOM
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Cache de referências a elementos do DOM.
 * Preenchido uma única vez em bindDOM() durante a inicialização.
 * Uso: DOM.tableBody, DOM.searchInput, etc.
 */
const DOM = {};

/**
 * Popula o cache DOM com todas as referências necessárias.
 * Chamado uma única vez no bootstrap da aplicação (app.js → init()).
 */
function bindDOM() {
  // ── Sincronização / telas ────────────────────────────────────
  DOM.sheetsSection    = document.getElementById('sheetsSection');
  DOM.sheetsStatus     = document.getElementById('sheetsStatus');
  DOM.welcomeState     = document.getElementById('welcomeState');
  DOM.dashboardContent = document.getElementById('dashboardContent');
  DOM.loadingOverlay   = document.getElementById('loadingOverlay');
  DOM.toastContainer   = document.getElementById('toastContainer');

  // ── Pílulas de resumo no header ───────────────────────────────
  DOM.statTotal        = document.getElementById('statTotal');
  DOM.statAvalObrig    = document.getElementById('statAvalObrig');
  DOM.statDispensada   = document.getElementById('statDispensada');
  DOM.statVerificacao  = document.getElementById('statVerificacao');

  // ── Contadores dos cards de status final ──────────────────────
  DOM.countAvalObrig     = document.getElementById('countAvalObrig');
  DOM.countDispensada    = document.getElementById('countDispensada');
  DOM.countVerificacao   = document.getElementById('countVerificacao');
  DOM.countNaoEnquadrado = document.getElementById('countNaoEnquadrado');

  // ── Contadores dos cards Art. 2º ──────────────────────────────
  DOM.countAll = document.getElementById('countAll');
  DOM.countI   = document.getElementById('countI');
  DOM.countII  = document.getElementById('countII');
  DOM.countP1  = document.getElementById('countP1');
  DOM.countP2  = document.getElementById('countP2');

  // ── Summary cards — contadores secundários e percentuais (v5.3) ──────────
  DOM.countAvalObrig2     = document.getElementById('countAvalObrig2');
  DOM.countVerificacao2   = document.getElementById('countVerificacao2');
  DOM.pctAvalObrig        = document.getElementById('pctAvalObrig');
  DOM.pctVerificacao      = document.getElementById('pctVerificacao');
  DOM.pctNaoEnquadrado    = document.getElementById('pctNaoEnquadrado');
  DOM.pctDispensada       = document.getElementById('pctDispensada');

  // ── Detalhamento Art. 2º — contadores secundários ────────────────────────
  DOM.countI2  = document.getElementById('countI2');
  DOM.countII2 = document.getElementById('countII2');
  DOM.countP12 = document.getElementById('countP12');
  DOM.countP22 = document.getElementById('countP22');

  // ── Controles adicionais ──────────────────────────────────────────────────
  // DOM.btnClearFilters definido para uso futuro (botão gerenciado via onclick no HTML)
  DOM.btnClearFilters  = document.getElementById('btnClearFilters');
  DOM.btnExportPdf     = document.getElementById('btnExportPdf');
  // DOM.filtersBar disponível para uso futuro (show/hide programático)
  DOM.filtersBar       = document.getElementById('filtersBar');
  // DOM.analyticsContent removido — use DOM.analyticsPanel ('panel-analytics') que é o painel correto

  // ── Barra de filtros ──────────────────────────────────────────
  DOM.searchInput      = document.getElementById('searchInput');
  DOM.filterStatus     = document.getElementById('filterStatus');
  DOM.filterModalidade = document.getElementById('filterModalidade');
  DOM.filterTipoObj    = document.getElementById('filterTipoObj');
  DOM.filterUasg       = document.getElementById('filterUasg');
  DOM.filterValorMin   = document.getElementById('filterValorMin');
  DOM.filterValorMax   = document.getElementById('filterValorMax');

  // ── Tabela e paginação ────────────────────────────────────────
  DOM.tableBody   = document.getElementById('tableBody');
  DOM.emptyState  = document.getElementById('emptyState');
  DOM.resultCount = document.getElementById('resultCount');
  DOM.pageInfo    = document.getElementById('pageInfo');
  DOM.pageBtns    = document.getElementById('pageBtns');
  DOM.btnExport   = document.getElementById('btnExport');

  // ── Modal ─────────────────────────────────────────────────────
  DOM.modalOverlay  = document.getElementById('modalOverlay');
  DOM.modalKicker   = document.getElementById('modalKicker');
  DOM.modalTitle    = document.getElementById('modalTitle');
  DOM.modalSubtitle = document.getElementById('modalSubtitle');
  DOM.modalBody     = document.getElementById('modalBody');

  // ── Abas ─────────────────────────────────────────────────────────────
  DOM.analyticsPanel = document.getElementById('panel-analytics');
}
