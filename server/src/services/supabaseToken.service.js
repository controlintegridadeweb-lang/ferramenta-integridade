'use strict';

const crypto = require('crypto');
const config = require('../config');

/* Verifica tokens (JWT) emitidos pelo Supabase Auth.
   O login é feito no NAVEGADOR via supabase-js; o front envia o access_token
   no header Authorization: Bearer <jwt>.

   Projetos Supabase podem assinar com:
     • HS256 + JWT Secret (legado)
     • ES256 + chave pública via JWKS (padrão em projetos novos)

   Retorna { sub } (email ou id do usuário) ou null se inválido. */

let _jwksCache = null;
let _jwksFetchedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;

function deB64url(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function payloadValido(payload) {
  const agora = Math.floor(Date.now() / 1000);
  if (payload.exp && agora >= payload.exp) return false;
  if (payload.nbf && agora < payload.nbf) return false;
  const sub = payload.email || payload.sub;
  return !!sub;
}

function subDoPayload(payload) {
  return payload.email || payload.sub;
}

function verificarHs256(tok) {
  const segredo = config.auth.supabaseJwtSecret;
  if (!segredo) return null;
  if (!tok || typeof tok !== 'string') return null;

  const partes = tok.split('.');
  if (partes.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = partes;

  let header;
  try { header = JSON.parse(deB64url(headerB64).toString('utf8')); }
  catch { return null; }
  if (!header || header.alg !== 'HS256') return null;

  const esperado = crypto
    .createHmac('sha256', segredo)
    .update(`${headerB64}.${payloadB64}`)
    .digest();

  const recebido = deB64url(sigB64);
  if (recebido.length !== esperado.length) return null;
  if (!crypto.timingSafeEqual(recebido, esperado)) return null;

  let payload;
  try { payload = JSON.parse(deB64url(payloadB64).toString('utf8')); }
  catch { return null; }

  if (!payloadValido(payload)) return null;
  return { sub: subDoPayload(payload) };
}

function verificarEs256(tok, keys) {
  if (!tok || typeof tok !== 'string') return null;
  const partes = tok.split('.');
  if (partes.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = partes;

  let header;
  let payload;
  try {
    header = JSON.parse(deB64url(headerB64).toString('utf8'));
    payload = JSON.parse(deB64url(payloadB64).toString('utf8'));
  } catch { return null; }

  if (!header || header.alg !== 'ES256') return null;
  if (!payloadValido(payload)) return null;

  const lista = keys || [];
  const jwk = lista.find(k => k.kid === header.kid) || lista[0];
  if (!jwk || jwk.kty !== 'EC') return null;

  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const data = Buffer.from(`${headerB64}.${payloadB64}`);
    const sig = deB64url(sigB64);
    const ok = crypto.verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
    if (!ok) return null;
  } catch {
    return null;
  }

  return { sub: subDoPayload(payload) };
}

async function prepararJwks(forcar = false) {
  const base = config.supabase.url;
  if (!base) return [];

  const agora = Date.now();
  if (!forcar && _jwksCache && agora - _jwksFetchedAt < JWKS_TTL_MS) return _jwksCache;

  const resp = await fetch(`${base.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
  if (!resp.ok) throw new Error(`JWKS HTTP ${resp.status}`);
  const j = await resp.json();
  _jwksCache = j.keys || [];
  _jwksFetchedAt = agora;
  return _jwksCache;
}

function verificar(tok) {
  if (!tok || typeof tok !== 'string') return null;
  const partes = tok.split('.');
  if (partes.length !== 3) return null;

  let header;
  try { header = JSON.parse(deB64url(partes[0]).toString('utf8')); }
  catch { return null; }

  if (header && header.alg === 'HS256') return verificarHs256(tok);
  if (header && header.alg === 'ES256') return verificarEs256(tok, _jwksCache);
  return null;
}

module.exports = { verificar, prepararJwks };
