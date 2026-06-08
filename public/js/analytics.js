'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1 — CONTROLE DE ABAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ativa uma aba de navegação e exibe o painel correspondente.
 * Atualiza classes CSS e atributos ARIA (aria-selected) para acessibilidade.
 * @param {string} tabName — 'geral' | 'analise' | 'historico'
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

  // Render do histórico de relatórios quando a aba é ativada
  if (tabName === 'historico') {
    try {
      if (window.Ciclos) Ciclos.renderHistorico();
    } catch (err) {
      console.error('[switchTab] Erro em renderHistorico:', err);
    }
  }
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

  return {
    total, enquadra, naoEnquad, naoEnquadArt1, dispensada, obrig, verif, sigiloso,
    artI, artII, artP1, artP2,
    art8_pend, art8_disp, art8_vig, art8_adit, art8_semdata,
    modalMap, tipoMap, faixas, topUasg,
  };
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
      ctx.font      = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(values[i], x + barW / 2, y - 4);
    }

    // Label abaixo da barra
    ctx.fillStyle = '#64748b';
    ctx.font      = '10px Inter, system-ui, sans-serif';
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
    ctx.font      = '13px Inter, system-ui, sans-serif';
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
  ctx.font      = 'bold 18px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 3);
  ctx.fillStyle = '#64748b';
  ctx.font      = '10px Inter, system-ui, sans-serif';
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
    ctx.font      = '10.5px Inter, system-ui, sans-serif';
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
function renderAnalytics() {
  const panel = document.getElementById('panel-analytics');
  if (!panel) return;

  const data = State.allData;
  if (!data || data.length === 0) {
    panel.innerHTML = `
      <div class="analytics-empty">
        <div class="analytics-empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6"  y1="20" x2="6"  y2="14"/>
          </svg>
        </div>
        <h3>Nenhum dado carregado</h3>
        <p>Carregue uma planilha na aba <strong>Análise de Conformidade</strong> para visualizar o painel analítico.</p>
      </div>`;
    return;
  }

  const d = _buildAnalyticsData(data);

  const fmt    = n => n.toLocaleString('pt-BR');
  const fmtBRL = v => v > 0
    ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
  const pct    = (n, t) => t > 0
    ? ` <span class="an-pct">${((n / t) * 100).toFixed(1)}%</span>` : '';

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

    <!-- ── CARDS KPI ─────────────────────────────────────────────────── -->
    <div class="an-section-title">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
      Indicadores Gerais
    </div>
    <div class="an-kpi-grid">
      <div class="an-kpi-card an-kpi-total">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Total de Processos</p>
          <strong class="an-kpi-value">${fmt(d.total)}</strong>
          <p class="an-kpi-sub">Registros na planilha</p>
        </div>
      </div>

      <div class="an-kpi-card an-kpi-obrig">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Avaliação Obrigatória</p>
          <strong class="an-kpi-value">${fmt(d.obrig)}</strong>
          <p class="an-kpi-sub">Enquadrados Art. 2º — não dispensados${pct(d.obrig, d.total)}</p>
        </div>
      </div>

      <div class="an-kpi-card an-kpi-disp">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Dispensados Art. 8º</p>
          <strong class="an-kpi-value">${fmt(d.dispensada)}</strong>
          <p class="an-kpi-sub">Analista confirmou evento anterior${pct(d.dispensada, d.total)}</p>
        </div>
      </div>

      <div class="an-kpi-card an-kpi-verif">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Verificação Pendente</p>
          <strong class="an-kpi-value">${fmt(d.verif)}</strong>
          <p class="an-kpi-sub">Pendentes / dados incompletos${pct(d.verif, d.total)}</p>
        </div>
      </div>

      <div class="an-kpi-card an-kpi-art2">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Enquadrados Art. 2º</p>
          <strong class="an-kpi-value">${fmt(d.enquadra)}</strong>
          <p class="an-kpi-sub">Atendem critérios de valor/modalidade${pct(d.enquadra, d.total)}</p>
        </div>
      </div>

      <div class="an-kpi-card an-kpi-sig">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Orçamento Sigiloso</p>
          <strong class="an-kpi-value">${fmt(d.sigiloso)}</strong>
          <p class="an-kpi-sub">Valor não informado na planilha${pct(d.sigiloso, d.total)}</p>
        </div>
      </div>

      <div class="an-kpi-card an-kpi-valor">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Valor Total Estimado</p>
          <strong class="an-kpi-value an-kpi-value--sm">${fmtBRL(valorTotal)}</strong>
          <p class="an-kpi-sub">Soma dos valores estimados</p>
        </div>
      </div>

      <div class="an-kpi-card an-kpi-valor-obrig">
        <div class="an-kpi-body">
          <p class="an-kpi-label">Valor sob Avaliação</p>
          <strong class="an-kpi-value an-kpi-value--sm">${fmtBRL(valorObrig)}</strong>
          <p class="an-kpi-sub">Soma dos processos obrigatórios</p>
        </div>
      </div>
    </div>

    <!-- ── GRÁFICOS ROW 1 ─────────────────────────────────────────────── -->
    <div class="an-charts-row">
      <div class="an-chart-card">
        <div class="an-chart-title">Status Final dos Processos</div>
        <canvas id="chartStatus" class="an-canvas"></canvas>
      </div>
      <div class="an-chart-card">
        <div class="an-chart-title">Enquadramento por Inciso do Art. 2º</div>
        <canvas id="chartArt2" class="an-canvas"></canvas>
      </div>
    </div>

    <!-- ── GRÁFICOS ROW 2 ─────────────────────────────────────────────── -->
    <div class="an-charts-row">
      <div class="an-chart-card">
        <div class="an-chart-title">Distribuição por Faixa de Valor</div>
        <canvas id="chartFaixa" class="an-canvas"></canvas>
      </div>
      <div class="an-chart-card">
        <div class="an-chart-title">Situação do Art. 8º (Dispensa)</div>
        <canvas id="chartArt8" class="an-canvas"></canvas>
      </div>
    </div>

    <!-- ── TABELAS: MODALIDADE + TIPO DE OBJETO ───────────────────────── -->
    <div class="an-tables-row">

      <div class="an-table-card">
        <div class="an-section-title an-section-title--sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/>
          </svg>
          Distribuição por Modalidade
        </div>
        <div class="an-table-wrap">
          <table class="an-table">
            <thead><tr><th>Modalidade</th><th>Qtd</th><th>%</th></tr></thead>
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
                        <div class="an-bar-mini-fill" style="width:${((n / d.total) * 100).toFixed(1)}%"></div>
                      </div>
                      <span>${((n / d.total) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="an-table-card">
        <div class="an-section-title an-section-title--sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/>
          </svg>
          Distribuição por Tipo de Objeto
        </div>
        <div class="an-table-wrap">
          <table class="an-table">
            <thead><tr><th>Tipo de Objeto</th><th>Qtd</th><th>%</th></tr></thead>
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
                        <div class="an-bar-mini-fill an-bar-mini-fill--green" style="width:${((n / d.total) * 100).toFixed(1)}%"></div>
                      </div>
                      <span>${((n / d.total) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- ── TOP UASGs ──────────────────────────────────────────────────── -->
    ${d.topUasg.length > 0 ? `
    <div class="an-section-title">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
      Top ${d.topUasg.length} Órgãos — Processos Enquadrados no Art. 2º
    </div>
    <div class="an-table-card an-table-card--full">
      <div class="an-table-wrap">
        <table class="an-table">
          <thead><tr><th>#</th><th>Órgão (UASG)</th><th>Processos Enquadrados</th><th>Participação</th></tr></thead>
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

  `;

  // ── Desenhar gráficos após inserção no DOM ─────────────────────────────
  requestAnimationFrame(() => {
    _drawPie('chartStatus',
      ['Avaliação Obrigatória', 'Dispensada', 'Verificação Pendente', 'Não Enquadrado', 'Excluído Art. 1º'],
      [d.obrig, d.dispensada, d.verif, d.naoEnquad, d.naoEnquadArt1],
      ['#dc2626', '#16a34a', '#e39361', '#64748b', '#0f9387']
    );

    _drawBar('chartArt2',
      ['Art. 2º I\n(Obras/Eng.)', 'Art. 2º II\n(Serv./Compras)', 'Art. 2º §1\n(Especiais)', 'Art. 2º §2\n(Modalidade)'],
      [d.artI, d.artII, d.artP1, d.artP2],
      ['#0f9387', '#8cc6b3', '#0c7d73', '#e39361']
    );

    _drawBar('chartFaixa',
      d.faixas.map(f => f.label),
      d.faixas.map(f => f.count),
      ['#0f9387', '#8cc6b3', '#0c7d73', '#e39361', '#94a3b8']
    );

    _drawBar('chartArt8',
      ['Pend. Valid.', 'Dispensado', 'Vigente', 'Aditivo', 'Sem Data'],
      [d.art8_pend, d.art8_disp, d.art8_vig, d.art8_adit, d.art8_semdata],
      ['#e39361', '#16a34a', '#dc2626', '#0f9387', '#64748b']
    );
  });
}
