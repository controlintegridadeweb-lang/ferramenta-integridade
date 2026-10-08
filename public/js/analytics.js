'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1 — CONTROLE DE ABAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ativa uma aba de navegação e exibe o painel correspondente.
 * Atualiza classes CSS e atributos ARIA (aria-selected) para acessibilidade.
 * @param {string} tabName — 'geral' | 'analise' | 'analytics' | 'historico'
 */
function switchTab(tabName) {
  // Atualizar botões de aba
  document.querySelectorAll('.tab-btn').forEach(function(t) {
    var isActive = t.dataset.tab === tabName;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Mostrar painel ativo, ocultar os demais — dupla garantia: CSS + inline style
  document.querySelectorAll('.tab-panel').forEach(function(p) {
    var shouldBeActive = p.id === ('panel-' + tabName);
    p.classList.toggle('active', shouldBeActive);
    // Força display via inline style como fallback quando CSS puro não basta
    p.style.display = shouldBeActive ? 'block' : 'none';
  });

  // Render da visão geral (cards consolidados do ciclo) quando a aba é ativada
  if (tabName === 'geral') {
    try {
      if (typeof renderCiclosDashboard === 'function') renderCiclosDashboard();
    } catch (err) {
      console.error('[switchTab] Erro em renderCiclosDashboard:', err);
    }
  }

  if (tabName === 'analytics') {
    try {
      if (typeof renderAnalytics === 'function') renderAnalytics();
    } catch (err) {
      console.error('[switchTab] Erro em renderAnalytics:', err);
    }
  }

  // Render do histórico de relatórios quando a aba é ativada
  if (tabName === 'historico') {
    try {
      if (window.Ciclos) Ciclos.renderHistorico();
    } catch (err) {
      console.error('[switchTab] Erro em renderHistorico:', err);
    }
  }

  if (typeof updateExportVisibility === 'function') updateExportVisibility();
  if (typeof updateSyncLabel === 'function') updateSyncLabel();
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 2 — MOTOR ANALÍTICO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Agrega os dados do dataset para os indicadores do dashboard.
 * @param {Object[]} data
 * @returns {Object} indicadores consolidados
 */
function _buildAnalyticsData(data) {
  // Interrompidos saíram da fila ativa do Art. 2º (ver Classifier.getCounts).
  // O painel analítico segue a MESMA regra para não divergir dos cards.
  const ativoArt2 = r => r._requerAlice && !r._interrompido;

  const total      = data.length;
  const enquadra   = data.filter(ativoArt2).length;
  const naoEnquad  = data.filter(r => r._statusFinal === 'nao-enquadrado').length;
  const naoEnquadArt1 = data.filter(r => r._statusFinal === 'nao-enquadrado-art1').length;
  const dispensada = data.filter(r => r._statusFinal === 'dispensada').length;
  const obrig      = data.filter(r => r._statusFinal === 'avaliacao-obrigatoria').length;
  const verif      = data.filter(r => r._statusFinal === 'verificacao-humana').length;
  const sigiloso   = data.filter(r => r._isSigiloso).length;

  // Art 2 por inciso (fila ativa — desconta interrompidos)
  const artI  = data.filter(r => ativoArt2(r) && r._reasons && r._reasons.includes('art2-I')).length;
  const artII = data.filter(r => ativoArt2(r) && r._reasons && r._reasons.includes('art2-II')).length;
  const artP1 = data.filter(r => ativoArt2(r) && r._reasons && r._reasons.includes('art2-p1')).length;
  const artP2 = data.filter(r => ativoArt2(r) && r._reasons && r._reasons.includes('art2-p2')).length;

  // Art 8 breakdown
  const art8_pend    = data.filter(r => r._art8 === 'pendente-validacao').length;
  const art8_disp    = data.filter(r => r._art8 === 'dispensado').length;
  const art8_vig     = data.filter(r => r._art8 === 'vigente').length;
  const art8_adit    = data.filter(r => r._art8 === 'excecao-aditivo').length;
  const art8_semdata = data.filter(r => r._art8 === 'sem-data').length;

  // Distribuição por modalidade
  const modalMap = {};
  data.forEach(r => {
    const m = String(r.modalidade || 'Não informada').trim() || 'Não informada';
    modalMap[m] = (modalMap[m] || 0) + 1;
  });

  // Distribuição por tipo de objeto
  const tipoMap = {};
  data.forEach(r => {
    const t = String(r.tipo_objeto || 'Não informado').trim() || 'Não informado';
    tipoMap[t] = (tipoMap[t] || 0) + 1;
  });

  // Distribuição por faixa de valor.
  // Os limiares do Decreto são ESTRITOS (> 15M / > 25M / > 35M), então o valor
  // EXATO no limite pertence à faixa INFERIOR (não enquadra). Por isso o intervalo
  // é (min, max]: aberto embaixo, fechado em cima — exceto a 1ª faixa, que inclui 0.
  const faixas = [
    { label: 'Até R$ 15M',        min: 0,          max: 15_000_000, incluiMin: true  },
    { label: 'R$ 15M – R$ 25M',   min: 15_000_000, max: 25_000_000, incluiMin: false },
    { label: 'R$ 25M – R$ 35M',   min: 25_000_000, max: 35_000_000, incluiMin: false },
    { label: 'Acima de R$ 35M',   min: 35_000_000, max: Infinity,   incluiMin: false },
    { label: 'Sigiloso/Não inf.', min: -1,          max: -1,         incluiMin: false },
  ];
  faixas.forEach(f => { f.count = 0; });
  data.forEach(r => {
    if (r._isSigiloso) { faixas[4].count++; return; }
    const v = r._valor_manual > 0 ? r._valor_manual : (r.valor_estimado || 0);
    const f = faixas.find(x => x.min !== -1 &&
      (x.incluiMin ? v >= x.min : v > x.min) && v <= x.max);
    if (f) f.count++;
  });

  // Top 10 UASGs com mais processos enquadrados (fila ativa)
  const uasgMap = {};
  data.filter(ativoArt2).forEach(r => {
    const u = String(r.nome_Uasg || r.codigoUasg || 'Não informado').trim() || 'Não informado';
    uasgMap[u] = (uasgMap[u] || 0) + 1;
  });
  const topUasg = Object.entries(uasgMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const mesMap = {};
  data.forEach(r => {
    const iso = (typeof Classifier !== 'undefined' && Classifier.normalizeDateToISO)
      ? Classifier.normalizeDateToISO(r.dt_public_edital)
      : String(r.dt_public_edital || '').slice(0, 10);
    if (!iso || iso.length < 7) return;
    const key = iso.slice(0, 7);
    mesMap[key] = (mesMap[key] || 0) + 1;
  });
  const porMes = Object.entries(mesMap).sort((a, b) => a[0].localeCompare(b[0]));

  const anoMap = {};
  const triMap = {};
  data.forEach(r => {
    const iso = _rowPubIso(r);
    if (!iso || iso.length < 7) return;
    const y = iso.slice(0, 4);
    const mes = Number(iso.slice(5, 7));
    const tri = Math.ceil(mes / 3);
    anoMap[y] = (anoMap[y] || 0) + 1;
    const tk = `${y}-T${tri}`;
    triMap[tk] = (triMap[tk] || 0) + 1;
  });
  const porAno = Object.entries(anoMap).sort((a, b) => b[0].localeCompare(a[0]));
  const porTrimestre = Object.entries(triMap).sort((a, b) => b[0].localeCompare(a[0]));

  return {
    total, enquadra, naoEnquad, naoEnquadArt1, dispensada, obrig, verif, sigiloso,
    artI, artII, artP1, artP2,
    art8_pend, art8_disp, art8_vig, art8_adit, art8_semdata,
    modalMap, tipoMap, faixas, topUasg, porMes, porAno, porTrimestre,
  };
}

let _dashPeriodo = 'todos';
let _dashDe = '';
let _dashAte = '';

const DASH_PERIODOS = [
  { id: 'todos', label: 'Todos' },
  { id: 'mes', label: 'Este mês' },
  { id: 'trimestre', label: 'Este trimestre' },
  { id: 'ano', label: 'Este ano' },
  { id: '12m', label: '12 meses' },
  { id: 'custom', label: 'Personalizado' },
];

function _rowPubIso(row) {
  if (typeof Classifier !== 'undefined' && Classifier.normalizeDateToISO) {
    return Classifier.normalizeDateToISO(row.dt_public_edital) || '';
  }
  return String(row.dt_public_edital || '').slice(0, 10);
}

function _isoYmd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function _lastDay(y, m) {
  return new Date(y, m, 0).getDate();
}

function _periodoRange(periodo, de, ate) {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth() + 1;
  if (periodo === 'todos') return null;
  if (periodo === 'mes') {
    return { de: _isoYmd(y, m, 1), ate: _isoYmd(y, m, _lastDay(y, m)) };
  }
  if (periodo === 'trimestre') {
    const start = Math.floor((m - 1) / 3) * 3 + 1;
    const end = start + 2;
    return { de: _isoYmd(y, start, 1), ate: _isoYmd(y, end, _lastDay(y, end)) };
  }
  if (periodo === 'ano') {
    return { de: _isoYmd(y, 1, 1), ate: _isoYmd(y, 12, 31) };
  }
  if (periodo === '12m') {
    const from = new Date(y, m - 12, 1);
    return {
      de: _isoYmd(from.getFullYear(), from.getMonth() + 1, 1),
      ate: _isoYmd(y, m, _lastDay(y, m)),
    };
  }
  if (periodo === 'custom') {
    if (!de && !ate) return null;
    return { de: de || '0000-01-01', ate: ate || '9999-12-31' };
  }
  return null;
}

function _filtrarPorPeriodo(data, periodo, de, ate) {
  const range = _periodoRange(periodo, de, ate);
  if (!range) return { rows: data, semData: 0, range: null };
  let semData = 0;
  const rows = data.filter(r => {
    const iso = _rowPubIso(r);
    if (!iso) { semData += 1; return false; }
    return iso >= range.de && iso <= range.ate;
  });
  return { rows, semData, range };
}

function setDashPeriodo(periodo) {
  _dashPeriodo = periodo || 'todos';
  if (typeof renderAnalytics === 'function') renderAnalytics();
}

function setDashPeriodoCustom() {
  const de = document.getElementById('dashDe');
  const ate = document.getElementById('dashAte');
  _dashPeriodo = 'custom';
  _dashDe = de ? de.value : '';
  _dashAte = ate ? ate.value : '';
  if (typeof renderAnalytics === 'function') renderAnalytics();
}

function abrirFiltroAnalise(filter) {
  if (typeof switchTab === 'function') switchTab('analise');
  if (typeof setActiveFilter === 'function') setActiveFilter(filter || null);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 3 — GRÁFICOS CANVAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Desenha um gráfico de barras no canvas indicado.
 * @param {string}   canvasId
 * @param {string[]} labels
 * @param {number[]} values
 * @param {string[]} colors  — cores CSS
 */
function _drawBar(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  const W    = canvas.clientWidth  || canvas.width;
  const H    = canvas.clientHeight || canvas.height;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const padL = 16, padR = 20, padT = 10, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  const max  = Math.max(...values, 1);
  const barW = Math.max(4, (chartW / labels.length) * 0.65);
  const gap  = (chartW / labels.length) * 0.35;

  labels.forEach((lbl, i) => {
    const x    = padL + i * (barW + gap) + gap / 2;
    const barH = (values[i] / max) * chartH;
    const y    = padT + chartH - barH;
    const r    = Math.min(4, barW / 2);
    const col  = colors[i % colors.length];

    // Barra arredondada no topo
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, y + barH);
    ctx.lineTo(x, y + barH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();

    // Valor em cima da barra
    if (values[i] > 0) {
      ctx.fillStyle = '#334155';
      ctx.font      = '600 12px "Source Sans 3", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(values[i], x + barW / 2, y - 4);
    }

    // Label abaixo da barra
    ctx.fillStyle = '#64748b';
    ctx.font      = '12px "Source Sans 3", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const maxChars = Math.max(6, Math.floor(barW / 5.5));
    const shortLbl = lbl.length > maxChars ? lbl.slice(0, maxChars) + '…' : lbl;
    ctx.fillText(shortLbl, x + barW / 2, padT + chartH + 14);
  });

  // Linha de base
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(padL - 4, padT + chartH);
  ctx.lineTo(W - padR, padT + chartH);
  ctx.stroke();
}

/**
 * Desenha um gráfico de rosca (donut) no canvas indicado.
 * @param {string}   canvasId
 * @param {string[]} labels
 * @param {number[]} values
 * @param {string[]} colors  — cores CSS
 */
function _drawPie(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth  || canvas.width;
  const H   = canvas.clientHeight || canvas.height;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font      = '14px "Source Sans 3", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sem dados', W / 2, H / 2);
    return;
  }

  const cx = W * 0.4;
  const cy = H / 2;
  const R  = Math.min(cx, cy) - 20;
  const Ri = R * 0.5; // raio interno (donut)

  let angle = -Math.PI / 2;
  values.forEach((v, i) => {
    if (v === 0) return;
    const slice = (v / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle   = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.stroke();
    angle += slice;
  });

  // Buraco central
  ctx.beginPath();
  ctx.arc(cx, cy, Ri, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Texto central: total
  ctx.fillStyle = '#334155';
  ctx.font      = '600 20px "Source Sans 3", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 3);
  ctx.fillStyle = '#64748b';
  ctx.font      = '12px "Source Sans 3", "Segoe UI", sans-serif';
  ctx.fillText('total', cx, cy + 16);

  // Legenda à direita
  const legendX = W * 0.76;
  let legendY   = cy - (labels.length * 16) / 2;
  labels.forEach((lbl, i) => {
    if (values[i] === 0) return;
    const pct = ((values[i] / total) * 100).toFixed(1);
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(legendX, legendY + 5, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.font      = '12px "Source Sans 3", "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    const maxChars = 22;
    const shortLbl = lbl.length > maxChars ? lbl.slice(0, maxChars) + '…' : lbl;
    ctx.fillText(`${shortLbl} (${pct}%)`, legendX + 10, legendY + 9);
    legendY += 18;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 4 — RENDER PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Renderiza o painel "Análise de Dados" no DOM.
 * Chamado ao trocar para a aba analytics ou ao carregar novo dataset.
 */
function _mesLabel(ym) {
  const [y, m] = String(ym).split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const i = Number(m) - 1;
  return `${nomes[i] || m}/${String(y).slice(2)}`;
}

function renderAnalytics() {
  const panel = document.getElementById('panel-analytics');
  if (!panel) return;

  const allData = State.allData;
  if (!allData || allData.length === 0) {
    panel.innerHTML = `
      <section class="dash-page">
        <div class="analytics-empty">
          <p class="geral-vazio-title">Nenhum dado ainda</p>
          <p>Sincronize a planilha na aba Análise para ver o dashboard.</p>
          <button type="button" class="btn-ir-analise" onclick="App.switchTab('analise')">Ir para Análise</button>
        </div>
      </section>`;
    return;
  }

  const recorte = _filtrarPorPeriodo(allData, _dashPeriodo, _dashDe, _dashAte);
  const data = recorte.rows;
  const d = _buildAnalyticsData(data);

  const fmt    = n => n.toLocaleString('pt-BR');
  const fmtBRL = v => v > 0
    ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
  const pctNum = (n, t) => t > 0 ? `${((n / t) * 100).toFixed(1)}%` : '—';
  const fmtData = iso => {
    if (!iso || iso.length < 10) return '';
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  };
  const periodoHint = recorte.range
    ? `Publicação de ${fmtData(recorte.range.de)} a ${fmtData(recorte.range.ate)} · ${data.length.toLocaleString('pt-BR')} de ${allData.length.toLocaleString('pt-BR')}`
    : `Todos os processos · ${allData.length.toLocaleString('pt-BR')}`;

  // Valor total estimado e valor sob avaliação obrigatória
  const valorTotal = data.reduce((acc, r) => {
    const v = r._valor_manual > 0 ? r._valor_manual : (r.valor_estimado || 0);
    return acc + v;
  }, 0);
  const valorObrig = data
    .filter(r => r._statusFinal === 'avaliacao-obrigatoria')
    .reduce((acc, r) => {
      const v = r._valor_manual > 0 ? r._valor_manual : (r.valor_estimado || 0);
      return acc + v;
    }, 0);

  panel.innerHTML = `
    <section class="dash-page">
      <div class="dash-header">
        <div class="dash-header-copy">
          <h2 class="dash-title">Dashboard</h2>
          <p class="dash-sub">Números da planilha por período de publicação. Clique em um card para abrir a lista.</p>
        </div>
        <button type="button" class="dash-header-btn" onclick="App.abrirFiltroAnalise('verificacao-humana')">
          Trabalhar pendentes
        </button>
      </div>

      <div class="dash-periodos">
        <p class="modal-kicker">Período</p>
        <div class="dash-period-btns" role="group" aria-label="Filtrar por período">
          ${DASH_PERIODOS.map(p => `
            <button type="button" class="dash-period-btn${_dashPeriodo === p.id ? ' is-active' : ''}"
              onclick="App.setDashPeriodo('${p.id}')">${p.label}</button>
          `).join('')}
        </div>
        ${_dashPeriodo === 'custom' ? `
        <div class="dash-period-custom">
          <label>De
            <input type="date" id="dashDe" value="${escapeHtml(_dashDe)}" onchange="App.setDashPeriodoCustom()">
          </label>
          <label>Até
            <input type="date" id="dashAte" value="${escapeHtml(_dashAte)}" onchange="App.setDashPeriodoCustom()">
          </label>
        </div>` : ''}
        <p class="dash-period-hint">${periodoHint}${recorte.semData ? ` · ${recorte.semData.toLocaleString('pt-BR')} sem data` : ''}</p>
      </div>

      ${d.verif > 0 ? `
      <div class="geral-fila dash-fila">
        <div>
          <p class="geral-fila-title"><strong>${fmt(d.verif)}</strong> em verificação pendente</p>
          <p class="geral-fila-sub">Valor sigiloso ou Art. 8º ainda sem confirmação.</p>
        </div>
        <button type="button" class="btn-ir-analise" onclick="App.abrirFiltroAnalise('verificacao-humana')">Abrir fila</button>
      </div>` : ''}

      ${d.total === 0 ? `
      <div class="analytics-empty">
        <p class="geral-vazio-title">Nenhum processo neste período</p>
        <p>Escolha outro recorte ou use personalizado.</p>
      </div>
      </section>` : `
      <p class="modal-kicker">Situação</p>
      <div class="an-kpi-grid">
        <button type="button" class="an-kpi-card an-kpi-total" onclick="App.abrirFiltroAnalise(null)">
          <p class="an-kpi-label">Processos</p>
          <strong class="an-kpi-value">${fmt(d.total)}</strong>
          <p class="an-kpi-sub">Todos os registros</p>
        </button>
        <button type="button" class="an-kpi-card an-kpi-obrig" onclick="App.abrirFiltroAnalise('avaliacao-obrigatoria')">
          <p class="an-kpi-label">Obrigatória</p>
          <strong class="an-kpi-value">${fmt(d.obrig)}</strong>
          <p class="an-kpi-sub">${pctNum(d.obrig, d.total)} do total</p>
        </button>
        <button type="button" class="an-kpi-card an-kpi-disp" onclick="App.abrirFiltroAnalise('dispensada')">
          <p class="an-kpi-label">Dispensada</p>
          <strong class="an-kpi-value">${fmt(d.dispensada)}</strong>
          <p class="an-kpi-sub">Art. 8º confirmado</p>
        </button>
        <button type="button" class="an-kpi-card an-kpi-verif" onclick="App.abrirFiltroAnalise('verificacao-humana')">
          <p class="an-kpi-label">Pendente</p>
          <strong class="an-kpi-value">${fmt(d.verif)}</strong>
          <p class="an-kpi-sub">Precisa do analista</p>
        </button>
        <button type="button" class="an-kpi-card an-kpi-art2" onclick="App.abrirFiltroAnalise('all-art2')">
          <p class="an-kpi-label">Art. 2º</p>
          <strong class="an-kpi-value">${fmt(d.enquadra)}</strong>
          <p class="an-kpi-sub">Enquadrados</p>
        </button>
        <button type="button" class="an-kpi-card an-kpi-sig" onclick="App.abrirFiltroAnalise('verificacao-humana')">
          <p class="an-kpi-label">Sigiloso</p>
          <strong class="an-kpi-value">${fmt(d.sigiloso)}</strong>
          <p class="an-kpi-sub">Sem valor na planilha</p>
        </button>
        <div class="an-kpi-card an-kpi-valor">
          <p class="an-kpi-label">Valor total</p>
          <strong class="an-kpi-value an-kpi-value--sm">${fmtBRL(valorTotal)}</strong>
          <p class="an-kpi-sub">Estimado na planilha</p>
        </div>
        <div class="an-kpi-card an-kpi-valor-obrig">
          <p class="an-kpi-label">Valor obrigatório</p>
          <strong class="an-kpi-value an-kpi-value--sm">${fmtBRL(valorObrig)}</strong>
          <p class="an-kpi-sub">Soma das obrigatórias</p>
        </div>
      </div>

    <!-- ── GRÁFICOS ROW 1 ─────────────────────────────────────────────── -->
    <div class="an-charts-row">
      <div class="an-chart-card">
        <div class="an-chart-title">Status dos processos</div>
        <canvas id="chartStatus" class="an-canvas"></canvas>
      </div>
      <div class="an-chart-card">
        <div class="an-chart-title">Incisos do Art. 2º</div>
        <canvas id="chartArt2" class="an-canvas"></canvas>
      </div>
    </div>

    <!-- ── GRÁFICOS ROW 2 ─────────────────────────────────────────────── -->
    <div class="an-charts-row">
      <div class="an-chart-card">
        <div class="an-chart-title">Faixa de valor</div>
        <canvas id="chartFaixa" class="an-canvas"></canvas>
      </div>
      <div class="an-chart-card">
        <div class="an-chart-title">Art. 8º — dispensa</div>
        <canvas id="chartArt8" class="an-canvas"></canvas>
      </div>
    </div>

    <!-- ── TABELAS: MODALIDADE + TIPO DE OBJETO ───────────────────────── -->
    <div class="an-tables-row">

      <div class="an-table-card">
        <p class="modal-kicker">Modalidade</p>
        <div class="an-table-wrap">
          <table class="an-table">
            <thead><tr><th>Modalidade</th><th>Qtd.</th><th>%</th></tr></thead>
            <tbody>
              ${Object.entries(d.modalMap)
                .sort((a, b) => b[1] - a[1])
                .map(([m, n]) => `
                <tr>
                  <td>${escapeHtml(m)}</td>
                  <td class="an-td-num">${fmt(n)}</td>
                  <td class="an-td-pct">
                    <div class="an-bar-mini">
                      <div class="an-bar-track">
                        <div class="an-bar-mini-fill" style="width:${d.total ? ((n / d.total) * 100).toFixed(1) : 0}%"></div>
                      </div>
                      <span>${pctNum(n, d.total)}</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="an-table-card">
        <p class="modal-kicker">Tipo de objeto</p>
        <div class="an-table-wrap">
          <table class="an-table">
            <thead><tr><th>Tipo</th><th>Qtd.</th><th>%</th></tr></thead>
            <tbody>
              ${Object.entries(d.tipoMap)
                .sort((a, b) => b[1] - a[1])
                .map(([t, n]) => `
                <tr>
                  <td>${escapeHtml(t)}</td>
                  <td class="an-td-num">${fmt(n)}</td>
                  <td class="an-td-pct">
                    <div class="an-bar-mini">
                      <div class="an-bar-track">
                        <div class="an-bar-mini-fill an-bar-mini-fill--green" style="width:${d.total ? ((n / d.total) * 100).toFixed(1) : 0}%"></div>
                      </div>
                      <span>${pctNum(n, d.total)}</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <p class="modal-kicker">Por período</p>
    <div class="an-tables-row">
      <div class="an-table-card">
        <p class="modal-kicker">Ano</p>
        <div class="an-table-wrap">
          <table class="an-table">
            <thead><tr><th>Ano</th><th>Qtd.</th><th>%</th></tr></thead>
            <tbody>
              ${(d.porAno.length ? d.porAno : [['—', 0]]).map(([y, n]) => `
              <tr>
                <td>${escapeHtml(String(y))}</td>
                <td class="an-td-num">${fmt(n)}</td>
                <td class="an-td-pct">
                  <div class="an-bar-mini">
                    <div class="an-bar-track">
                      <div class="an-bar-mini-fill" style="width:${d.total ? ((n / d.total) * 100).toFixed(1) : 0}%"></div>
                    </div>
                    <span>${pctNum(n, d.total)}</span>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="an-table-card">
        <p class="modal-kicker">Trimestre</p>
        <div class="an-table-wrap">
          <table class="an-table">
            <thead><tr><th>Trimestre</th><th>Qtd.</th><th>%</th></tr></thead>
            <tbody>
              ${(d.porTrimestre.length ? d.porTrimestre : [['—', 0]]).map(([t, n]) => `
              <tr>
                <td>${escapeHtml(String(t).replace('-T', ' · T'))}</td>
                <td class="an-td-num">${fmt(n)}</td>
                <td class="an-td-pct">
                  <div class="an-bar-mini">
                    <div class="an-bar-track">
                      <div class="an-bar-mini-fill an-bar-mini-fill--green" style="width:${d.total ? ((n / d.total) * 100).toFixed(1) : 0}%"></div>
                    </div>
                    <span>${pctNum(n, d.total)}</span>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    ${d.porMes.length > 0 ? `
    <div class="an-chart-card an-chart-card--wide">
      <div class="an-chart-title">Publicações por mês</div>
      <canvas id="chartMes" class="an-canvas"></canvas>
    </div>` : ''}

    ${d.topUasg.length > 0 ? `
    <p class="modal-kicker">Órgãos com mais enquadrados no Art. 2º</p>
    <div class="an-table-card an-table-card--full">
      <div class="an-table-wrap">
        <table class="an-table">
          <thead><tr><th>#</th><th>Órgão</th><th>Enquadrados</th><th>Participação</th></tr></thead>
          <tbody>
            ${d.topUasg.map(([u, n], i) => `
            <tr>
              <td class="an-td-rank">${i + 1}</td>
              <td>${escapeHtml(u)}</td>
              <td class="an-td-num">${fmt(n)}</td>
              <td class="an-td-pct">
                <div class="an-bar-mini">
                  <div class="an-bar-track">
                    <div class="an-bar-mini-fill an-bar-mini-fill--purple"
                         style="width:${((n / d.topUasg[0][1]) * 100).toFixed(1)}%"></div>
                  </div>
                  <span>${d.enquadra > 0 ? ((n / d.enquadra) * 100).toFixed(1) : '0.0'}% dos enquadrados</span>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
      </section>`}
  `;

  if (d.total === 0) return;

  const mesesChart = _dashPeriodo === 'todos' ? d.porMes.slice(-12) : d.porMes;

  // ── Desenhar gráficos após inserção no DOM ─────────────────────────────
  requestAnimationFrame(() => {
    _drawPie('chartStatus',
      ['Obrigatória', 'Dispensada', 'Pendente', 'Não enquadrado', 'Fora do Decreto'],
      [d.obrig, d.dispensada, d.verif, d.naoEnquad, d.naoEnquadArt1],
      ['#b84a42', '#0c7d73', '#e39361', '#64748b', '#0f9387']
    );

    _drawBar('chartArt2',
      ['Inciso I', 'Inciso II', '§ 1º', '§ 2º'],
      [d.artI, d.artII, d.artP1, d.artP2],
      ['#0f9387', '#8cc6b3', '#0c7d73', '#e39361']
    );

    _drawBar('chartFaixa',
      d.faixas.map(f => f.label),
      d.faixas.map(f => f.count),
      ['#0f9387', '#8cc6b3', '#0c7d73', '#e39361', '#94a3b8']
    );

    _drawBar('chartArt8',
      ['Pendente', 'Dispensado', 'Vigente', 'Aditivo', 'Sem data'],
      [d.art8_pend, d.art8_disp, d.art8_vig, d.art8_adit, d.art8_semdata],
      ['#e39361', '#0c7d73', '#b84a42', '#0f9387', '#64748b']
    );

    if (mesesChart.length) {
      _drawBar('chartMes',
        mesesChart.map(([ym]) => _mesLabel(ym)),
        mesesChart.map(([, n]) => n),
        mesesChart.map(() => '#0f9387')
      );
    }
  });
}
