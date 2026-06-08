'use strict';

const { Router } = require('express');
const config = require('../config');

const router = Router();

/* Informa ao front o que está ativo, sem expor credenciais sensíveis.
   A URL e a anon key do Supabase são públicas (protegidas por RLS) e o front
   precisa delas para fazer login pelo supabase-js. */
router.get('/health', (_req, res) => {
  res.json({
    ok:             true,
    persistencia:   config.supabase.ativo,
    sheets:         config.sheets.ativo,
    autoRefreshSeg: config.sheets.refreshSeg,
    auth:           config.auth.ativo,
    protegeLeitura: config.auth.protegeLeitura,
    // Modo de autenticação por Supabase (login no navegador).
    supabaseAuth:   config.auth.usaSupabase,
    supabaseUrl:    config.auth.usaSupabase ? config.supabase.url : '',
    supabaseAnonKey: config.auth.usaSupabase ? config.supabase.anonKey : '',
  });
});

module.exports = router;
