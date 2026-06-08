'use strict';

const config = require('../config');
const auth = require('../services/auth.service');

/* Extrai o ator (req.ator) do Bearer token, se houver e for válido. Nunca
   bloqueia sozinho — só identifica. O bloqueio é responsabilidade do exigirAuth. */
function identificar(req, _res, next) {
  req.ator = 'anonimo';
  const h = req.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const info = auth.verificarToken(m[1]);
    if (info) req.ator = info.sub;
    else req._tokenInvalido = true;
  }
  next();
}

/* Exige autenticação quando AUTH está ativo. Se não estiver configurada,
   deixa passar (modo aberto de desenvolvimento — o app avisa no boot). */
function exigirAuth(req, res, next) {
  if (!config.auth.ativo) return next();          // auth desligada: modo aberto
  if (req.ator && req.ator !== 'anonimo') return next();
  const err = new Error(req._tokenInvalido ? 'Token inválido ou expirado.' : 'Autenticação obrigatória.');
  err.status = 401;
  err.expose = true;
  return next(err);
}

module.exports = { identificar, exigirAuth };
