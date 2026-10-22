'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   PERSISTÊNCIA (cliente) — fala com o BACK-END, nunca com o Supabase
   ───────────────────────────────────────────────────────────────────────────
   IMPORTANTE: este arquivo roda no NAVEGADOR e por isso NÃO contém nenhuma
   credencial. A URL do Supabase e a key ficam exclusivamente no servidor
   (server/.env). O front apenas chama endpoints neutros:

     GET    /api/anotacoes          → todas as anotações { uid: dados }
     PUT    /api/anotacoes/:uid     → grava as anotações de uma linha
     DELETE /api/anotacoes/:uid     → remove as anotações de uma linha

   A interface pública (Supa.*) é a mesma da versão anterior, então io.js e
   handlers.js não precisam de alteração.
   ═══════════════════════════════════════════════════════════════════════════ */

const Supa = (() => {

  let _ready = false;       // back-end respondendo?
  let _authNecessaria = false;  // back-end exige token para escrever?
  const _saveTimers = {};   // debounce por _uid

  /* Token e sessão NÃO vivem mais aqui. A fonte oficial é window.Auth. Este
     módulo apenas chama Auth.getToken()/Auth.garantirLogin(). Isso elimina a
     duplicidade que existia entre Supa._token e a sessão do Supabase. */

  const CAMPOS_ANALISTA = [
    '_valor_manual',
    '_validacao_art8',
    '_data_referencia_manual',
    '_contrato_assinado',
    '_observacao_manual',
    '_avaliacao_obrig_dados',
    '_concluido',
    '_concluido_em',
  ];

  /* ── Chave estável por linha (idêntica à lógica anterior) ───────────────── */
  function norm(s) {
    return String(s ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function makeUid(row) {
    const parts = [norm(row.processo), norm(row.numero_ano_edital), norm(row.codigoUasg)].filter(Boolean);
    if (parts.length === 0) {
      return 'row:' + _hash(JSON.stringify({ o: norm(row.objeto), m: norm(row.modalidade), v: row.valor_estimado }));
    }
    return parts.join('|');
  }

  function _hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     INICIALIZAÇÃO — verifica se o back-end tem persistência ativa
     ───────────────────────────────────────────────────────────────────────── */
  async function init() {
    try {
      const resp = await fetch(apiUrl('/api/health'));
      if (!resp.ok) throw new Error('health falhou');
      const j = await resp.json();
      _ready = !!j.persistencia;
      _authNecessaria = !!j.auth;
      if (_ready) console.info('[Supa] Back-end conectado — persistência ativa.');
      else console.warn('[Supa] Back-end no ar, mas Supabase não configurado (server/.env).');
      if (_authNecessaria) console.info('[Supa] Autenticação exigida para gravar.');
    } catch (e) {
      _ready = false;
      console.warn('[Supa] Back-end indisponível — persistência desativada.', e.message || e);
    }
    return _ready;
  }

  function isReady() { return _ready; }
  function precisaAuth() { return _authNecessaria; }
  function estaAutenticado() { return !!(window.Auth && window.Auth.estaLogado()); }

  /* ── Autenticação: delegada a window.Auth (fonte única) ───────────────────
     Mantemos a assinatura pública (Supa.login/logout/etc.) para não quebrar os
     chamadores, mas internamente tudo passa por window.Auth. */
  async function login(usuario, senha) {
    if (!window.Auth) throw new Error('Módulo de autenticação indisponível.');
    return window.Auth.login(usuario, senha);
  }

  function logout() { if (window.Auth) window.Auth.logout(); }

  function usuarioAtual() { return window.Auth ? window.Auth.usuarioAtual() : null; }

  function tokenAtual() { return window.Auth ? window.Auth.tokenAtual() : null; }

  async function garantirLogin() {
    return window.Auth ? window.Auth.garantirLogin() : false;
  }

  /* Cabeçalhos de autenticação — SEMPRE via Auth.getToken() (token fresco).
     Uma única origem para qualquer modo (Supabase ou legado). */
  async function _authHeaders(base) {
    const h = Object.assign({}, base || {});
    const t = window.Auth ? await window.Auth.getToken() : null;
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  /* ── Leitura: todas as anotações de uma vez ──────────────────────────────── */
  async function carregarTodas() {
    if (!_ready) return {};
    try {
      const resp = await fetch(apiUrl('/api/anotacoes'), { headers: await _authHeaders() });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const j = await resp.json();   // { uid: dados, ..., _versoes: {...} }
      if (j && typeof j === 'object') delete j._versoes;  // metadado, não é anotação
      return j;
    } catch (e) {
      console.error('[Supa] Erro ao carregar anotações:', e.message || e);
      return {};
    }
  }

  /* ── Reidratação (idêntica à versão anterior) ────────────────────────────── */
  function reidratar(data, mapa) {
    if (!mapa) return 0;
    let aplicadas = 0;
    data.forEach(row => {
      if (!row._uid) row._uid = makeUid(row);
      const dados = mapa[row._uid];
      if (!dados) return;
      CAMPOS_ANALISTA.forEach(campo => {
        if (dados[campo] !== undefined && dados[campo] !== null) row[campo] = dados[campo];
      });
      aplicadas++;
    });
    return aplicadas;
  }

  /* ── Gravação (debounced) via API ────────────────────────────────────────── */
  function _extrairDados(row) {
    const dados = {};
    CAMPOS_ANALISTA.forEach(campo => { if (row[campo] !== undefined) dados[campo] = row[campo]; });
    return dados;
  }

  function salvarLinha(row, { imediato = false } = {}) {
    if (!_ready || !row) return;
    if (!row._uid) row._uid = makeUid(row);

    const exec = async () => {
      const dados = _extrairDados(row);
      const vazio = Object.keys(dados).length === 0;
      const uid   = encodeURIComponent(row._uid);

      if (_authNecessaria && !(window.Auth && window.Auth.estaLogado())) {
        const ok = await garantirLogin();
        if (!ok) {
          if (typeof showToast === 'function') showToast('Login necessário para salvar.', 'error', 4000);
          return;
        }
      }

      const fazer = async () => {
        if (vazio) {
          return fetch(apiUrl(`/api/anotacoes/${uid}`), { method: 'DELETE', headers: await _authHeaders() });
        }
        return fetch(apiUrl(`/api/anotacoes/${uid}`), {
          method:  'PUT',
          headers: await _authHeaders({ 'Content-Type': 'application/json' }),
          body:    JSON.stringify({ dados }),
        });
      };

      try {
        let resp = await fazer();
        // Token expirado/ausente → tenta relogar uma vez e repete.
        if (resp.status === 401 && _authNecessaria && window.Auth) {
          const renovado = await window.Auth.renovarSessao();
          if (!renovado) {
            window.Auth.invalidarToken();
            const ok = await garantirLogin();
            if (ok) resp = await fazer();
          } else {
            resp = await fazer();
          }
        }
        if (resp.status === 409) {
          if (typeof showToast === 'function') {
            showToast('Esta anotação foi alterada por outro usuário. Recarregue os dados.', 'error', 5000);
          }
          return;
        }
        if (!resp.ok) {
          const err = new Error(`HTTP ${resp.status}`);
          err.status = resp.status;
          throw err;
        }
      } catch (e) {
        console.error('[Supa] Falha ao salvar anotação:', e.message || e);
        if (typeof showToast === 'function') {
          const msg = e.status === 401
            ? 'Sessão expirada. Faça login novamente para salvar.'
            : 'Não foi possível salvar a anotação. Verifique a conexão.';
          showToast(msg, 'error', 5000);
        }
      }
    };

    if (imediato) { exec(); return; }
    clearTimeout(_saveTimers[row._uid]);
    _saveTimers[row._uid] = setTimeout(exec, 600);
  }

  return {
    init, isReady, precisaAuth, estaAutenticado, login, logout,
    tokenAtual, usuarioAtual, garantirLogin,
    makeUid, carregarTodas, reidratar, salvarLinha,
  };
})();

window.Supa = Supa;
