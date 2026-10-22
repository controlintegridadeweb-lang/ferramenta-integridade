'use strict';

const path = require('path');

const envDir = path.join(__dirname, '..', '..');
require('dotenv').config({ path: path.join(envDir, '.env') });
require('dotenv').config({ path: path.join(envDir, '.env.local'), override: true });

function isHttpUrl(val) {
  return /^https?:\/\//i.test(String(val || '').trim());
}

/** Ignora placeholders do .env.example que ainda não foram substituídos. */
function isValorReal(val) {
  const s = String(val || '').trim();
  if (!s) return false;
  return !/COLOQUE_SEU_VALOR|SEU-PROJETO|COLE_AQUI|SEU_ID/i.test(s);
}

const SUPABASE_URL   = process.env.SUPABASE_URL || '';

/** Lê o claim `role` de um JWT do Supabase, sem usar a chave para mais nada. */
function papelJwt(token) {
  try {
    const parte = String(token || '').split('.')[1];
    if (!parte) return '';
    const json = JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
    return String(json.role || '');
  } catch (_) {
    return '';
  }
}

/* As duas chaves às vezes são coladas trocadas. O navegador só pode receber
   a chave com role "anon". A service_role fica exclusivamente no servidor. */
function escolherChavesSupabase() {
  const candidatas = [process.env.SUPABASE_SERVICE_KEY, process.env.SUPABASE_ANON_KEY]
    .map(v => String(v || '').trim())
    .filter(isValorReal);
  return {
    serviceKey: candidatas.find(k => papelJwt(k) === 'service_role') || '',
    anonKey:    candidatas.find(k => papelJwt(k) === 'anon') || '',
  };
}

const { serviceKey: SUPABASE_SERVICE_KEY, anonKey: SUPABASE_ANON_KEY } = escolherChavesSupabase();
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'anotacoes_analista';
const SHEETS_URL     = process.env.SHEETS_URL || '';
const SHEETS_REFRESH = Number(process.env.SHEETS_AUTO_REFRESH_SEG || 0);

const SHEETS_CACHE_TTL  = Number(process.env.SHEETS_CACHE_TTL_SEG || 60);     // 0 = sem TTL (cache nunca expira sozinho)
const SHEETS_DATA_DIR   = process.env.SHEETS_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'sheets');
const SHEETS_KEEP_VERS  = Number(process.env.SHEETS_KEEP_VERSIONS || 20);     // quantas versões manter em disco

// ── Autenticação do back-end ────────────────────────────────────────────────
// API_USERS: lista "usuario:senha" separada por vírgula. Cada par permite login
//            e dá rastreabilidade (o nome vai para a auditoria).
// API_SECRET: segredo para assinar os tokens de sessão (HMAC). Obrigatório se
//             houver usuários; se faltar, é derivado da service_key (com aviso).
// AUTH_PROTEGE_LEITURA: se 'true', GET /api/anotacoes também exige token.
//             Por padrão, só escritas (PUT/DELETE) são protegidas.
// AUTH_TOKEN_TTL_SEG: validade do token de sessão (padrão 8h).
function parseUsers(raw) {
  const mapa = {};
  String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(par => {
      const i = par.indexOf(':');
      if (i > 0) mapa[par.slice(0, i).trim()] = par.slice(i + 1);
    });
  return mapa;
}

const API_USERS  = parseUsers(process.env.API_USERS);
const API_SECRET = process.env.API_SECRET || '';

// ── Supabase Auth ────────────────────────────────────────────────────────────
// Quando SUPABASE_JWT_SECRET está definido, o back-end passa a confiar nos
// tokens emitidos pelo Supabase Auth (login feito no navegador via supabase-js)
// em vez de gerar tokens próprios. O segredo é o "JWT Secret" do projeto:
//   Supabase → Project Settings → API → JWT Settings → JWT Secret
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
const USA_SUPABASE_AUTH   = isValorReal(SUPABASE_JWT_SECRET)
  && isHttpUrl(SUPABASE_URL)
  && isValorReal(SUPABASE_ANON_KEY);

// Auth está ativa se houver usuários locais OU se o Supabase Auth estiver ligado.
const AUTH_ATIVO = USA_SUPABASE_AUTH || Object.keys(API_USERS).length > 0;

const config = {
  port: process.env.PORT || 3000,
  publicDir: path.join(__dirname, '..', '..', '..', 'public'),
  supabase: {
    url:    SUPABASE_URL,
    key:    SUPABASE_KEY,
    table:  SUPABASE_TABLE,
    ativo:  isHttpUrl(SUPABASE_URL) && isValorReal(SUPABASE_KEY),
    // Credenciais públicas para o login no navegador (supabase-js).
    anonKey: SUPABASE_ANON_KEY,
  },
  sheets: {
    url:         SHEETS_URL,
    refreshSeg:  SHEETS_REFRESH,
    // Placeholder do .env.example (ex.: SEU_ID) NÃO ativa Sheets —
    // senão o front chama /api/sheets e o Google devolve 502/erro de rede.
    ativo:       isHttpUrl(SHEETS_URL) && isValorReal(SHEETS_URL),
    cacheTtlSeg: SHEETS_CACHE_TTL,
    dataDir:     SHEETS_DATA_DIR,
    keepVersoes: SHEETS_KEEP_VERS,
  },
  auth: {
    ativo:          AUTH_ATIVO,
    usuarios:       API_USERS,
    segredo:        API_SECRET || SUPABASE_KEY || 'inseguro-troque-API_SECRET',
    segredoProprio: !!API_SECRET,
    protegeLeitura: String(process.env.AUTH_PROTEGE_LEITURA || '').toLowerCase() === 'true',
    tokenTtlSeg:    Number(process.env.AUTH_TOKEN_TTL_SEG || 8 * 3600),
    // Supabase Auth (login no navegador)
    usaSupabase:    USA_SUPABASE_AUTH,
    supabaseJwtSecret: SUPABASE_JWT_SECRET,
  },
  relatorios: {
    bucket: process.env.RELATORIOS_BUCKET || 'relatorios',
  },
};

module.exports = config;
