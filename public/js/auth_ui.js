'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   TELA DE LOGIN — gate antes de liberar o app
   ───────────────────────────────────────────────────────────────────────────
   A tela vive no index.html (#authScreen). Enquanto body.auth-locked, o
   #appShell fica oculto e inerte. Só depois de sessão válida o app inicializa.
   Suporta Supabase Auth (e-mail) e modo legado API_USERS (usuário).
   ═══════════════════════════════════════════════════════════════════════════ */

const AuthUI = (() => {

  let _modo = null;          // 'supabase' | 'legado' | null
  let _onSucesso = null;
  let _ligado = false;

  function _el(id) { return document.getElementById(id); }

  function _liberarApp() {
    document.body.classList.remove('auth-locked');
    const shell = _el('appShell');
    if (shell) {
      shell.removeAttribute('inert');
      shell.removeAttribute('aria-hidden');
    }
  }

  function _bloquearApp() {
    document.body.classList.add('auth-locked');
    const shell = _el('appShell');
    if (shell) {
      shell.setAttribute('inert', '');
      shell.setAttribute('aria-hidden', 'true');
    }
  }

  async function _carregarSaude() {
    const resp = await fetch('/api/health');
    if (!resp.ok) throw new Error('Não foi possível verificar o servidor.');
    return resp.json();
  }

  function _configurarFormulario(saude) {
    const label = _el('authUsuarioLabel');
    const campo = _el('authUsuario');
    if (!label || !campo) return;

    if (saude.supabaseAuth) {
      _modo = 'supabase';
      label.textContent = 'E-mail';
      campo.type = 'email';
      campo.placeholder = 'seu.email@exemplo.gov.br';
      campo.autocomplete = 'username';
    } else {
      _modo = 'legado';
      label.textContent = 'Usuário';
      campo.type = 'text';
      campo.placeholder = 'seu.usuario';
      campo.autocomplete = 'username';
    }
  }

  function _mostrarErro(msg) {
    const erro = _el('authErro');
    if (!erro) return;
    erro.textContent = msg || '';
    erro.style.display = msg ? 'block' : 'none';
  }

  async function _tentarLogin() {
    const usuario = (_el('authUsuario')?.value || '').trim();
    const senha = _el('authSenha')?.value || '';
    const btn = _el('authEntrar');

    if (!usuario || !senha) {
      _mostrarErro('Informe usuário e senha.');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
    _mostrarErro('');

    try {
      // Fonte única: o login sempre passa por window.Auth, que internamente
      // trata os dois modos (Supabase no navegador ou legado via back-end).
      if (!window.Auth) throw new Error('Módulo de autenticação indisponível.');
      await window.Auth.login(usuario, senha);

      if (_el('authSenha')) _el('authSenha').value = '';
      _liberarApp();
      if (typeof _onSucesso === 'function') _onSucesso();
    } catch (err) {
      console.error('[AuthUI] Falha no login:', err);
      _mostrarErro(err.message || 'Falha no login.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
  }

  function _ligarFormulario() {
    if (_ligado) return;
    _ligado = true;

    const btn = _el('authEntrar');
    const usuario = _el('authUsuario');
    const senha = _el('authSenha');

    if (btn) btn.addEventListener('click', _tentarLogin);
    [usuario, senha].forEach(inp => {
      if (inp) inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') _tentarLogin(); });
    });
  }

  function _aguardarLogin(onSucesso) {
    _bloquearApp();
    _ligarFormulario();
    const campo = _el('authUsuario');
    if (campo) setTimeout(() => campo.focus(), 50);

    return new Promise(resolve => {
      _onSucesso = () => {
        if (typeof onSucesso === 'function') onSucesso();
        resolve(true);
      };
    });
  }

  async function _sessaoValida(saude) {
    // Inicializa a fonte única em qualquer modo; depois consulta o estado.
    if (window.Auth) await window.Auth.init();
    return !!(window.Auth && window.Auth.estaLogado());
  }

  function _fimVerificacao() {
    document.body.classList.remove('auth-checking');
  }

  /* Gate principal: bloqueia o app até haver sessão (ou até auth estar off). */
  async function exigirLogin() {
    document.body.classList.add('auth-checking');

    let saude;
    try {
      saude = await _carregarSaude();
    } catch (err) {
      // Servidor indisponível: ainda assim mostra a tela com o botão ligado
      // para o usuário tentar de novo, em vez de travar.
      console.error('[AuthUI] Health falhou:', err.message || err);
      _fimVerificacao();
      _bloquearApp();
      _configurarFormulario({ supabaseAuth: true });
      _ligarFormulario();
      _mostrarErro('Servidor indisponível. Verifique se ele está no ar e tente novamente.');
      return _aguardarLogin();
    }

    if (!saude.auth) {
      _fimVerificacao();
      _liberarApp();
      return true;
    }

    // Prepara e LIGA o formulário antes de qualquer checagem que possa falhar,
    // garantindo que o botão "Entrar" sempre responda.
    _configurarFormulario(saude);
    _ligarFormulario();

    let temSessao = false;
    try {
      temSessao = await _sessaoValida(saude);
    } catch (err) {
      console.error('[AuthUI] Verificação de sessão falhou:', err);
    }

    _fimVerificacao();

    if (temSessao) {
      _liberarApp();
      return true;
    }

    return _aguardarLogin();
  }

  /* Reabre o gate quando a sessão expira durante o uso. */
  function mostrar(onSucesso) {
    return _aguardarLogin(onSucesso);
  }

  function esconder() {
    _liberarApp();
  }

  function atualizarHeader(saude) {
    const wrap = document.getElementById('headerUser');
    const label = document.getElementById('headerUserEmail');
    const btn = document.getElementById('btnLogout');
    if (!wrap) return;

    if (!saude || !saude.auth) {
      wrap.hidden = true;
      return;
    }

    let nome = '';
    if (window.Auth && window.Auth.usuarioAtual) {
      nome = window.Auth.usuarioAtual() || '';
    }

    if (label) label.textContent = nome;
    wrap.hidden = false;

    if (btn && !btn.dataset.ligado) {
      btn.dataset.ligado = '1';
      btn.addEventListener('click', () => { sair(); });
    }
  }

  async function sair() {
    try {
      if (window.Auth) await window.Auth.logout();
    } catch (err) {
      console.error('[AuthUI] Erro ao sair:', err);
    }
    location.reload();
  }

  return {
    exigirLogin, mostrar, esconder, sair,
    liberarApp: _liberarApp, bloquearApp: _bloquearApp,
    atualizarHeader,
  };
})();

window.AuthUI = AuthUI;
