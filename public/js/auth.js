'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   AUTENTICAÇÃO (cliente) — login via Supabase Auth no navegador
   ───────────────────────────────────────────────────────────────────────────
   O login acontece aqui, no navegador, usando supabase-js. O usuário é criado
   manualmente no painel do Supabase (Authentication → Users). Ao logar, o
   Supabase devolve um access_token (JWT) que o back-end valida em cada chamada.

   Fluxo:
     1. init() busca /api/health → descobre se o modo Supabase está ligado e
        pega a URL + anon key (ambas públicas) para montar o cliente.
     2. Se já houver sessão salva, segue direto. Senão, mostra a tela de login.
     3. O app só inicializa (App.init) depois que há sessão válida.

   A interface pública (window.Auth) é consumida pelo supabase_store.js para
   anexar o token às chamadas de API e por app.js para decidir o boot.
   ═══════════════════════════════════════════════════════════════════════════ */

const Auth = (() => {

  const SUPABASE_JS_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

  let _client = null;        // cliente supabase-js (ou null se modo desligado)
  let _session = null;       // sessão atual { access_token, user, ... }
  let _ativo = false;        // back-end exige Supabase Auth?
  let _pronto = false;       // init() concluído?
  let _erroCarregamento = ''; // mensagem se o supabase-js não carregou

  /* Modo legado (API_USERS): o token de sessão HMAC é emitido pelo back-end
     em /api/auth/login e fica guardado AQUI, em memória — nunca persistido e
     nunca em localStorage/sessionStorage. Assim este módulo é a ÚNICA fonte
     oficial de token, tanto no modo Supabase quanto no modo legado. */
  let _tokenLegado   = null;
  let _usuarioLegado = null;
  let _authNecessaria = false;  // back-end exige token (qualquer modo)?

  /* ── Descoberta de configuração ──────────────────────────────────────────── */
  async function _carregarConfig() {
    const resp = await fetch(apiUrl('/api/health'));
    if (!resp.ok) throw new Error('health falhou');
    return resp.json();
  }

  /* ── Inicialização ───────────────────────────────────────────────────────── */
  async function init() {
    if (_pronto) return _ativo;
    let saude;
    try { saude = await _carregarConfig(); }
    catch { _pronto = true; _ativo = false; return false; }

    _ativo = !!saude.supabaseAuth;
    _authNecessaria = !!saude.auth;            // back-end exige token (Supabase OU legado)
    if (!_ativo) { _pronto = true; return false; }   // modo aberto / auth local

    if (!saude.supabaseUrl || !saude.supabaseAnonKey) {
      console.error('[Auth] Modo Supabase ligado, mas URL/anon key ausentes no health.');
      _pronto = true;
      return false;
    }

    // Carrega supabase-js sob demanda (ESM via CDN). Se a CDN estiver bloqueada
    // ou sem internet, não derruba o gate — apenas registra o erro para exibir.
    let createClient;
    try {
      ({ createClient } = await import(SUPABASE_JS_CDN));
    } catch (e) {
      console.error('[Auth] Falha ao carregar supabase-js da CDN:', e);
      _erroCarregamento = 'Não foi possível carregar o componente de login (sem internet ou CDN bloqueada).';
      _pronto = true;
      return false;
    }

    _client = createClient(saude.supabaseUrl, saude.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    // Recupera sessão existente (refresh automático cuida da expiração).
    const { data } = await _client.auth.getSession();
    _session = data.session || null;

    // Mantém a sessão em memória sincronizada com eventos do supabase-js.
    _client.auth.onAuthStateChange((_event, session) => {
      _session = session || null;
    });

    _pronto = true;
    return true;
  }

  function ativo()          { return _ativo; }

  function estaLogado() {
    if (_ativo) return !!(_session && _session.access_token);
    return !!_tokenLegado;
  }

  /* Token atual SÍNCRONO (sem renovação). Use getToken() para chamadas de API. */
  function tokenAtual() {
    if (_ativo) return _session ? _session.access_token : null;
    return _tokenLegado;
  }

  function usuarioAtual() {
    if (_ativo) return _session && _session.user ? (_session.user.email || _session.user.id) : null;
    return _usuarioLegado;
  }

  /* ── FONTE ÚNICA DE TOKEN ──────────────────────────────────────────────────
     getToken() é a única forma autorizada de obter o token para uma chamada
     protegida. Funciona nos dois modos:
       • Supabase: pede um token fresco ao supabase-js (renova se preciso).
       • Legado:   devolve o token HMAC guardado em memória.
     Nenhum módulo deve ler token de outra origem (localStorage, sessão própria,
     variável global). Todos chamam Auth.getToken(). */
  async function getToken() {
    if (_ativo) {
      if (!_client) return null;
      const { data } = await _client.auth.getSession();
      _session = data.session || _session;
      return _session ? _session.access_token : null;
    }
    return _tokenLegado;
  }

  /* Tenta renovar a sessão Supabase (ex.: após 401 por token expirado). */
  async function renovarSessao() {
    if (!_ativo || !_client) return null;
    const { data, error } = await _client.auth.refreshSession();
    if (error || !data.session) return null;
    _session = data.session;
    return _session.access_token;
  }

  /* Compat: nome antigo mantido como alias de getToken(). */
  async function tokenFresco() { return getToken(); }

  /* Login. No modo Supabase, autentica no navegador via supabase-js. No modo
     legado, autentica no back-end (/api/auth/login) e guarda o token HMAC. */
  async function login(usuario, senha) {
    if (_ativo) {
      if (!_client) await init();
      if (!_client) throw new Error(_erroCarregamento || 'Autenticação Supabase não está configurada.');
      const { data, error } = await _client.auth.signInWithPassword({ email: usuario, password: senha });
      if (error) throw new Error(_traduzErro(error));
      _session = data.session;
      return usuarioAtual();
    }
    // Modo legado: o token vem do back-end e fica só aqui.
    const resp = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j.erro || `Falha no login (HTTP ${resp.status}).`);
    }
    const j = await resp.json();
    _tokenLegado   = j.token;
    _usuarioLegado = j.usuario || usuario;
    return _usuarioLegado;
  }

  async function logout() {
    if (_client) await _client.auth.signOut();
    _session = null;
    _tokenLegado = null;
    _usuarioLegado = null;
  }

  /* Reabre a tela de login quando a sessão expira/ausenta. Centraliza a decisão
     que antes estava duplicada em supabase_store e ciclos. Retorna true se há
     (ou voltou a haver) um token utilizável. */
  async function garantirLogin() {
    if (!_ativo && !_authNecessaria) return true;   // back-end aberto: nada a fazer
    const t = await getToken();
    if (t) return true;
    if (window.AuthUI && typeof window.AuthUI.mostrar === 'function') {
      return window.AuthUI.mostrar();
    }
    return false;
  }

  /* Marca o token legado como inválido (ex.: back-end respondeu 401). */
  function invalidarToken() {
    if (_ativo) _session = null;
    else _tokenLegado = null;
  }

  function _traduzErro(error) {
    const msg = (error && error.message) || 'Falha no login.';
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
    if (/email not confirmed/i.test(msg))       return 'E-mail ainda não confirmado.';
    return msg;
  }

  function precisaAuth() { return _ativo || _authNecessaria; }

  return {
    init, ativo, precisaAuth, estaLogado, login, logout,
    tokenAtual, getToken, tokenFresco, renovarSessao, garantirLogin, invalidarToken,
    usuarioAtual,
  };
})();

window.Auth = Auth;
