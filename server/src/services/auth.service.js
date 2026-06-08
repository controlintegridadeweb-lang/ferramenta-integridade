'use strict';

const crypto = require('crypto');
const config = require('../config');
const token = require('./token.service');
const supabaseToken = require('./supabaseToken.service');

/* Autenticação por usuário/senha definidos em API_USERS (server/.env).
   No login bem-sucedido devolve um token de sessão assinado. A comparação da
   senha é feita em tempo constante para não vazar informação por timing. */

function comparaConstante(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // Iguala o tamanho para o timingSafeEqual não lançar; o hash já garante
  // que tamanhos diferentes resultem em buffers de mesmo comprimento.
  const ha = crypto.createHash('sha256').update(ba).digest();
  const hb = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const authService = {
  ativo() {
    return config.auth.ativo;
  },

  /* Retorna { token, usuario } ou lança erro com status 401.
     Só funciona no modo de usuários locais (API_USERS). Com Supabase Auth
     ligado, o login acontece no navegador — este endpoint não deve ser usado. */
  login(usuario, senha) {
    if (config.auth.usaSupabase) {
      const err = new Error('Login é feito pelo Supabase no navegador; este endpoint está desativado.');
      err.status = 400;
      err.expose = true;
      throw err;
    }
    if (!config.auth.ativo) {
      const err = new Error('Autenticação não está configurada no servidor.');
      err.status = 503;
      throw err;
    }
    const esperada = config.auth.usuarios[usuario];
    const ok = esperada !== undefined && comparaConstante(senha, esperada);
    if (!ok) {
      const err = new Error('Usuário ou senha inválidos.');
      err.status = 401;
      throw err;
    }
    return { token: token.gerar(usuario), usuario };
  },

  /* Verifica um token de sessão. Com Supabase Auth ligado, valida o JWT do
     Supabase; caso contrário, valida o token HMAC próprio. */
  verificarToken(tok) {
    if (config.auth.usaSupabase) return supabaseToken.verificar(tok);
    return token.verificar(tok);
  },
};

module.exports = authService;
