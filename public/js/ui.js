
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1 — UTILITÁRIOS GERAIS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Escapa caracteres especiais HTML para evitar XSS. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Converte data no formato ISO (YYYY-MM-DD) para o formato
 * brasileiro DD/MM/AAAA para exibição na tabela e no modal.
 * Retorna '—' para valores ausentes ou inválidos.
 * @param {string} iso — data em formato YYYY-MM-DD
 * @returns {string}
 */
function fmtDateDisplay(iso) {
  if (!iso || iso === '—') return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 2 — FEEDBACK: TOAST E LOADING
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Exibe uma notificação temporária (toast).
 * @param {string} message  — Texto da mensagem.
 * @param {'info'|'success'|'error'} type — Tipo visual.
 * @param {number} duration — Duração em ms antes de sumir.
 */
function showToast(message, type = 'info', duration = 3500) {
  const iconMap = { success: 'checkCircle', error: 'xCircle', info: 'info' };
  const toast   = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = Icons.get(iconMap[type] || 'info', 16) + `<span>${message}</span>`;

  const container = DOM.toastContainer || document.getElementById('toastContainer');
  if (!container) { console.warn('[Toast]', type, message); return; }
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/** Exibe o overlay de carregamento com mensagem opcional. */
function showLoading(msg) {
  if (msg) {
    const p = DOM.loadingOverlay.querySelector('p');
    if (p) p.textContent = msg;
  }
  DOM.loadingOverlay.classList.add('show');
}

/** Oculta o overlay de carregamento e restaura mensagem padrão. */
function hideLoading() {
  DOM.loadingOverlay.classList.remove('show');
  const p = DOM.loadingOverlay.querySelector('p');
  if (p) p.textContent = 'Processando planilha…';
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 3 — FORMATAÇÃO E BADGES
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Formata um valor em BRL como HTML.
 * Valores zerados (sigilosos / não informados) recebem estilo e ícone de cadeado.
 * @param {number} v
 * @param {boolean} isManual — true quando o valor foi inserido manualmente.
 */
function formatCurrency(v, isManual = false) {
  const num = parseFloat(v);
  if (!num || num <= 0) {
    return `<span class="td-valor sigiloso">Sigiloso</span>`;
  }
  const formatted =
    `R$\u00a0${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (isManual) {
    return `<span class="td-valor valor-manual" title="Valor inserido manualmente pelo analista">${formatted}</span>`;
  }
  return `<span class="td-valor">${formatted}</span>`;
}

/**
 * Monta as tags coloridas dos incisos do Art. 2º acionados.
 * @param {string[]} reasons — ex.: ['art2-I', 'art2-p1']
 * @returns {string} HTML de <span class="tag">
 */
function buildReasonTags(reasons, { compact = false } = {}) {
  if (!reasons || reasons.length === 0) return '';
  return reasons.map(r => {
    const meta = Classifier.RULE_META[r] || { label: r, tagClass: 'tag-gray', icon: 'tag' };
    const text = compact && meta.shortLabel ? meta.shortLabel : meta.label;
    const cls  = compact ? 'tag tag--compact' : 'tag';
    return `<span class="${cls} ${meta.tagClass}" title="${escapeHtml(meta.descricao || meta.label)}">${Icons.get(meta.icon, 11)} ${text}</span>`;
  }).join('');
}

/**
 * Monta o badge colorido do status final.
 * Adiciona um ponto indicador quando há dado informado manualmente.
 * @param {Object} row — linha classificada
 * @returns {string} HTML
 */
/** Questionário normal completo, inclusive o valor quando há adjudicação. */
function questionarioRespondido(d) {
  if (!d || d.contrato_interrompido !== 'nao') return false;
  if (!d.categoria || !d.valor_adjudicacao || !d.contrato_assinado) return false;
  if (d.valor_adjudicacao === 'sim' && !(Number(d.valor_adjudicado) > 0)) return false;
  return true;
}

function fmtReais(n) {
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Processo encerrado pelo analista: sai da fila de avaliação obrigatória. */
function registroConcluido(row) {
  if (!row) return false;
  if (row._concluido) return true;
  return !!(window.Ciclos && Ciclos.ativo() && row._uid && Ciclos.statusDe(row._uid) === 'FINALIZADO');
}

function buildStatusFinalBadge(row) {
  if (registroConcluido(row)) {
    return `<span class="tag status-badge status-concluido">Concluído</span>`;
  }
  const meta = Classifier.STATUS_FINAL_META[row._statusFinal];
  if (!meta) return '';
  const manualDot = (row._data_referencia_manual || row._valor_manual || row._validacao_art8)
    ? `<span class="tag-data-manual-dot" title="Dado informado manualmente pelo analista"></span>` : '';
  const label = meta.tableLabel || meta.label;
  return `<span class="tag status-badge ${meta.tagClass}">${label}${manualDot}</span>`;
}

/**
 * Monta o badge do ESTÁGIO DO CICLO de um registro (PENDENTE / EM_ANALISE /
 * VALIDADO). Só aparece quando o fluxo por ciclos está ativo e o registro é uma
 * avaliação obrigatória — dá ao analista visibilidade, na própria fila, do que
 * já validou e do que falta. Registros FINALIZADOS não chegam à fila.
 * @param {Object} row
 * @returns {string} HTML (vazio quando não aplicável)
 */
const CICLO_STAGE_META = {
  PENDENTE:   { label: 'A analisar',  cls: 'ciclo-stage--pendente',  icon: 'inbox' },
  EM_ANALISE: { label: 'Em análise',  cls: 'ciclo-stage--analise',   icon: 'edit' },
  VALIDADO:   { label: 'Validado',    cls: 'ciclo-stage--validado',  icon: 'checkCircle' },
};
function buildCicloStageBadge(row) {
  if (registroConcluido(row)) return '';
  if (!(window.Ciclos && Ciclos.ativo()) || row._statusFinal !== 'avaliacao-obrigatoria' || !row._uid) {
    return '';
  }
  const status = Ciclos.statusDe(row._uid);
  const meta = CICLO_STAGE_META[status];
  if (!meta) return '';
  return `<span class="tag ciclo-stage ${meta.cls}" title="Estágio no ciclo: ${meta.label}">${meta.label}</span>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 4 — CÉLULA DE VALOR (orçamento sigiloso ou informado)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Renderiza a célula de valor.
 * Quando sigiloso e sem valor manual: botão que abre o modal.
 * Quando sigiloso com valor manual: valor + botão para remover.
 * @param {Object} row
 * @param {number} globalIdx — índice global em State.filteredData
 * @returns {string} HTML
 */
function renderValorCell(row, globalIdx) {
  const isSig     = Classifier.isSigiloso(row);
  const hasManual = row._valor_manual !== undefined && row._valor_manual > 0;

  if (!isSig) {
    return `<div class="td-valor-normal">${formatCurrency(row.valor_estimado)}</div>`;
  }

  if (hasManual) {
    return `
      <div class="valor-manual-wrap valor-manual-set">
        <div class="valor-manual-display">
          ${formatCurrency(row._valor_manual, true)}
          <button type="button" class="btn-valor-edit"
            onclick="event.stopPropagation(); App.clearManualValue(${globalIdx})"
            title="Remover valor manual e voltar para sigiloso">
            ×
          </button>
        </div>
      </div>`;
  }

  return `
    <button type="button" class="btn-informar-valor"
      onclick="event.stopPropagation(); App.openModal(${globalIdx})">
      Informar valor
    </button>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 5 — CARDS DE RESUMO E FILTROS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Atualiza todos os contadores: header pills, cards de status final
 * e cards de detalhamento do Art. 2º.
 */
function _updateAllStats() {
  const c = Classifier.getCounts(State.allData);

  // ── "Avaliação obrigatória" exibida = apenas a fila ATIVA do ciclo ────────
  // O classificador conta TODOS os obrigatórios (inclusive os já FINALIZADOS,
  // que continuam classificados no Art. 2º). Para os cards baterem com a tabela
  // (que oculta finalizados) e com o card "Pendentes de Análise" da aba Geral,
  // descontamos os obrigatórios já finalizados. É só ajuste de exibição — a
  // classificação jurídica permanece intacta.
  let concluidos = 0;
  let avalObrigAtivo = 0;
  (State.allData || []).forEach(r => {
    if (!r) return;
    if (registroConcluido(r)) concluidos++;
    else if (r._statusFinal === 'avaliacao-obrigatoria') avalObrigAtivo++;
  });

  // Pílulas do header
  if (DOM.statTotal)       DOM.statTotal.textContent       = c.total.toLocaleString('pt-BR');
  if (DOM.statAvalObrig)   DOM.statAvalObrig.textContent   = avalObrigAtivo.toLocaleString('pt-BR');
  if (DOM.statDispensada)  DOM.statDispensada.textContent  = c.dispensada.toLocaleString('pt-BR');
  if (DOM.statVerificacao) DOM.statVerificacao.textContent = c.verificacaoHumana.toLocaleString('pt-BR');

  // Cards de status final
  if (DOM.countAvalObrig)     DOM.countAvalObrig.textContent     = avalObrigAtivo.toLocaleString('pt-BR');
  if (DOM.countDispensada)    DOM.countDispensada.textContent    = c.dispensada.toLocaleString('pt-BR');
  if (DOM.countVerificacao)   DOM.countVerificacao.textContent   = c.verificacaoHumana.toLocaleString('pt-BR');
  // Une os dois sub-status de "não enquadrado" no mesmo card do panorama
  const totalNaoEnq = c.naoEnquadrado + c.naoEnquadradoArt1;
  if (DOM.countNaoEnquadrado) DOM.countNaoEnquadrado.textContent = totalNaoEnq.toLocaleString('pt-BR');

  // Cards Art. 2º — detalhamento por inciso
  if (DOM.countAll) DOM.countAll.textContent = c.alice.toLocaleString('pt-BR');
  if (DOM.countI)   DOM.countI.textContent   = c.I.toLocaleString('pt-BR');
  if (DOM.countII)  DOM.countII.textContent  = c.II.toLocaleString('pt-BR');
  if (DOM.countP1)  DOM.countP1.textContent  = c.p1.toLocaleString('pt-BR');
  if (DOM.countP2)  DOM.countP2.textContent  = c.p2.toLocaleString('pt-BR');

  //Summary cards — contadores secundários (visíveis nos summary cards do panorama)
  if (DOM.countAvalObrig2)   DOM.countAvalObrig2.textContent   = avalObrigAtivo.toLocaleString('pt-BR');
  if (DOM.countVerificacao2) DOM.countVerificacao2.textContent = c.verificacaoHumana.toLocaleString('pt-BR');

  //Detalhamento Art. 2º — contadores secundários
  const _cSuffix = (n) => n === 1 ? ' contrato' : ' contratos';
  if (DOM.countI2)  DOM.countI2.textContent  = c.I.toLocaleString('pt-BR') + _cSuffix(c.I);
  if (DOM.countII2) DOM.countII2.textContent = c.II.toLocaleString('pt-BR') + _cSuffix(c.II);
  if (DOM.countP12) DOM.countP12.textContent = c.p1.toLocaleString('pt-BR') + _cSuffix(c.p1);
  if (DOM.countP22) DOM.countP22.textContent = c.p2.toLocaleString('pt-BR') + _cSuffix(c.p2);

  //Percentuais dos summary cards
  const _pct = (n, tot) => tot > 0 ? Math.round(n / tot * 100) + '%' : '';
  if (DOM.countConcluidos)  DOM.countConcluidos.textContent  = concluidos.toLocaleString('pt-BR');
  if (DOM.pctAvalObrig)     DOM.pctAvalObrig.textContent     = _pct(avalObrigAtivo, c.total);
  if (DOM.pctVerificacao)   DOM.pctVerificacao.textContent   = _pct(c.verificacaoHumana, c.total);
  if (DOM.pctNaoEnquadrado) DOM.pctNaoEnquadrado.textContent = _pct(totalNaoEnq, c.total);
  if (DOM.pctDispensada)    DOM.pctDispensada.textContent    = _pct(c.dispensada, c.total);
  if (DOM.pctConcluidos)    DOM.pctConcluidos.textContent    = _pct(concluidos, c.total);
  if (typeof updateWorkQueue === 'function') updateWorkQueue();
}

/**
 * Define o filtro de card ativo, destaca o card e reaplica os filtros.
 * @param {string} filter — valor de data-filter do card clicado
 */
const FILTER_LABELS = {
  'avaliacao-obrigatoria': 'Avaliação obrigatória',
  'dispensada': 'Dispensados (Art. 8º)',
  'verificacao-humana': 'Verificação pendente',
  'nao-enquadrado': 'Fora do escopo',
  'nao-enquadrado-art1': 'Fora do Decreto',
  'all-art2': 'Enquadrados no Art. 2º',
  'art2-I': 'Art. 2º · Inciso I',
  'art2-II': 'Art. 2º · Inciso II',
  'art2-p1': 'Art. 2º · § 1º',
  'art2-p2': 'Art. 2º · § 2º',
  'concluido': 'Concluídos',
};

function setActiveFilter(filter) {
  State.activeFilter = filter;
  document.querySelectorAll('.summary-card').forEach(card => {
    card.classList.toggle('active', filter !== null && card.dataset.filter === filter);
  });
  document.querySelectorAll('.inciso-card').forEach(card => {
    card.classList.toggle('active-card', filter !== null && card.dataset.filter === filter);
  });

  const panoramaLabel = document.getElementById('panoramaTotalLabel');
  if (panoramaLabel) {
    panoramaLabel.textContent = filter ? (FILTER_LABELS[filter] || filter) : 'todos os contratos';
  }

  updateFilterChip();
  State.currentPage = 1;
  applyFilters();

  if (filter && DOM.tableBody) {
    const table = document.getElementById('tableSection');
    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateFilterChip() {
  const bar = document.getElementById('filterChipBar');
  const label = document.getElementById('filterChipLabel');
  if (!bar || !label) return;
  if (State.activeFilter) {
    label.textContent = FILTER_LABELS[State.activeFilter] || State.activeFilter;
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }
}

function updateExportVisibility() {
  const nav = document.getElementById('exportNav');
  if (!nav) return;
  const temDados = State.allData && State.allData.length > 0;
  const aba = document.querySelector('.tab-btn.active');
  nav.hidden = !(temDados && aba && aba.dataset.tab === 'analise');
}

function updateWorkQueue() {
  const queue = document.getElementById('workQueue');
  const fila = document.getElementById('geralFila');
  const countEl = document.getElementById('geralFilaCount');
  const title = document.getElementById('workQueueTitle');
  const text = document.getElementById('workQueueText');
  const pendentes = (State.allData || []).filter(r => r._statusFinal === 'verificacao-humana').length;
  const temDados = State.allData && State.allData.length > 0;

  if (queue) {
    queue.hidden = !(temDados && pendentes > 0);
    if (title) title.textContent = pendentes === 1
      ? '1 processo aguardando você'
      : `${pendentes.toLocaleString('pt-BR')} processos aguardando você`;
    if (text) text.textContent = 'Fila de verificação pendente — informe o valor ou confirme o Art. 8º.';
  }
  if (fila) {
    fila.hidden = !(temDados && pendentes > 0);
    if (countEl) countEl.textContent = String(pendentes);
  }
}

function updateSyncLabel() {
  const el = document.getElementById('geralUltimaSync');
  const stale = document.getElementById('geralSyncStale');
  if (!el) return;
  if (!State.lastSyncAt) {
    el.textContent = '—';
    if (stale) stale.hidden = true;
    return;
  }
  const d = new Date(State.lastSyncAt);
  el.textContent = d.toLocaleString('pt-BR');
  const minutos = (Date.now() - State.lastSyncAt) / 60000;
  if (stale) stale.hidden = minutos < 60;
}

/* ─── Dropdowns de filtro ──────────────────────────────────────────────── */

/** Zera todas as opções dos selects de filtro para o estado inicial. */
function resetFilterDropdowns() {
  DOM.filterModalidade.innerHTML = '<option value="">Todas</option>';
  DOM.filterTipoObj.innerHTML    = '<option value="">Todos</option>';
  DOM.filterUasg.innerHTML       = '<option value="">Todos</option>';
  if (DOM.filterStatus) DOM.filterStatus.value = '';
}

/**
 * Popula os selects de Modalidade, Tipo de Objeto e UASG
 * com os valores únicos presentes no dataset carregado.
 */
function populateFilterDropdowns() {
  const data = State.allData;
  const modalidades = [...new Set(data.map(r => r.modalidade).filter(Boolean))].sort();
  const tiposObj    = [...new Set(data.map(r => r.tipo_objeto).filter(Boolean))].sort();
  const uasgs       = [...new Set(data.map(r => r.nome_Uasg).filter(Boolean))].sort();

  modalidades.forEach(m => {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    DOM.filterModalidade.appendChild(o);
  });

  tiposObj.forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    DOM.filterTipoObj.appendChild(o);
  });

  const UASG_LIMIT = 200;
  if (uasgs.length > UASG_LIMIT) {
    const opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = `— ${uasgs.length - UASG_LIMIT} UASGs ocultas (use a busca de texto) —`;
    DOM.filterUasg.appendChild(opt);
  }
  uasgs.slice(0, UASG_LIMIT).forEach(u => {
    const o = document.createElement('option');
    o.value = u;
    o.textContent = u.length > 55 ? u.slice(0, 52) + '…' : u;
    DOM.filterUasg.appendChild(o);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 6 — TABELA DE RESULTADOS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Mapa de status final → classe CSS da linha da tabela.
 */
const ROW_CLASS_MAP = {
  'avaliacao-obrigatoria': 'row-obrigatoria',
  'dispensada':            'row-dispensada',
  'verificacao-humana':    'row-verificacao',
  'nao-enquadrado':        'row-nao-enquadrado',
  // Órgãos excluídos pelo Art. 1º (empresa pública/economia mista)
  'nao-enquadrado-art1':   'row-nao-enquadrado',
};

/**
 * Renderiza uma linha <tr> completa para a tabela de resultados.
 * @param {Object} row
 * @param {number} globalIdx — índice em State.filteredData
 * @returns {string} HTML do <tr>
 */
function _buildTableRow(row, globalIdx) {
  const statusBadge = buildStatusFinalBadge(row);
  const baseClass   = registroConcluido(row) ? 'row-concluido' : (ROW_CLASS_MAP[row._statusFinal] || '');

  return `<tr class="${baseClass} table-row" onclick="App.openModal(${globalIdx})">
    <td class="td-edital">${escapeHtml(row.numero_ano_edital || '—')}</td>
    <td class="td-uasg" title="${escapeHtml(row.nome_Uasg || '')}">${escapeHtml(row.nome_Uasg || '—')}</td>
    <td class="td-valor-cell">${renderValorCell(row, globalIdx)}</td>
    <td class="td-status">${statusBadge}</td>
    <td class="td-acao">
      <button type="button" class="btn-detail" onclick="event.stopPropagation(); App.openModal(${globalIdx})">
        Abrir
      </button>
    </td>
  </tr>`;
}

/**
 * Renderiza a tabela completa (página atual) no DOM.
 */
function renderTable() {
  const data  = State.filteredData;
  const total = data.length;

  DOM.resultCount.textContent =
    `${total.toLocaleString('pt-BR')} ${total === 1 ? 'registro' : 'registros'}`;
  const hint = document.querySelector('.table-hint');
  if (hint) hint.hidden = total === 0;

  if (total === 0) {
    const temDados = State.allData && State.allData.length > 0;
    DOM.tableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>${
      temDados
        ? 'Nenhum registro neste filtro.'
        : 'Sincronize a planilha acima para começar a análise.'
    }</p>${temDados
      ? '<button type="button" class="btn-ir-analise" onclick="App.clearFilters()">Mostrar todos</button>'
      : ''}</div></td></tr>`;
    if (DOM.emptyState) DOM.emptyState.style.display = 'none';
    DOM.btnExport.disabled = true;
    renderPagination(0);
    return;
  }

  DOM.emptyState.style.display = 'none';
  DOM.btnExport.disabled       = false;

  const start    = (State.currentPage - 1) * State.pageSize;
  const pageData = data.slice(start, start + State.pageSize);

  DOM.tableBody.innerHTML = pageData
    .map((row, localIdx) => _buildTableRow(row, start + localIdx))
    .join('');

  renderPagination(total);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 7 — PAGINAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Renderiza os controles de paginação (botões + info).
 * @param {number} total — total de registros filtrados
 */
function renderPagination(total) {
  const totalPages = Math.ceil(total / State.pageSize);
  const cur        = State.currentPage;

  if (total === 0) {
    DOM.pageInfo.textContent = '';
    DOM.pageBtns.innerHTML   = '';
    return;
  }

  const start = (cur - 1) * State.pageSize + 1;
  const end   = Math.min(cur * State.pageSize, total);
  DOM.pageInfo.textContent =
    `Mostrando ${start.toLocaleString('pt-BR')}–${end.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;

  let html = `<button class="btn-page" ${cur === 1 ? 'disabled' : ''} onclick="App.changePage(${cur - 1})" aria-label="Página anterior">‹</button>`;

  const range = [];
  for (let p = Math.max(1, cur - 2); p <= Math.min(totalPages, cur + 2); p++) range.push(p);

  if (range[0] > 1) {
    html += `<button class="btn-page" onclick="App.changePage(1)">1</button>`;
    if (range[0] > 2) html += `<span class="pagination-ellipsis">…</span>`;
  }

  range.forEach(p => {
    html += `<button class="btn-page ${p === cur ? 'active' : ''}" onclick="App.changePage(${p})">${p}</button>`;
  });

  if (range[range.length - 1] < totalPages) {
    if (range[range.length - 1] < totalPages - 1) html += `<span class="pagination-ellipsis">…</span>`;
    html += `<button class="btn-page" onclick="App.changePage(${totalPages})">${totalPages}</button>`;
  }

  html += `<button class="btn-page" ${cur === totalPages ? 'disabled' : ''} onclick="App.changePage(${cur + 1})" aria-label="Próxima página">›</button>`;
  DOM.pageBtns.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 8 — MODAL: BLOCO DE ORÇAMENTO SIGILOSO (ETAPA 1)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bloco de entrada de valor para orçamentos sigilosos.
 * Exibido no modal quando o valor não está disponível na planilha.
 * Este é o PRIMEIRO passo do fluxo de duas etapas.
 */
function buildSigilosoBlock(row, globalIdx, hasManual) {
  return `
    <div class="modal-sigiloso-block">
      <div class="modal-sigiloso-header">
        ${Icons.get('lock', 15)}
        <div>
          <strong>Informar o valor estimado</strong>
          <span>Digite o valor e pressione Enter para classificar.</span>
        </div>
      </div>
      ${hasManual ? `
      <div class="modal-sigiloso-set">
        <p>Valor atual: ${formatCurrency(row._valor_manual, true)}</p>
        <button class="btn-valor-clear-modal"
          onclick="App.clearManualValue(${globalIdx}); App.openModal(${globalIdx});">
          ${Icons.get('close', 12)} Remover valor manual
        </button>
      </div>` : `
      <div class="modal-sigiloso-input">
        <input type="number" id="modalValorInput"
               placeholder="Ex: 18000000" min="0" step="1000"
               onkeydown="if(event.key==='Enter') App.applyManualValueFromModal(${globalIdx})"
               aria-label="Informar valor estimado manualmente" />
        <button class="btn-valor-apply-modal"
          onclick="App.applyManualValueFromModal(${globalIdx})">
          Aplicar
        </button>
      </div>`}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 9 — MODAL: BLOCO DE VALIDAÇÃO ART. 8º (ETAPA 2)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bloco de validação manual do Art. 8º com 4 opções.
 * Exibido quando _art8 === 'pendente-validacao' (data < 10/03/2025 ou sem data).
 *
 * Este é o SEGUNDO passo do fluxo de duas etapas, exibido após o valor
 * ser informado (ou quando o processo enquadra no Art. 2º e tem data anterior).
 *
 * Lógica de resultado:
 *   assinatura_antes | publicacao_antes | inicio_antes → DISPENSADA (Art. 8º caput)
 *   nenhum                                             → OBRIGATÓRIA (Art. 2º)
 *   info_nao_disponivel                                → Permanece pendente
 *
 * @param {Object} row
 * @param {number} globalIdx
 * @returns {string} HTML
 */
function buildArt8ValidationBlock(row, globalIdx) {
  const validacao = row._validacao_art8;

  // Contexto de data detectada (para exibir ao analista)
  let isoDate = null;
  if (row._data_referencia_manual && row._data_referencia_manual.data) {
    isoDate = Classifier.normalizeDateToISO(row._data_referencia_manual.data);
  }
  if (!isoDate) isoDate = Classifier.normalizeDateToISO(row.dt_public_edital);
  const dataContexto = isoDate ? isoDate.split('-').reverse().join('/') : null;

  // Já tem validação aplicada
  if (validacao) {
    const opcaoLabel = Classifier.ART8_VALIDACAO_OPCOES_LABEL[validacao.opcao] || validacao.opcao;
    const isDispensa = Classifier.ART8_OPCOES_DISPENSA.includes(validacao.opcao);
    const isNenhum   = validacao.opcao === Classifier.ART8_OPCAO_NENHUM;
    const isIndisponivel = validacao.opcao === Classifier.ART8_OPCAO_INFO_ND;

    const resultClass = isDispensa ? 'art8-val-result--dispensado'
                      : isNenhum   ? 'art8-val-result--obrigatorio'
                      : 'art8-val-result--pendente';
    const resultIcon  = isDispensa ? 'checkCircle'
                      : isNenhum   ? 'shield'
                      : 'helpCircle';
    const resultLabel = isDispensa ? 'Dispensada pelo Art. 8º'
                      : isNenhum   ? 'Avaliação Obrigatória — Art. 2º'
                      : 'Pendente — informação indisponível';

    return `
      <div class="modal-art8-validation-block modal-art8-validation-block--done">
        <div class="art8-val-header">
          ${Icons.get('shield', 15)}
          <div>
            <strong>Etapa 2 — Validação Art. 8º (Concluída)</strong>
            <span>Resultado definido com base na seleção do analista.</span>
          </div>
        </div>
        <div class="art8-val-result ${resultClass}">
          ${Icons.get(resultIcon, 16)}
          <div>
            <strong>${resultLabel}</strong>
            <p>Opção selecionada: <em>"${escapeHtml(opcaoLabel)}"</em></p>
          </div>
        </div>
        <button class="btn-art8-val-clear"
          onclick="App.clearArt8Validation(${globalIdx})">
          ${Icons.get('close', 12)} Refazer validação
        </button>
      </div>`;
  }

  // Bloco de seleção das 4 opções
  return `
    <div class="modal-art8-validation-block">
      <div class="art8-val-header">
        ${Icons.get('shield', 15)}
        <div>
          <strong>Etapa 2 — Validação Obrigatória — Art. 8º (Decreto 34.196/2024)</strong>
          <span>
            ${dataContexto
              ? `Data detectada: <strong>${escapeHtml(dataContexto)}</strong> — anterior a 10/03/2025.`
              : 'Data não identificada na planilha.'
            }
            A dispensa pelo Art. 8º <strong>não é automática</strong>.
            Confirme abaixo qual evento ocorreu antes de 10/03/2025:
          </span>
        </div>
      </div>

      <div class="art8-val-options">

        <label class="art8-val-opt art8-val-opt--dispensa">
          <input type="radio" name="art8ValidationOpcao" value="assinatura_antes">
          <span class="art8-val-opt-icon">${Icons.get('pen', 14)}</span>
          <span class="art8-val-opt-text">
            <strong>Assinatura do instrumento contratual antes de 10/03/2025</strong>
            <em>O contrato, ata de registro de preços ou instrumento equivalente foi assinado antes desta data.</em>
          </span>
          <span class="art8-val-opt-result art8-val-opt-result--dispensado">→ Dispensada</span>
        </label>

        <label class="art8-val-opt art8-val-opt--dispensa">
          <input type="radio" name="art8ValidationOpcao" value="publicacao_antes">
          <span class="art8-val-opt-icon">${Icons.get('fileText', 14)}</span>
          <span class="art8-val-opt-text">
            <strong>Publicação do edital antes de 10/03/2025</strong>
            <em>O edital foi publicado no Diário Oficial ou portal eletrônico antes desta data.</em>
          </span>
          <span class="art8-val-opt-result art8-val-opt-result--dispensado">→ Dispensada</span>
        </label>

        <label class="art8-val-opt art8-val-opt--dispensa">
          <input type="radio" name="art8ValidationOpcao" value="inicio_antes">
          <span class="art8-val-opt-icon">${Icons.get('zap', 14)}</span>
          <span class="art8-val-opt-text">
            <strong>Início do processo por dispensa/inexigibilidade antes de 10/03/2025</strong>
            <em>A abertura ou autorização do processo de contratação direta ocorreu antes desta data.</em>
          </span>
          <span class="art8-val-opt-result art8-val-opt-result--dispensado">→ Dispensada</span>
        </label>

        <label class="art8-val-opt art8-val-opt--nenhum">
          <input type="radio" name="art8ValidationOpcao" value="nenhum">
          <span class="art8-val-opt-icon">${Icons.get('xCircle', 14)}</span>
          <span class="art8-val-opt-text">
            <strong>Nenhum dos anteriores</strong>
            <em>Nenhum dos eventos acima ocorreu antes de 10/03/2025.</em>
          </span>
          <span class="art8-val-opt-result art8-val-opt-result--obrigatorio">→ Obrigatória</span>
        </label>

        <label class="art8-val-opt art8-val-opt--info-nd">
          <input type="radio" name="art8ValidationOpcao" value="info_nao_disponivel">
          <span class="art8-val-opt-icon">${Icons.get('helpCircle', 14)}</span>
          <span class="art8-val-opt-text">
            <strong>Informação não disponível no momento</strong>
            <em>Não é possível verificar agora. O registro permanecerá como pendente.</em>
          </span>
          <span class="art8-val-opt-result art8-val-opt-result--pendente">→ Pendente</span>
        </label>

      </div>

      <div class="art8-val-actions">
        <button class="btn-art8-val-apply"
          onclick="App.applyArt8Validation(${globalIdx})">
          ${Icons.get('checkCircle', 14)} Aplicar e Definir Status Final
        </button>
        <p class="art8-val-decree-note">
          ${Icons.get('info', 11)}
          Conforme <strong>Art. 8º caput</strong> do Decreto 34.196/2024:
          contratações com eventos anteriores a 10/03/2025 estão dispensadas da Avaliação de Integridade,
          exceto aditivos contratuais (Art. 8º § único).
        </p>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 10 — MODAL: BLOCO ART. 8º (resultado + data ref. complementar)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bloco completo do Art. 8º no modal.
 * Quando _art8 === 'pendente-validacao', chama buildArt8ValidationBlock.
 * Para outros status, exibe o resultado com informações da decisão.
 */
function buildArt8ModalBlock(row, globalIdx, art8Meta) {
  const status = row._art8;
  if (status === 'nao-aplicavel') return '';

  // Pendente de validação: exibir o bloco de 4 opções (Etapa 2)
  if (status === 'pendente-validacao') {
    return `
      <div class="modal-norma-group">
        <p class="modal-kicker">Art. 8º — dispensa</p>
        ${buildArt8ValidationBlock(row, globalIdx)}
      </div>`;
  }

  // Status resolvido: exibir resultado
  const blockClassMap = {
    'vigente':         'art8-block-vigente',
    'excecao-aditivo': 'art8-block-vigente',
    'dispensado':      'art8-block-dispensado',
    'sem-data':        'art8-block-semdata',
  };
  const blockClass = blockClassMap[status] || 'art8-block-neutral';
  const motivoArt8 = escapeHtml(row._motivoArt8 || art8Meta.detail || '');

  const alertP2III = (status === 'vigente' || status === 'excecao-aditivo') ? `
    <div class="modal-info-card modal-info-card--neutral">
      <div class="modal-info-card-title">Art. 1º, §2º — Momentos da Avaliação</div>
      <p class="modal-info-card-lead">
        A Avaliação de Integridade não se restringe ao momento anterior à assinatura.
        Conforme o Decreto 34.196/2024, ela pode ocorrer em três momentos:
      </p>
      <ul class="modal-info-list">
        <li><strong>Inciso I:</strong> antes da assinatura do contrato ou do aditivo contratual</li>
        <li><strong>Inciso II:</strong> durante a vigência contratual, antes do vencimento da última avaliação</li>
        <li><strong>Inciso III:</strong> a qualquer tempo durante a vigência, a critério da administração</li>
      </ul>
      <p class="modal-info-card-foot">Este critério não é verificável automaticamente — cabe à administração decidir o momento.</p>
    </div>` : '';

  // Botão para refazer validação (quando já validado manualmente)
  const refazerBtn = row._validacao_art8 ? `
    <div class="mt-12">
      <button class="btn-art8-val-clear" onclick="App.clearArt8Validation(${globalIdx})">
        ${Icons.get('close', 12)} Refazer validação Art. 8º
      </button>
    </div>` : '';

  // Alerta de conflito de data (Art. 8º): dispensa confirmada pelo analista que
  // contradiz a única data conhecida do processo. É um AVISO, não um bloqueio.
  const alertConflito = row._art8Conflito ? `
    <div class="modal-info-card modal-info-card--warning">
      <div class="modal-info-card-title">Atenção — possível inconsistência de data</div>
      <p class="modal-info-card-lead">${escapeHtml(row._art8Conflito)}</p>
    </div>` : '';

  return `
    <div class="modal-norma-group">
      <p class="modal-kicker">Art. 8º — dispensa</p>
      <div class="art8-block ${blockClass}">
        <div class="art8-block-header">
          <div class="art8-block-icon">${Icons.get(art8Meta.icon || 'info', 18)}</div>
          <div class="art8-block-text">
            <strong>${art8Meta.label || 'Não determinado'}</strong>
            <p>${motivoArt8}</p>
          </div>
        </div>
      </div>
      ${alertConflito}
      ${alertP2III}
      ${refazerBtn}
    </div>`;
}

/**
 * Bloco para informar data de referência manualmente (complementar).
 * Exibido apenas quando a data não está na planilha, como informação de contexto.
 * Nota: a partir da v4.0, a decisão de dispensa usa o bloco de validação de 4 opções, não a data diretamente.
 */
function buildDataRefBlock(row, globalIdx, needsDateInput, hasManualDate) {
  if (!needsDateInput && !hasManualDate) return '';

  const dr         = row._data_referencia_manual;
  const tipoAtual  = dr ? (DATA_REF_TIPOS[dr.tipo] || dr.tipo) : '';
  const dataAtual  = dr ? dr.data.split('-').reverse().join('/') : '';
  const fonteAtual = dr ? (dr.fonte || '—') : '';

  return `
    <div class="modal-data-ref-block ${hasManualDate ? 'modal-data-ref-block--set' : ''}">
      <div class="modal-data-ref-header">
        ${Icons.get('calendar', 15)}
        <div>
          <strong>${hasManualDate
            ? 'Data de Referência Informada Manualmente (contexto)'
            : 'Informar Data de Referência (opcional — contexto para o Art. 8º)'}</strong>
          <span>${hasManualDate
            ? 'Data informada como contexto. A decisão de dispensa é definida pelo bloco de validação acima.'
            : 'Opcional: informe a data que encontrou para auxiliar a validação do Art. 8º. A decisão de dispensa requer o bloco de validação acima.'
          }</span>
        </div>
      </div>

      ${hasManualDate ? `
      <div class="modal-data-ref-current">
        <div class="modal-data-ref-row">
          <span class="modal-data-ref-label">Tipo de data</span>
          <span class="modal-data-ref-val">${escapeHtml(tipoAtual)}</span>
        </div>
        <div class="modal-data-ref-row">
          <span class="modal-data-ref-label">Data informada</span>
          <span class="modal-data-ref-val"><strong>${escapeHtml(dataAtual)}</strong></span>
        </div>
        ${dr.fonte ? `
        <div class="modal-data-ref-row">
          <span class="modal-data-ref-label">Fonte</span>
          <span class="modal-data-ref-val">${escapeHtml(fonteAtual)}</span>
        </div>` : ''}
        <button class="btn-data-ref-clear"
          onclick="App.clearManualDate(${globalIdx}); App.openModal(${globalIdx});">
          ${Icons.get('close', 12)} Remover data de referência
        </button>
      </div>` : `
      <div class="modal-data-ref-form">
        <p class="modal-data-ref-hint">
          ${Icons.get('info', 12)}
          Informe a data mais relevante que encontrou para este processo (opcional):
        </p>
        <div class="data-ref-tipo-group">
          <label class="data-ref-tipo-opt">
            <input type="radio" name="modalDataRefTipo" value="publicacao_edital" checked>
            <span class="data-ref-tipo-icon">${Icons.get('fileText', 13)}</span>
            <span class="data-ref-tipo-text">
              <strong>Publicação do edital</strong>
              <em>Data de publicação no Diário Oficial ou portal eletrônico</em>
            </span>
          </label>
          <label class="data-ref-tipo-opt">
            <input type="radio" name="modalDataRefTipo" value="assinatura_contrato">
            <span class="data-ref-tipo-icon">${Icons.get('pen', 13)}</span>
            <span class="data-ref-tipo-text">
              <strong>Assinatura do instrumento contratual</strong>
              <em>Data de assinatura do contrato, ata ou instrumento equivalente</em>
            </span>
          </label>
          <label class="data-ref-tipo-opt">
            <input type="radio" name="modalDataRefTipo" value="inicio_dispensa">
            <span class="data-ref-tipo-icon">${Icons.get('zap', 13)}</span>
            <span class="data-ref-tipo-text">
              <strong>Início da dispensa / inexigibilidade</strong>
              <em>Data de abertura ou autorização do processo de contratação direta</em>
            </span>
          </label>
        </div>
        <div class="data-ref-inputs-row">
          <div class="data-ref-date-wrap">
            <label for="modalDataRefInput">Data encontrada</label>
            <input type="date" id="modalDataRefInput"
                   min="2000-01-01" max="2030-12-31"
                   aria-label="Data de referência (contexto para o Art. 8º)" />
          </div>
          <div class="data-ref-fonte-wrap">
            <label for="modalDataRefFonte">Fonte / onde encontrou <span>(opcional)</span></label>
            <input type="text" id="modalDataRefFonte"
                   placeholder="Ex.: DOU nº 45, PNCP, SEI 001/2025…"
                   maxlength="200"
                   aria-label="Fonte da informação" />
          </div>
        </div>
        <div class="data-ref-actions">
          <button class="btn-data-ref-apply"
            onclick="App.applyManualDateFromModal(${globalIdx})">
            ${Icons.get('checkCircle', 14)} Salvar Data de Referência
          </button>
        </div>
      </div>`}
    </div>`;
}

/**
 * Renderiza a célula "Contrato assinado?" inline na tabela.
 * @param {Object} row
 * @param {number} globalIdx
 * @returns {string} HTML do <td>
 */
function _buildContratoCell(row, globalIdx) {
  const val = row._contrato_assinado; // 'sim' | 'nao' | undefined

  if (val === 'sim') {
    return `<td class="td-contrato">
      <button class="contrato-toggle contrato-toggle--sim"
              onclick="App.toggleContratoAssinado(${globalIdx})"
              title="Contrato assinado — clique para alterar">
        ${Icons.get('checkCircle', 13)}<span>Sim</span>
      </button>
    </td>`;
  }
  if (val === 'nao') {
    return `<td class="td-contrato">
      <button class="contrato-toggle contrato-toggle--nao"
              onclick="App.toggleContratoAssinado(${globalIdx})"
              title="Contrato não assinado — clique para alterar">
        ${Icons.get('xCircle', 13)}<span>Não</span>
      </button>
    </td>`;
  }
  // Não respondido
  return `<td class="td-contrato">
    <div class="contrato-toggle-group">
      <button class="contrato-opt contrato-opt--sim"
              onclick="App.applyContratoAssinado(${globalIdx}, 'sim')"
              title="Marcar como assinado">
        ${Icons.get('checkCircle', 12)}<span>Sim</span>
      </button>
      <button class="contrato-opt contrato-opt--nao"
              onclick="App.applyContratoAssinado(${globalIdx}, 'nao')"
              title="Marcar como não assinado">
        ${Icons.get('xCircle', 12)}<span>Não</span>
      </button>
    </div>
  </td>`;
}
/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 11B — MODAL: BLOCO DE PERGUNTAS — AVALIAÇÃO OBRIGATÓRIA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rótulos legíveis para categorias do processo (Avaliação Obrigatória) */
const AVALIACAO_OBRIG_CATEGORIAS = {
  licitacao_andamento:    'Licitação em andamento',
  adjudicado_fornecedor:  'Fornecedor já escolhido',
  contrato_firmado:       'Contrato assinado, sem execução',
  contrato_execucao:      'Contrato em execução',
};

/**
 * Constrói o bloco de perguntas adicionais exibido no modal
 * APENAS para processos com status final "Avaliação Obrigatória".
 *
 * Perguntas:
 *   1. Em qual categoria o processo se encontra? (radio)
 *   2. Existe valor de adjudicação? (radio Sim/Não)
 *   3. O contrato foi interrompido? (radio Sim/Não)
 *   4. Caso sim, qual o motivo? (textarea condicional)
 *
 * @param {Object} row
 * @param {number} globalIdx
 * @returns {string} HTML
 */
function buildAvaliacaoObrigatoriaBlock(row, globalIdx) {
  const dados = row._avaliacao_obrig_dados;

  // ── Já respondido: exibe resumo + botão para refazer ─────────────────────
  if (dados) {
    const isInterrompido = dados.contrato_interrompido === 'sim';

    if (isInterrompido) {
      // FLUXO A: Contrato interrompido — resumo simplificado (fora do escopo)
      return `
        <p class="modal-kicker">Contrato interrompido</p>
        <div class="modal-aval-obrig-block modal-aval-obrig-block--done" style="border-left: 3px solid var(--muted);">
          <div class="aval-obrig-header" style="color:#64748b;">
            ${Icons.get('slash', 15)}
            <div>
              <strong>Contrato Interrompido — Fora do Escopo</strong>
              <span>Este processo foi direcionado para fora do escopo da Avaliação de Integridade Obrigatória.</span>
            </div>
          </div>
          <div class="aval-obrig-resumo">
            <div class="aval-obrig-resumo-item">
              <span class="aval-obrig-resumo-label">O contrato foi interrompido?</span>
              <span class="aval-obrig-resumo-val">Sim</span>
            </div>
            ${dados.motivo_interrupcao ? `
            <div class="aval-obrig-resumo-item aval-obrig-resumo-item--full">
              <span class="aval-obrig-resumo-label">Motivo da interrupção</span>
              <span class="aval-obrig-resumo-val">${escapeHtml(dados.motivo_interrupcao)}</span>
            </div>` : ''}
          </div>
          <button class="btn-aval-obrig-clear"
            onclick="App.clearAvaliacaoObrigatoria(${globalIdx})">
            ${Icons.get('close', 12)} Desfazer (retornar para Avaliação Obrigatória)
          </button>
        </div>`;
    }

    if (!questionarioRespondido(dados)) {
      /* Resposta incompleta (ex.: disse que há adjudicação e não informou o valor).
         Cai no formulário abaixo. */
    } else {
    // FLUXO B: Contrato não interrompido — resumo completo
    const catLabel = AVALIACAO_OBRIG_CATEGORIAS[dados.categoria] || dados.categoria || '—';
    const adjNum = Number(dados.valor_adjudicado);
    const adjLabel = dados.valor_adjudicacao === 'sim'
      ? (adjNum > 0 ? 'Sim — ' + fmtReais(adjNum) : 'Sim')
      : (dados.valor_adjudicacao === 'nao' ? 'Não' : '—');
    const ctrLabel = dados.contrato_assinado === 'sim' ? 'Sim' : (dados.contrato_assinado === 'nao' ? 'Não' : '—');

    const jaConcluido = registroConcluido(row);
    const cicloFechado = !!(window.Ciclos && Ciclos.ativo() && row._uid && Ciclos.statusDe(row._uid) === 'FINALIZADO');

    return `
      <div class="modal-aval-obrig-block modal-aval-obrig-block--done">
        <div class="aval-obrig-header">
          ${Icons.get('checkCircle', 15)}
          <div>
            <strong>${jaConcluido ? 'Processo concluído' : 'Respostas salvas'}</strong>
            <span>${jaConcluido
              ? 'Este processo saiu da avaliação obrigatória.'
              : 'Confira e conclua. Ele sai da avaliação obrigatória e passa para Concluído.'}</span>
          </div>
        </div>
        <div class="aval-obrig-resumo">
          <div class="aval-obrig-resumo-item">
            <span class="aval-obrig-resumo-label">Contrato interrompido</span>
            <span class="aval-obrig-resumo-val">Não</span>
          </div>
          <div class="aval-obrig-resumo-item">
            <span class="aval-obrig-resumo-label">Etapa</span>
            <span class="aval-obrig-resumo-val">${escapeHtml(catLabel)}</span>
          </div>
          <div class="aval-obrig-resumo-item">
            <span class="aval-obrig-resumo-label">Valor de adjudicação</span>
            <span class="aval-obrig-resumo-val">${escapeHtml(adjLabel)}</span>
          </div>
          <div class="aval-obrig-resumo-item">
            <span class="aval-obrig-resumo-label">Contrato assinado</span>
            <span class="aval-obrig-resumo-val">${escapeHtml(ctrLabel)}</span>
          </div>
        </div>
        ${jaConcluido ? (cicloFechado ? '' : `
        <div class="aval-obrig-acoes">
          <button class="btn-aval-obrig-clear" onclick="App.desfazerConclusao(${globalIdx})">
            Desfazer conclusão
          </button>
        </div>`) : `
        <div class="aval-obrig-acoes">
          <button class="btn-aval-obrig-apply" onclick="App.concluirProcesso(${globalIdx})">
            ${Icons.get('checkCircle', 14)} Concluir processo
          </button>
          <button class="btn-aval-obrig-clear" onclick="App.clearAvaliacaoObrigatoria(${globalIdx})">
            Refazer
          </button>
        </div>`}
      </div>`;
    }
  }

  // ── Uma pergunta por vez ────────────────────────────────────────────────
  return `
    <p class="modal-kicker">Questionário</p>
    <div class="modal-aval-obrig-block" id="qWizard" data-atual="1">
      <div class="q-top">
        <button type="button" class="q-back" id="qBack" hidden onclick="App.questaoVoltar()">Voltar</button>
        <span class="q-progress" id="qProgress">Pergunta 1 de 4</span>
      </div>

      <div class="q-step" data-q="1">
        <p class="aval-obrig-q-label"><strong>O contrato foi interrompido?</strong></p>
        <div class="aval-obrig-options aval-obrig-options--inline">
          <label class="aval-obrig-opt aval-obrig-opt--compact" onclick="App.questaoEscolher('interrompido', 'nao')">
            <input type="radio" name="avalObrigInterrompido" value="nao">
            <span class="aval-obrig-opt-text">Não</span>
          </label>
          <label class="aval-obrig-opt aval-obrig-opt--compact" onclick="App.questaoEscolher('interrompido', 'sim')">
            <input type="radio" name="avalObrigInterrompido" value="sim">
            <span class="aval-obrig-opt-text">Sim</span>
          </label>
        </div>
      </div>

      <div class="q-step" data-q="motivo" hidden>
        <p class="aval-obrig-q-label"><strong>Qual o motivo da interrupção?</strong></p>
        <textarea id="avalObrigMotivoInput" class="aval-obrig-textarea" rows="3" maxlength="1000"
          placeholder="Descreva o motivo em poucas linhas"
          aria-label="Motivo da interrupção do contrato"></textarea>
        <p class="q-hint">Ao salvar, este processo sai da avaliação obrigatória e vai para fora do escopo.</p>
        <div class="aval-obrig-actions">
          <button type="button" class="btn-aval-obrig-apply" onclick="App.applyAvaliacaoObrigatoria(${globalIdx})">
            Salvar e tirar da avaliação
          </button>
        </div>
      </div>

      <div class="q-step" data-q="2" hidden>
        <p class="aval-obrig-q-label"><strong>Em que etapa está o processo?</strong></p>
        <div class="aval-obrig-options">
          <label class="aval-obrig-opt" onclick="App.questaoEscolher('categoria', 'licitacao_andamento')">
            <input type="radio" name="avalObrigCategoria" value="licitacao_andamento">
            <span class="aval-obrig-opt-text">Licitação em andamento</span>
          </label>
          <label class="aval-obrig-opt" onclick="App.questaoEscolher('categoria', 'adjudicado_fornecedor')">
            <input type="radio" name="avalObrigCategoria" value="adjudicado_fornecedor">
            <span class="aval-obrig-opt-text">Fornecedor já escolhido</span>
          </label>
          <label class="aval-obrig-opt" onclick="App.questaoEscolher('categoria', 'contrato_firmado')">
            <input type="radio" name="avalObrigCategoria" value="contrato_firmado">
            <span class="aval-obrig-opt-text">Contrato assinado, sem execução</span>
          </label>
          <label class="aval-obrig-opt" onclick="App.questaoEscolher('categoria', 'contrato_execucao')">
            <input type="radio" name="avalObrigCategoria" value="contrato_execucao">
            <span class="aval-obrig-opt-text">Contrato em execução</span>
          </label>
        </div>
      </div>

      <div class="q-step" data-q="3" hidden>
        <p class="aval-obrig-q-label"><strong>Já existe valor de adjudicação?</strong></p>
        <div class="aval-obrig-options aval-obrig-options--inline">
          <label class="aval-obrig-opt aval-obrig-opt--compact" onclick="App.questaoEscolher('adjudicacao', 'sim')">
            <input type="radio" name="avalObrigAdjudicacao" value="sim">
            <span class="aval-obrig-opt-text">Sim</span>
          </label>
          <label class="aval-obrig-opt aval-obrig-opt--compact" onclick="App.questaoEscolher('adjudicacao', 'nao')">
            <input type="radio" name="avalObrigAdjudicacao" value="nao">
            <span class="aval-obrig-opt-text">Não</span>
          </label>
        </div>
        <div class="q-valor" id="avalObrigValorWrap" hidden>
          <label class="aval-obrig-q-label" for="avalObrigValorInput"><strong>Qual o valor adjudicado?</strong></label>
          <input type="text" inputmode="decimal" id="avalObrigValorInput" class="q-valor-input"
            placeholder="Ex.: 1.500.000,00" autocomplete="off"
            aria-label="Valor adjudicado em reais"
            onkeydown="if(event.key==='Enter'){event.preventDefault();App.questaoValorAdjudicado();}">
          <div class="aval-obrig-actions">
            <button type="button" class="btn-aval-obrig-apply" onclick="App.questaoValorAdjudicado()">Continuar</button>
          </div>
        </div>
      </div>

      <div class="q-step" data-q="4" hidden>
        <p class="aval-obrig-q-label"><strong>O contrato já foi assinado?</strong></p>
        <div class="aval-obrig-options aval-obrig-options--inline">
          <label class="aval-obrig-opt aval-obrig-opt--compact">
            <input type="radio" name="avalObrigContratoAssinado" value="sim">
            <span class="aval-obrig-opt-text">Sim</span>
          </label>
          <label class="aval-obrig-opt aval-obrig-opt--compact">
            <input type="radio" name="avalObrigContratoAssinado" value="nao">
            <span class="aval-obrig-opt-text">Não</span>
          </label>
        </div>
        <div class="aval-obrig-actions">
          <button type="button" class="btn-aval-obrig-apply" onclick="App.applyAvaliacaoObrigatoria(${globalIdx})">
            Salvar respostas
          </button>
        </div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 12 — MODAL PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Abre o modal de detalhes para o registro de índice globalIdx
 * em State.filteredData.
 * @param {number} globalIdx
 */
let _modalIdx = -1;

function _modalNavHtml(globalIdx) {
  const total = State.filteredData.length;
  const pos   = globalIdx + 1;
  return `
    <div class="modal-nav">
      <button type="button" class="btn-modal-nav" ${globalIdx <= 0 ? 'disabled' : ''}
        onclick="event.stopPropagation(); App.modalPrev()">Anterior</button>
      <span class="modal-nav-pos">${pos} de ${total.toLocaleString('pt-BR')}</span>
      <button type="button" class="btn-modal-nav btn-modal-nav--next" ${globalIdx >= total - 1 ? 'disabled' : ''}
        onclick="event.stopPropagation(); App.modalNext()">Próximo</button>
    </div>`;
}

function modalPrev() {
  if (_modalIdx > 0) openModal(_modalIdx - 1);
}

function modalNext() {
  if (_modalIdx >= 0 && _modalIdx < State.filteredData.length - 1) openModal(_modalIdx + 1);
}

function openModal(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;
  _modalIdx = globalIdx;

  if (DOM.modalKicker) DOM.modalKicker.textContent = 'Edital';
  DOM.modalTitle.textContent    = row.numero_ano_edital || '—';
  DOM.modalSubtitle.textContent = row.nome_Uasg || '';

  const statusMeta = Classifier.STATUS_FINAL_META[row._statusFinal] || {};
  const art8Meta   = Classifier.ART8_META[row._art8] || Classifier.ART8_META['nao-aplicavel'];
  const isSig      = Classifier.isSigiloso(row);
  const hasManual  = row._valor_manual !== undefined && row._valor_manual > 0;

  const precisaValor = isSig && !hasManual;
  const precisaArt8  = !precisaValor && row._art8 === 'pendente-validacao';
  const precisaQuestionario = (row._statusFinal === 'avaliacao-obrigatoria' || row._interrompido)
    && !row._avaliacao_obrig_dados;
  const dadosQ = row._avaliacao_obrig_dados;
  const questionarioPronto = questionarioRespondido(dadosQ);
  const questionarioIncompleto = !!(dadosQ && dadosQ.contrato_interrompido !== 'sim' && !questionarioPronto);
  const concluido = registroConcluido(row);
  const podeConcluir = questionarioPronto && !concluido && row._statusFinal === 'avaliacao-obrigatoria';
  const showArt8Resolvido = (row._requerAlice || isSig) && row._art8 !== 'nao-aplicavel' && !precisaArt8;
  const showDataRefCtx  = !isSig && row._requerAlice &&
    (row._art8 === 'sem-data' || !!row._data_referencia_manual);
  const needsDateInput  = !row._data_referencia_manual && row._art8 === 'sem-data';
  const hasManualDate   = !!row._data_referencia_manual;

  const motivoArt2 = row._excluido_art1
    ? (row._motivoArt1 || 'O órgão não pertence à administração direta, autarquias ou fundações.')
    : row._requerAlice
      ? (row._motivoArt2 || '')
      : isSig
        ? 'O valor estimado não está na planilha.'
        : 'A contratação não atinge os critérios de valor ou modalidade do Art. 2º.';

  const factsHtml = `
      <dl class="modal-facts">
        <div><dt>Processo</dt><dd>${escapeHtml(row.processo || '—')}</dd></div>
        <div><dt>Modalidade</dt><dd>${escapeHtml(row.modalidade || '—')}</dd></div>
        <div><dt>Critério</dt><dd>${escapeHtml(row.criterio || '—')}</dd></div>
        <div><dt>Tipo</dt><dd>${escapeHtml(row.tipo_objeto || '—')}</dd></div>
        <div><dt>Publicação</dt><dd>${escapeHtml(fmtDateDisplay(row.dt_public_edital))}</dd></div>
        <div><dt>Valor</dt><dd>${formatCurrency(row.valor_estimado)}</dd></div>
        ${hasManual ? `<div><dt>Valor informado</dt><dd>${formatCurrency(row._valor_manual, true)}</dd></div>` : ''}
        <div><dt>Fonte</dt><dd>${escapeHtml(row.fonte_recursos || '—')}</dd></div>
        <div class="modal-facts--full"><dt>Natureza</dt><dd>${escapeHtml(row.nat_despesa || '—')}</dd></div>
        <div class="modal-facts--full"><dt>Objeto</dt><dd>${escapeHtml(row.objeto || '—')}</dd></div>
        ${row.observacoes ? `<div class="modal-facts--full"><dt>Planilha</dt><dd>${escapeHtml(row.observacoes)}</dd></div>` : ''}
      </dl>`;

  const acaoHtml = [
    precisaValor ? buildSigilosoBlock(row, globalIdx, hasManual) : '',
    precisaArt8 ? buildArt8ValidationBlock(row, globalIdx) : '',
    (precisaQuestionario || questionarioPronto || questionarioIncompleto) ? buildAvaliacaoObrigatoriaBlock(row, globalIdx) : '',
    row._motivoAditivoValorBaixo
      ? `<p class="modal-status-desc">${escapeHtml(row._motivoAditivoValorBaixo)}</p>` : '',
  ].join('');

  DOM.modalBody.innerHTML = `
    <div class="modal-zone modal-zone--resultado">
      <div class="modal-status-final ${concluido ? 'concluido' : (podeConcluir ? 'questionario-pronto' : row._statusFinal)}">
        <p class="modal-kicker">${concluido ? 'Resultado' : (podeConcluir ? 'Próximo passo' : (precisaValor || precisaArt8 || precisaQuestionario ? 'Falta fazer' : 'Resultado'))}</p>
        <h3 class="modal-status-title">${concluido ? 'Concluído' : (podeConcluir ? 'Questionário respondido' : (statusMeta.tableLabel || statusMeta.label || row._statusFinal))}</h3>
      </div>
      ${acaoHtml}
    </div>

    <div class="modal-zone modal-zone--mais">
      <details class="modal-more">
        <summary>Por que este resultado</summary>
        <p class="modal-art2-motivo">${escapeHtml(motivoArt2)}</p>
        ${row._requerAlice && row._reasons && row._reasons.length
          ? `<div class="modal-art2-incisos">${buildReasonTags(row._reasons)}</div>` : ''}
        ${showArt8Resolvido ? buildArt8ModalBlock(row, globalIdx, art8Meta) : ''}
        ${showDataRefCtx ? buildDataRefBlock(row, globalIdx, needsDateInput, hasManualDate) : ''}
      </details>

      <details class="modal-more">
        <summary>Dados do processo</summary>
        ${factsHtml}
      </details>

      ${isSig && hasManual ? `
      <details class="modal-more">
        <summary>Alterar valor</summary>
        ${buildSigilosoBlock(row, globalIdx, hasManual)}
      </details>` : ''}

      ${dadosQ && dadosQ.contrato_interrompido === 'sim' ? `
      <details class="modal-more" open>
        <summary>Questionário</summary>
        ${buildAvaliacaoObrigatoriaBlock(row, globalIdx)}
      </details>` : ''}

      <details class="modal-more" ${row._observacao_manual ? 'open' : ''}>
        <summary>${row._observacao_manual ? 'Observação' : 'Anotar'}</summary>
        ${buildObservacaoBlock(row, globalIdx)}
      </details>
    </div>
  `;
  if (DOM.modalFooter) DOM.modalFooter.innerHTML = _modalNavHtml(globalIdx);

  DOM.modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (DOM.modalOverlay) DOM.modalOverlay.scrollTop = 0;
  if (DOM.modalBody) DOM.modalBody.scrollTop = 0;

  const acao = DOM.modalBody && DOM.modalBody.querySelector('.modal-zone--resultado');
  const focusEl = acao && (
    acao.querySelector('#modalValorInput') || acao.querySelector('input[type="radio"]')
  );
  if (focusEl && typeof focusEl.focus === 'function') {
    setTimeout(() => focusEl.focus(), 40);
  }

  // ── Ciclo: iniciar análise (EM_ANALISE) só quando o analista REALMENTE começa ──
  // Abrir o modal apenas para consultar NÃO deve mover o registro para "em
  // análise". A transição ocorre na primeira interação efetiva com o
  // questionário obrigatório (qualquer mudança de campo). Um único listener
  // delegado, auto-removível, evita marcar consultas como trabalho iniciado.
  if (window.Ciclos && Ciclos.ativo() &&
      row._statusFinal === 'avaliacao-obrigatoria' && row._uid &&
      Ciclos.statusDe(row._uid) === 'PENDENTE') {
    const bloco = DOM.modalBody && DOM.modalBody.querySelector('.modal-aval-obrig-block');
    if (bloco) {
      bloco.addEventListener('change', function iniciar() {
        Ciclos.transicionar(row._uid, 'EM_ANALISE')
          .then(() => {
            if (typeof renderCiclosDashboard === 'function') renderCiclosDashboard();
            if (typeof applyFilters === 'function') applyFilters();
          })
          .catch(e => console.error('[Ciclos] Falha ao iniciar análise:', e.message || e));
      }, { once: true });
    }
  }
}

/**
 * Fecha o modal.
 * @param {Event} [e]
 */
function closeModal(e) {
  const direct     = !e;
  const onOverlay  = e && e.target === DOM.modalOverlay;
  const onCloseBtn = e && e.target && typeof e.target.closest === 'function'
                     && e.target.closest('.btn-close-modal');
  if (direct || onOverlay || onCloseBtn) {
    DOM.modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    _modalIdx = -1;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 13 — MODAL: BLOCO DE OBSERVAÇÕES DO ANALISTA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Constrói o bloco de observações manuais do analista no modal.
 * Quando já há observação salva, exibe o texto + botão de editar/remover.
 * Quando não há, exibe um textarea para digitação livre.
 * @param {Object} row
 * @param {number} globalIdx
 * @returns {string} HTML
 */
function buildObservacaoBlock(row, globalIdx) {
  const obs = row._observacao_manual || '';

  if (obs) {
    return `
      <div class="modal-observacao-block modal-observacao-block--set">
        <div class="obs-header">
          ${Icons.get('messageSquare', 15)}
          <div>
            <strong>Observações do Analista</strong>
            <span>Anotação registrada manualmente — será exportada no PDF e no CSV.</span>
          </div>
        </div>
        <div class="obs-content">
          <p class="obs-text">${escapeHtml(obs).replace(/\n/g, '<br>')}</p>
        </div>
        <div class="obs-actions">
          <button class="btn-obs-edit"
            onclick="App.editObservacaoManual(${globalIdx})"
            title="Editar observação">
            ${Icons.get('edit', 12)} Editar
          </button>
          <button class="btn-obs-clear"
            onclick="App.clearObservacaoManual(${globalIdx})"
            title="Remover observação">
            ${Icons.get('close', 12)} Remover
          </button>
        </div>
      </div>`;
  }

  return `
    <div class="modal-observacao-block">
      <div class="obs-header">
        ${Icons.get('messageSquare', 15)}
        <div>
          <strong>Observações do Analista</strong>
          <span>Registre anotações sobre este processo. Serão exportadas no PDF e no CSV.</span>
        </div>
      </div>
      <div class="obs-form">
        <textarea
          id="modalObservacaoInput"
          class="obs-textarea"
          rows="3"
          maxlength="1000"
          placeholder="Digite aqui suas observações sobre este processo… (máx. 1000 caracteres)"
          aria-label="Observações do analista"
        ></textarea>
        <div class="obs-form-actions">
          <span class="obs-char-hint">Máx. 1000 caracteres</span>
          <button class="btn-obs-save"
            onclick="App.applyObservacaoManual(${globalIdx})">
            ${Icons.get('checkCircle', 14)} Salvar Observação
          </button>
        </div>
      </div>
    </div>`;
}

/**
 * Abre o modo de edição da observação já salva —
 * substitui o bloco "set" pelo formulário com o texto atual pré-preenchido.
 * @param {number} globalIdx
 */
function _openObsEditMode(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const block = document.querySelector('.modal-observacao-block--set');
  if (!block) { openModal(globalIdx); return; }

  const obs = row._observacao_manual || '';
  block.insertAdjacentHTML('afterend', `
    <div class="modal-observacao-block" id="obsEditBlock">
      <div class="obs-header">
        ${Icons.get('messageSquare', 15)}
        <div>
          <strong>Editar Observações do Analista</strong>
          <span>Modifique o texto abaixo e clique em Salvar.</span>
        </div>
      </div>
      <div class="obs-form">
        <textarea
          id="modalObservacaoInput"
          class="obs-textarea"
          rows="3"
          maxlength="1000"
          aria-label="Observações do analista"
        >${escapeHtml(obs)}</textarea>
        <div class="obs-form-actions">
          <span class="obs-char-hint">Máx. 1000 caracteres</span>
          <button class="btn-obs-save"
            onclick="App.applyObservacaoManual(${globalIdx})">
            ${Icons.get('checkCircle', 14)} Salvar Observação
          </button>
        </div>
      </div>
    </div>`);
  block.remove();
  const ta = document.getElementById('modalObservacaoInput');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}
