'use strict';

const crypto = require('crypto');
const config = require('../config');

/* Token de sessão sem dependências externas: base64url(payload).hmac.
   Stateless e assinado — não precisa de armazenamento no servidor. O payload
   carrega o usuário (sub) e a expiração (exp). Qualquer adulteração quebra a
   assinatura. Não é um JWT completo de propósito: é o mínimo suficiente e
   auditável para este back-end interno. */

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function assinar(payloadB64) {
  return b64url(
    crypto.createHmac('sha256', config.auth.segredo).update(payloadB64).digest()
  );
}

const token = {
  /* Gera um token para o usuário, válido por tokenTtlSeg. */
  gerar(sub) {
    const payload = { sub, exp: Math.floor(Date.now() / 1000) + config.auth.tokenTtlSeg };
    const payloadB64 = b64url(JSON.stringify(payload));
    return `${payloadB64}.${assinar(payloadB64)}`;
  },

  /* Verifica assinatura e expiração. Retorna { sub } ou null. */
  verificar(tok) {
    if (!tok || typeof tok !== 'string') return null;
    const partes = tok.split('.');
    if (partes.length !== 2) return null;

    const [payloadB64, sig] = partes;
    const esperado = assinar(payloadB64);

    // Comparação em tempo constante.
    const a = Buffer.from(sig);
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let payload;
    try { payload = JSON.parse(deB64url(payloadB64).toString('utf8')); }
    catch { return null; }

    if (!payload.sub || !payload.exp) return null;
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

    return { sub: payload.sub };
  },
};

module.exports = token;
