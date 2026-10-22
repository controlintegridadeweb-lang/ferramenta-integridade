'use strict';


/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1 — EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════════════════ */

function setupListeners() {
  // ── Filtros ──────────────────────────────────────────────────────────────
  DOM.searchInput.addEventListener('input', () => {
    State.currentPage = 1;
    applyFilters();
  });
  DOM.filterModalidade.addEventListener('change', applyFilters);
  DOM.filterTipoObj.addEventListener('change',    applyFilters);
  DOM.filterUasg.addEventListener('change',       applyFilters);
  DOM.filterValorMin.addEventListener('input',    applyFilters);
  DOM.filterValorMax.addEventListener('input',    applyFilters);
  if (DOM.filterStatus) DOM.filterStatus.addEventListener('change', applyFilters);

  // ── Modal ────────────────────────────────────────────────────────────────
  DOM.modalOverlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', function(e) {
    const aberto = DOM.modalOverlay && DOM.modalOverlay.classList.contains('open');
    if (!aberto) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (e.key === 'Escape') { closeModal(); return; }
    const tag = (e.target && e.target.tagName) || '';
    const digitando = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (digitando) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); modalNext(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); modalPrev(); }
  });

  // ── Acessibilidade: cards navegáveis por teclado ─────────────────────────
  document.querySelectorAll('.summary-card, .inciso-card').forEach(function(card) {
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveFilter(card.dataset.filter);
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 2 — BOOTSTRAP
   ═══════════════════════════════════════════════════════════════════════════ */

async function init() {
  // ── Gate de login ─────────────────────────────────────────────────────────
  // O #appShell fica oculto (body.auth-locked) até haver sessão válida ou até
  // o servidor informar que autenticação não está configurada.
  if (window.AuthUI) {
    await AuthUI.exigirLogin();
  }

  bindDOM();        // state.js — inclui refs de abas e DOCX
  setupListeners(); // este arquivo

  // ── Descobre o estado do back-end (persistência + Sheets) ─────────────────
  // Nenhuma credencial vem para o navegador — apenas flags do que está ativo.
  let saude = { persistencia: false, sheets: false, autoRefreshSeg: 0 };
  try {
    const resp = await fetch(apiUrl('/api/health'));
    if (resp.ok) saude = await resp.json();
  } catch (_) { /* back-end fora do ar: app segue só com upload manual */ }

  // ── Persistência (via back-end) ───────────────────────────────────────────
  if (window.Supa) await Supa.init();

  // ── Fluxo de ciclos (via back-end) ────────────────────────────────────────
  if (window.Ciclos) await Ciclos.init(saude.persistencia);

  // ── Leitura do Google Sheets (via back-end) ───────────────────────────────
  if (window.Sheets && saude.sheets) {
    Sheets.configurarAutoRefresh(saude.autoRefreshSeg || 0);
    await Sheets.carregar();          // o servidor já sabe qual planilha ler
    Sheets.iniciarAutoRefresh();
  } else {
    // Sem planilha configurada no servidor: não há fluxo alternativo (o upload
    // manual foi removido). Em vez de uma tela vazia, explica o que falta.
    const btn = document.getElementById('sheetsLoadBtn');
    if (btn) btn.disabled = true;
    if (DOM.sheetsStatus) {
      DOM.sheetsStatus.innerHTML =
        '<p class="sheets-indisponivel">A planilha ainda não está configurada. ' +
        'Peça ao administrador para habilitar a sincronização e tente de novo.</p>';
    }
  }

  if (window.AuthUI) AuthUI.atualizarHeader(saude);
  if (typeof switchTab === 'function') switchTab('analise');
  if (typeof updateExportVisibility === 'function') updateExportVisibility();
  if (typeof updateSyncLabel === 'function') updateSyncLabel();
}

function sair() {
  if (window.AuthUI) return AuthUI.sair();
}

/**
 * Recarrega a planilha do Google Sheets sob demanda.
 * Exposto como App.carregarSheets() (onclick no botão).
 */
function carregarSheets() {
  if (window.Sheets) {
    Sheets.carregar().then(() => Sheets.iniciarAutoRefresh());
  }
}

function irParaPendentes() {
  if (typeof switchTab === 'function') switchTab('analise');
  if (typeof setActiveFilter === 'function') setActiveFilter('verificacao-humana');
}

document.addEventListener('DOMContentLoaded', init);

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 3 — PAINEL DE REFERÊNCIA NORMATIVA (toggle recolher/expandir)
   [FEAT-03] Permite ao usuário recolher o painel após upload para ter mais
   espaço na tela, mas a referência normativa permanece sempre acessível.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Estado de visibilidade do painel normativo */
let _normaPanelExpanded = false;

/**
 * Alterna a visibilidade do conteúdo normativo (norma-box + steps).
 * Chamado via App.toggleNormaPanel() (onclick no botão no HTML).
 */
function collapseNormaPanel() {
  _normaPanelExpanded = true;
  toggleNormaPanel();
}

function toggleNormaPanel() {
  const content = document.getElementById('normaContent');
  const btn     = document.getElementById('normaToggle');
  const label   = document.getElementById('normaToggleLabel');
  const icon    = btn ? btn.querySelector('.norma-toggle-icon') : null;
  if (!content) return;

  _normaPanelExpanded = !_normaPanelExpanded;

  if (_normaPanelExpanded) {
    content.hidden = false;
    content.style.display = '';
    if (label) label.textContent = 'Recolher critérios';
    if (btn)   btn.setAttribute('aria-expanded', 'true');
    if (icon)  icon.style.transform = '';
  } else {
    content.hidden = true;
    content.style.display = 'none';
    if (label) label.textContent = 'Ver critérios do Decreto';
    if (btn)   btn.setAttribute('aria-expanded', 'false');
    if (icon)  icon.style.transform = 'rotate(180deg)';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 3b — FLUXO DE CICLOS (delegação para o módulo Ciclos)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Atualiza os cards do painel de ciclos. Chamada após cada sincronização. */
async function renderCiclosDashboard() {
  if (window.Ciclos) await Ciclos.renderDashboard();
}

/** Gera o relatório do ciclo atual (encerra o lote dos validados). */
function gerarRelatorio() {
  if (window.Ciclos) Ciclos.gerarRelatorioFluxo();
}

/** Finaliza um único registro validado (relatório de lote com um uid). */
function finalizarRegistro(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row || !row._uid) return;
  if (window.Ciclos) Ciclos.finalizarRegistroFluxo(row._uid);
}

/** Abre/fecha o detalhe de um relatório no histórico. */
function abrirRelatorio(id) {
  if (window.Ciclos) Ciclos.abrirRelatorio(id);
}

/** Regenera o PDF de um relatório existente (sem reabrir o ciclo). */
function regerarPdfRelatorio(id) {
  if (window.Ciclos) Ciclos.regerarPdfFluxo(id);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 4 — API PÚBLICA
   Exposta como window.App para garantir acesso em qualquer contexto
   (onclick inline, strict mode, iframes, etc.)
   ═══════════════════════════════════════════════════════════════════════════ */

window.App = {
  // Sessão
  sair:                    sair,

  // Carregamento de dados
  carregarSheets:          carregarSheets,

  // Navegação e filtros
  setActiveFilter:         setActiveFilter,
  irParaPendentes:         irParaPendentes,
  clearFilters:            clearFilters,
  changePage:              changePage,

  // Modal
  openModal:               openModal,
  closeModal:              closeModal,
  modalPrev:               modalPrev,
  modalNext:               modalNext,

  // Exportação CSV / PDF
  exportCSV:               exportCSV,
  exportPDF:               exportPDF,

  // Aba analítica
  switchTab:               switchTab,
  renderAnalytics:         renderAnalytics,
  abrirFiltroAnalise:      abrirFiltroAnalise,
  setDashPeriodo:          setDashPeriodo,
  setDashPeriodoCustom:    setDashPeriodoCustom,

  // Fluxo de ciclos / relatórios
  gerarRelatorio:          gerarRelatorio,
  finalizarRegistro:       finalizarRegistro,
  abrirRelatorio:          abrirRelatorio,
  regerarPdfRelatorio:     regerarPdfRelatorio,
  renderCiclosDashboard:   renderCiclosDashboard,

  // [FEAT-03] Painel normativo recolhível
  toggleNormaPanel:        toggleNormaPanel,

  // Etapa 1: Valor manual (orçamento sigiloso)
  applyManualValue:        applyManualValue,
  applyManualValueFromModal: applyManualValueFromModal,
  clearManualValue:        clearManualValue,

  // Etapa 2: Validação Art. 8º (bloco de 4 opções)
  applyArt8Validation:     applyArt8Validation,
  clearArt8Validation:     clearArt8Validation,

  // Data de referência manual (contexto complementar)
  applyManualDate:         applyManualDate,
  applyManualDateFromModal: applyManualDateFromModal,
  clearManualDate:         clearManualDate,

  // Situação contratual — "O contrato já foi assinado?"
  applyContratoAssinado:   applyContratoAssinado,
  clearContratoAssinado:   clearContratoAssinado,
  toggleContratoAssinado:  toggleContratoAssinado,

  // Observações manuais do analista
  applyObservacaoManual:   applyObservacaoManual,
  clearObservacaoManual:   clearObservacaoManual,
  editObservacaoManual:    _openObsEditMode,

  // Questionário de Avaliação Obrigatória
  applyAvaliacaoObrigatoria: applyAvaliacaoObrigatoria,
  clearAvaliacaoObrigatoria: clearAvaliacaoObrigatoria,
  questaoEscolher:         questaoEscolher,
  questaoVoltar:           questaoVoltar,
  concluirProcesso:        concluirProcesso,
  desfazerConclusao:       desfazerConclusao,
};
