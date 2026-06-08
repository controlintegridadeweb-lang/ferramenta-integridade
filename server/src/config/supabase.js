'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

const supabase = config.supabase.ativo
  ? createClient(config.supabase.url, config.supabase.key)
  : null;

if (!config.supabase.ativo) {
  console.warn('[server] Supabase NÃO configurado — persistência desativada (veja server/.env).');
}
if (!config.sheets.ativo) {
  console.warn('[server] SHEETS_URL não definido — leitura do Google Sheets desativada.');
}
if (!config.auth.ativo) {
  console.warn('[server] AUTH DESLIGADA (API_USERS vazio) — escritas SEM proteção. Defina API_USERS para produção.');
} else if (!config.auth.segredoProprio) {
  console.warn('[server] API_SECRET não definido — tokens assinados com a service_key. Defina API_SECRET próprio.');
}

module.exports = supabase;
