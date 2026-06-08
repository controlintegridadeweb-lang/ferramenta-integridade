'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   LEITURA EM TEMPO REAL — Google Sheets (via BACK-END)
   ───────────────────────────────────────────────────────────────────────────
   O navegador NÃO conhece o link nem credenciais da planilha. Ele apenas pede
   ao servidor:  GET /api/sheets  → o servidor baixa o XLSX do Google Sheets
   (link guardado em server/.env) e devolve os bytes. O front reaproveita o
   pipeline de parse já existente (parseWorkbook em io.js).
   ═══════════════════════════════════════════════════════════════════════════ */

const Sheets = (() => {

  let _autoTimer = null;
  let _autoSeg   = 0;       // intervalo informado pelo back-end (/api/health)

  /* ── Carrega a planilha através do back-end ───────────────────────────────── */
  async function carregar({ silencioso = false } = {}) {
    if (!silencioso) showLoading();
    try {
      const resp = await fetch('/api/sheets');
      if (!resp.ok) {
        let msg = `Não foi possível ler a planilha (HTTP ${resp.status}).`;
        try { const j = await resp.json(); if (j && j.erro) msg = j.erro; } catch (_) {}
        throw new Error(msg);
      }
      const buf = await resp.arrayBuffer();
      await parseWorkbook(buf, 'Google Sheets (tempo real)');
    } catch (err) {
      console.error('[Sheets]', err);
      if (!silencioso) showToast(`Erro ao ler a planilha: ${err.message}`, 'error', 6000);
    } finally {
      if (!silencioso) hideLoading();
    }
  }

  /* ── Auto-refresh (intervalo definido pelo servidor) ──────────────────────── */
  function configurarAutoRefresh(segundos) {
    _autoSeg = Number(segundos) || 0;
  }

  function iniciarAutoRefresh() {
    pararAutoRefresh();
    if (_autoSeg > 0) {
      _autoTimer = setInterval(() => carregar({ silencioso: true }), _autoSeg * 1000);
    }
  }

  function pararAutoRefresh() {
    if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
  }

  return { carregar, configurarAutoRefresh, iniciarAutoRefresh, pararAutoRefresh };
})();

window.Sheets = Sheets;
