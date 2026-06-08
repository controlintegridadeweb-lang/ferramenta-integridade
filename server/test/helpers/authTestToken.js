'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   HELPER DE TESTE — gera um JWT compatível com o Supabase Auth
   ───────────────────────────────────────────────────────────────────────────
   O login real acontece no NAVEGADOR via supabase-js; o back-end apenas valida
   o access_token (JWT HS256) com o "JWT Secret" do projeto. Para os testes não
   dependerem do endpoint legado /api/auth/login (desativado no modo Supabase),
   este helper assina, localmente, um JWT no MESMO formato que o Supabase emite,
   usando o MESMO segredo que o ambiente de teste configura.

   Importante: este helper é exclusivo de teste. Não reativa login local, não
   cria endpoint de emissão e não enfraquece o middleware — ele só produz um
   token que o middleware de produção aceitaria igual a um token real, porque é
   verificado pela mesma rotina (services/supabaseToken.service.js).

   O segredo padrão é o mesmo definido em test/_harness.js (SUPABASE_JWT_SECRET).
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

// Segredo padrão do ambiente de teste. O harness exporta o mesmo valor em
// process.env.SUPABASE_JWT_SECRET antes de carregar a app.
const TEST_JWT_SECRET = 'jwt-secret-de-teste-compativel-supabase-0123456789';

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/* Gera um JWT HS256 com as claims que o Supabase Auth coloca num access_token.
   Parâmetros sobrescrevíveis para os casos de teste (ex.: exp no passado).

   options:
     sub      → id do usuário (uuid fake)         default: 'user-teste-0001'
     email    → e-mail do usuário                 default: 'usuario.teste@example.com'
     role     → papel                             default: 'authenticated'
     aud      → audiência                         default: 'authenticated'
     exp      → expiração (epoch s)               default: agora + 1h
     iat      → emissão (epoch s)                 default: agora
     segredo  → segredo de assinatura             default: SUPABASE_JWT_SECRET do env (ou o padrão)
     alg      → algoritmo declarado no header     default: 'HS256'
*/
function gerarTokenTeste(options = {}) {
  const agora = Math.floor(Date.now() / 1000);
  const segredo = options.segredo || process.env.SUPABASE_JWT_SECRET || TEST_JWT_SECRET;
  const alg = options.alg || 'HS256';

  const header = { alg, typ: 'JWT' };
  const payload = {
    sub:   options.sub   !== undefined ? options.sub   : 'user-teste-0001',
    email: options.email !== undefined ? options.email : 'usuario.teste@example.com',
    role:  options.role  !== undefined ? options.role  : 'authenticated',
    aud:   options.aud   !== undefined ? options.aud   : 'authenticated',
    iat:   options.iat   !== undefined ? options.iat   : agora,
    exp:   options.exp   !== undefined ? options.exp   : agora + 3600,
  };

  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const assinatura = b64url(
    crypto.createHmac('sha256', segredo).update(`${h}.${p}`).digest()
  );
  return `${h}.${p}.${assinatura}`;
}

/* Token expirado (exp no passado) — para o caso "token inválido/expirado → 401". */
function gerarTokenExpirado(options = {}) {
  const agora = Math.floor(Date.now() / 1000);
  return gerarTokenTeste(Object.assign({ iat: agora - 7200, exp: agora - 3600 }, options));
}

/* Token assinado com segredo errado — assinatura não confere → 401. */
function gerarTokenAssinaturaInvalida(options = {}) {
  return gerarTokenTeste(Object.assign({ segredo: 'segredo-totalmente-errado' }, options));
}

/* Conveniência: o e-mail que o ator assume na auditoria (email > sub). */
const ATOR_TESTE = 'usuario.teste@example.com';

module.exports = {
  TEST_JWT_SECRET,
  ATOR_TESTE,
  gerarTokenTeste,
  gerarTokenExpirado,
  gerarTokenAssinaturaInvalida,
};
