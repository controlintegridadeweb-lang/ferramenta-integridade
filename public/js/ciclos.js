'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   FLUXO OPERACIONAL POR CICLOS (cliente) — fala com /api/ciclos
   ───────────────────────────────────────────────────────────────────────────
   Eixo ORTOGONAL ao classificador de conformidade:
     - O classificador (classifier.js) diz se um registro é 'avaliacao-obrigatoria'.
     - Este módulo controla o CICLO DE VIDA desses obrigatórios:
         PENDENTE → EM_ANALISE → VALIDADO → FINALIZADO
     - Registros FINALIZADOS saem da fila e viram histórico permanente.

   Endpoints:
     POST /api/ciclos/sincronizar            → cadastra novos obrigatórios
     GET  /api/ciclos/status                 → { uid: {status, ...} }
     GET  /api/ciclos/fila                   → não-finalizados
     GET  /api/ciclos/dashboard              → contagens + último relatório
     POST /api/ciclos/analises/:uid/transicao→ muda status
     POST /api/ciclos/relatorios             → gera relatório (lote fechado)
     GET  /api/ciclos/relatorios[/:id]       → histórico
   ═══════════════════════════════════════════════════════════════════════════ */

const Ciclos = (() => {

  let _ativo = false;            // back-end com persistência?
  let _statusCache = {};         // uid -> { status, ... } da última sincronização

  function ativo() { return _ativo; }
  function statusDe(uid) { return _statusCache[uid] ? _statusCache[uid].status : null; }
  function cache() { return _statusCache; }

  async function init(persistenciaAtiva) {
    _ativo = !!persistenciaAtiva;
    return _ativo;
  }

  /* ── Sincroniza os obrigatórios da planilha já carregada ─────────────────── */
  async function sincronizar(data) {
    if (!_ativo) return { inseridos: 0, recebidos: 0 };
    const registros = data
      .filter(r => r._statusFinal === 'avaliacao-obrigatoria' && r._uid)
      .map(r => ({
        uid: r._uid,
        processo: r.processo || r.numero_ano_edital || r._uid,
        snapshot: _snapshot(r),
      }));

    const r = await _post('/api/ciclos/sincronizar', { registros });
    await atualizarStatus();
    return r;
  }

  function _snapshot(row) {
    // Cópia enxuta e estável para auditoria (sem campos internos volumosos).
    const s = {};
    ['processo', 'numero_ano_edital', 'codigoUasg', 'nome_Uasg', 'objeto',
     'modalidade', 'valor_estimado', '_statusFinal',
     '_valor_manual', '_validacao_art8', '_observacao_manual'].forEach(k => {
      if (row[k] !== undefined) s[k] = row[k];
    });
    return s;
  }

  /* ── Atualiza o cache de status por uid ──────────────────────────────────── */
  async function atualizarStatus() {
    if (!_ativo) { _statusCache = {}; return _statusCache; }
    try {
      _statusCache = await _get('/api/ciclos/status');
    } catch (e) {
      console.error('[Ciclos] Falha ao obter status:', e.message || e);
      _statusCache = {};
    }
    return _statusCache;
  }

  async function dashboard() {
    if (!_ativo) return null;
    return _get('/api/ciclos/dashboard');
  }

  /* ── Transição de status de um registro ──────────────────────────────────── */
  async function transicionar(uid, novoStatus) {
    if (!_ativo) return null;
    const r = await _post(`/api/ciclos/analises/${encodeURIComponent(uid)}/transicao`, { status: novoStatus });
    if (_statusCache[uid]) _statusCache[uid].status = r.status;
    else _statusCache[uid] = { uid, status: r.status };
    return r;
  }

  /* ── Geração de relatório: envia uids + HTML; o servidor renderiza o PDF ─── */
  async function gerarRelatorio(uids, html) {
    if (!_ativo) throw new Error('Persistência indisponível.');
    const r = await _post('/api/ciclos/relatorios', { uids, html });
    await atualizarStatus();
    return r.relatorio;
  }

  /* ── Regenera o PDF de um relatório existente (sem reabrir o ciclo) ──────── */
  async function regerarPdf(id, html) {
    if (!_ativo) throw new Error('Persistência indisponível.');
    const r = await _post(`/api/ciclos/relatorios/${id}/pdf`, { html });
    return r.relatorio;
  }

  async function listarRelatorios() {
    if (!_ativo) return [];
    return _get('/api/ciclos/relatorios');
  }

  async function obterRelatorio(id) {
    if (!_ativo) return null;
    return _get(`/api/ciclos/relatorios/${id}`);
  }

  /* ── HTTP helpers (com auth do Supa, quando exigida) ─────────────────────── */
  async function _get(url) {
    const resp = await fetch(url, { headers: await _authHeaders() });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  async function _post(url, body) {
    let resp = await fetch(url, { method: 'POST', headers: await _authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (resp.status === 401 && window.Auth && Auth.precisaAuth && Auth.precisaAuth()) {
      const renovado = await Auth.renovarSessao();
      if (!renovado) {
        Auth.invalidarToken();
        const ok = await Auth.garantirLogin();
        if (ok) resp = await fetch(url, { method: 'POST', headers: await _authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      } else {
        resp = await fetch(url, { method: 'POST', headers: await _authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      }
    }
    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try { const j = await resp.json(); if (j && j.erro) msg = j.erro; } catch (_) {}
      const e = new Error(msg); e.status = resp.status; throw e;
    }
    return resp.json();
  }

  async function _authHeaders(base) {
    const h = Object.assign({}, base || {});
    // FONTE ÚNICA: token sempre obtido de window.Auth (mesma origem do resto do app).
    const tok = window.Auth ? await window.Auth.getToken() : null;
    if (tok) h['Authorization'] = `Bearer ${tok}`;
    return h;
  }

  return {
    init, ativo, sincronizar, atualizarStatus, statusDe, cache,
    dashboard, transicionar, gerarRelatorio, regerarPdf, listarRelatorios, obterRelatorio,
    renderDashboard, gerarRelatorioFluxo, finalizarRegistroFluxo,
    renderHistorico, abrirRelatorio, regerarPdfFluxo,
  };

  /* ═════════════════════════════════════════════════════════════════════════
     UI — Dashboard de ciclos
     ═══════════════════════════════════════════════════════════════════════ */
  async function renderDashboard() {
    const sec   = document.getElementById('ciclosDashboard'); // cards (aba Geral)
    const acoes = document.getElementById('analiseAcoes');     // botão Gerar (aba Análise)
    const vazio = document.getElementById('geralVazio');       // estado vazio (aba Geral)
    if (!sec) return;

    const mostrar = (visivel) => {
      sec.hidden = !visivel;
      if (acoes) acoes.hidden = !visivel;
      if (vazio) vazio.hidden = visivel;
    };

    if (!_ativo) { mostrar(false); return; }

    await atualizarStatus();
    const d = await dashboard();
    if (!d) { mostrar(false); return; }
    mostrar(true);

    /* Contagens da fila alinhadas à planilha ATUAL: só obrigatórios ativos.
       O dashboard do servidor conta todo registro PENDENTE no banco — inclusive
       os que deixaram de ser obrigatórios após reclassificação ou correção de dados. */
    const alinhado = _dashboardAlinhadoComPlanilha(d);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cicloPendentes', alinhado.pendentes);
    set('cicloEmAnalise', alinhado.emAnalise);
    set('cicloValidados', alinhado.validados);
    set('cicloFinalizados', d.finalizados);
    set('btnGerarCount', alinhado.validados);

    const btn = document.getElementById('btnGerarRelatorio');
    if (btn) btn.disabled = alinhado.validados === 0;

    if (d.ultimoRelatorio) {
      const r = d.ultimoRelatorio;
      set('cicloUltimoNum', '#' + String(r.numero).padStart(3, '0'));
      const dt = r.gerado_em ? new Date(r.gerado_em).toLocaleDateString('pt-BR') : '';
      set('cicloUltimoInfo', `${dt} · ${r.total_registros} registro(s)`);
    } else {
      set('cicloUltimoNum', '—');
      set('cicloUltimoInfo', 'nenhum gerado ainda');
    }
  }

  /** Recalcula pendentes/em análise/validados cruzando banco × classificação atual. */
  function _dashboardAlinhadoComPlanilha(d) {
    const base = { pendentes: 0, emAnalise: 0, validados: 0 };
    const data = (typeof State !== 'undefined' && State.allData) ? State.allData : [];
    if (!data.length) return Object.assign(base, d);

    data.forEach(r => {
      if (!r || !r._uid || r._statusFinal !== 'avaliacao-obrigatoria') return;
      const st = _statusCache[r._uid] && _statusCache[r._uid].status;
      if (st === 'PENDENTE') base.pendentes++;
      else if (st === 'EM_ANALISE') base.emAnalise++;
      else if (st === 'VALIDADO') base.validados++;
    });
    return base;
  }

  /* ═════════════════════════════════════════════════════════════════════════
     UI — Geração de relatório (encerra o ciclo)
     ───────────────────────────────────────────────────────────────────────
     1. Coleta os uids VALIDADO. 2. Monta o HTML do relatório (mesmo builder da
     impressão). 3. Envia uids + HTML; o back-end renderiza o PDF (Chrome
     headless) e finaliza o lote.
     ═══════════════════════════════════════════════════════════════════════ */
  async function gerarRelatorioFluxo() {
    if (!_ativo) { _toast('Persistência indisponível.', 'error'); return; }

    await atualizarStatus();
    const validados = Object.values(_statusCache).filter(a => a.status === 'VALIDADO').map(a => a.uid);
    if (validados.length === 0) {
      _toast('Nenhum registro validado para incluir no relatório.', 'info', 5000);
      return;
    }

    const setVal = new Set(validados);
    const linhas = (State.allData || []).filter(r => setVal.has(r._uid));

    if (typeof showLoading === 'function') showLoading('Gerando relatório PDF…');
    try {
      const html = _montarHtmlRelatorio(linhas);
      const rel = await gerarRelatorio(validados, html);
      if (typeof hideLoading === 'function') hideLoading();

      _toast(`Relatório #${String(rel.numero).padStart(3, '0')} gerado com ${rel.total_registros} registro(s). Ciclo encerrado.`, 'success', 7000);
      if (rel._avisoPdf) _toast(rel._avisoPdf, 'error', 9000);

      // Atualiza painel e tabela (finalizados saem da fila).
      await renderDashboard();
      if (typeof applyFilters === 'function') applyFilters();
      if (typeof _updateAllStats === 'function') _updateAllStats();

      // Baixa o PDF imediatamente para o analista.
      if (rel.pdf_url) window.open(rel.pdf_url, '_blank');
    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      _toast(`Falha ao gerar relatório: ${e.message || e}`, 'error', 6000);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════════
     UI — Finalização de UM registro (relatório de lote com um único uid)
     ───────────────────────────────────────────────────────────────────────
     Reaproveita exatamente gerarRelatorio(uids, html): o back-end finaliza só os
     uids VALIDADO informados. Aqui informamos um único uid. Mesma numeração,
     PDF e imutabilidade do lote — sem caminho paralelo de finalização.
     ═══════════════════════════════════════════════════════════════════════ */
  async function finalizarRegistroFluxo(uid) {
    if (!_ativo) { _toast('Persistência indisponível.', 'error'); return; }
    if (!uid) return;

    await atualizarStatus();
    if (statusDe(uid) !== 'VALIDADO') {
      _toast('Só é possível finalizar um registro que esteja validado.', 'info', 5000);
      return;
    }

    const linha = (State.allData || []).filter(r => r._uid === uid);
    if (linha.length === 0) { _toast('Registro não encontrado na planilha atual.', 'error'); return; }

    if (typeof showLoading === 'function') showLoading('Finalizando registro e gerando PDF…');
    try {
      const html = _montarHtmlRelatorio(linha);
      const rel = await gerarRelatorio([uid], html);
      if (typeof hideLoading === 'function') hideLoading();

      _toast(`Registro finalizado no relatório #${String(rel.numero).padStart(3, '0')}.`, 'success', 6000);
      if (rel._avisoPdf) _toast(rel._avisoPdf, 'error', 9000);

      if (typeof closeModal === 'function') closeModal();
      await renderDashboard();
      if (typeof applyFilters === 'function') applyFilters();
      if (typeof _updateAllStats === 'function') _updateAllStats();

      if (rel.pdf_url) window.open(rel.pdf_url, '_blank');
    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      _toast(`Falha ao finalizar registro: ${e.message || e}`, 'error', 6000);
    }
  }

  /* Monta o HTML completo do relatório (mesmo builder da impressão nativa).
     O PDF é renderizado no SERVIDOR (Chrome headless), que honra o CSS
     @page/@media print — paginação e layout fiéis, texto vetorial. */
  function _montarHtmlRelatorio(linhas) {
    if (typeof _buildPdfHtml !== 'function') {
      throw new Error('Gerador de relatório indisponível.');
    }
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    return _buildPdfHtml(linhas, hoje);
  }

  /* ═════════════════════════════════════════════════════════════════════════
     UI — Histórico de relatórios
     ═══════════════════════════════════════════════════════════════════════ */
  async function renderHistorico() {
    const cont = document.getElementById('historicoLista');
    if (!cont) return;
    if (!_ativo) {
      cont.innerHTML = '<div class="info-empty"><p>Persistência não configurada — sem histórico.</p></div>';
      return;
    }
    cont.innerHTML = '<div class="info-empty"><p>Carregando histórico…</p></div>';

    let rels;
    try { rels = await listarRelatorios(); }
    catch (e) { cont.innerHTML = `<div class="info-empty"><p>Erro ao carregar: ${e.message}</p></div>`; return; }

    if (!rels.length) {
      cont.innerHTML =
        '<div class="info-empty">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>' +
        '<p>Nenhum relatório validado foi gerado até o momento.</p>' +
        '</div>';
      return;
    }

    cont.innerHTML = rels.map(r => {
      const num = '#' + String(r.numero).padStart(3, '0');
      const dt = r.gerado_em ? new Date(r.gerado_em).toLocaleString('pt-BR') : '—';
      const pdf = r.pdf_url
        ? `<a class="hist-pdf" href="${r.pdf_url}" target="_blank" rel="noopener">Baixar PDF</a>`
        : '<span class="hist-pdf hist-pdf--off" title="O PDF não foi armazenado quando este relatório foi gerado (ex.: bucket ausente no Supabase Storage)">PDF indisponível</span>';
      return `
        <div class="hist-card">
          <div class="hist-card-main" onclick="App.abrirRelatorio(${r.id})">
            <span class="hist-num">${num}</span>
            <span class="hist-meta">${dt}</span>
            <span class="hist-meta">Analista: ${_esc(r.gerado_por || '—')}</span>
            <span class="hist-meta">${r.total_registros} registro(s)</span>
            <span class="hist-status">Ciclo fechado</span>
          </div>
          <div class="hist-card-acoes">
            <button type="button" class="hist-ver" onclick="App.abrirRelatorio(${r.id})">Ver detalhes</button>
            <button type="button" class="hist-ver" onclick="App.regerarPdfRelatorio(${r.id})" title="Renderiza novamente o PDF no servidor a partir dos dados deste relatório">Regerar PDF</button>
            ${pdf}
          </div>
        </div>
        <div class="hist-detalhe" id="histDet-${r.id}" hidden></div>
      `;
    }).join('');
  }

  async function abrirRelatorio(id) {
    const det = document.getElementById('histDet-' + id);
    if (!det) return;
    if (!det.hidden) { det.hidden = true; det.innerHTML = ''; return; }

    det.hidden = false;
    det.innerHTML = '<p class="hist-loading">Carregando registros…</p>';
    try {
      const { relatorio, registros } = await obterRelatorio(id);
      const rel = relatorio || {};
      const num = '#' + String(rel.numero != null ? rel.numero : '').padStart(3, '0');
      const dt = rel.gerado_em ? new Date(rel.gerado_em).toLocaleString('pt-BR') : '—';
      const total = (rel.total_registros != null) ? rel.total_registros : registros.length;

      // ── Dados gerais do relatório ──────────────────────────────────────────
      const resumo = `
        <div class="hist-det-resumo">
          <div class="hist-det-item"><span class="hist-det-rotulo">Relatório</span><span class="hist-det-valor">${num}</span></div>
          <div class="hist-det-item"><span class="hist-det-rotulo">Data de geração</span><span class="hist-det-valor">${dt}</span></div>
          <div class="hist-det-item"><span class="hist-det-rotulo">Analista responsável</span><span class="hist-det-valor">${_esc(rel.gerado_por || '—')}</span></div>
          <div class="hist-det-item"><span class="hist-det-rotulo">Total de registros</span><span class="hist-det-valor">${total}</span></div>
        </div>`;

      // ── Lista dos registros incluídos no relatório ─────────────────────────
      const linhas = registros.map(reg => {
        const s = reg.snapshot || {};
        const obs = s._observacao_manual ? _esc(s._observacao_manual) : '<span class="hist-vazio">—</span>';
        return `<tr>
          <td>${_esc(s.processo || reg.uid)}</td>
          <td>${_esc(s.numero_ano_edital || '—')}</td>
          <td>${_esc(s.nome_Uasg || '—')}</td>
          <td>${obs}</td>
          <td><span class="hist-badge-final">FINALIZADO</span></td>
        </tr>`;
      }).join('');

      det.innerHTML = `
        ${resumo}
        <div class="hist-det-titulo">Registros incluídos</div>
        <table class="hist-tabela">
          <thead><tr><th>Processo</th><th>Edital</th><th>UASG</th><th>Observação</th><th>Status final</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>`;
    } catch (e) {
      det.innerHTML = `<p class="hist-loading">Erro: ${e.message}</p>`;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════════
     UI — Regerar o PDF de um relatório existente
     ───────────────────────────────────────────────────────────────────────
     Reconstrói o HTML a partir dos registros do relatório. Prefere a linha
     ATUAL da planilha (campos completos do classificador); se o registro não
     estiver na planilha carregada, usa o snapshot guardado no relatório.
     ═══════════════════════════════════════════════════════════════════════ */
  async function regerarPdfFluxo(id) {
    if (!_ativo) { _toast('Persistência indisponível.', 'error'); return; }

    if (typeof showLoading === 'function') showLoading('Regerando PDF do relatório…');
    try {
      const { registros } = await obterRelatorio(id);
      if (!registros || !registros.length) {
        if (typeof hideLoading === 'function') hideLoading();
        _toast('Relatório sem registros para regenerar.', 'info', 5000);
        return;
      }

      const porUid = {};
      (State.allData || []).forEach(r => { if (r._uid) porUid[r._uid] = r; });
      const linhas = registros.map(reg => porUid[reg.uid] || reg.snapshot || {});

      const html = _montarHtmlRelatorio(linhas);
      const rel = await regerarPdf(id, html);
      if (typeof hideLoading === 'function') hideLoading();

      if (rel._avisoPdf) { _toast(rel._avisoPdf, 'error', 9000); return; }

      _toast(`PDF do relatório #${String(rel.numero).padStart(3, '0')} regenerado.`, 'success', 6000);
      await renderHistorico();
      if (rel.pdf_url) window.open(rel.pdf_url, '_blank');
    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      _toast(`Falha ao regerar PDF: ${e.message || e}`, 'error', 6000);
    }
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function _toast(msg, tipo, ms) {
    if (typeof showToast === 'function') showToast(msg, tipo || 'info', ms || 4000);
    else console.log('[Ciclos]', msg);
  }
})();

window.Ciclos = Ciclos;
