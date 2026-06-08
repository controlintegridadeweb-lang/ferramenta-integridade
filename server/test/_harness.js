'use strict';

/* Sobe a app REAL com o client Supabase fake injetado e a autenticação ligada.
   Faz isso configurando o ambiente e pré-populando o require cache ANTES de
   carregar a app, para exercitar config → middlewares → rotas → service →
   repository de verdade (só o acesso ao banco é fake). */

const path = require('path');
const Module = require('module');
const { TEST_JWT_SECRET } = require('./helpers/authTestToken');

function iniciarServidorDeTeste({ protegeLeitura = false } = {}) {
  // 1) Ambiente: modo SUPABASE AUTH ligado (igual à produção atual). O login
  //    real ocorre no navegador; aqui só validamos o JWT. Definimos o mesmo
  //    JWT Secret que o helper de teste usa para assinar os tokens.
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'fake-service-key';
  process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;   // ativa o modo Supabase
  process.env.API_USERS = '';                          // sem login local legado
  process.env.API_SECRET = '';
  process.env.AUTH_PROTEGE_LEITURA = String(protegeLeitura);
  process.env.SHEETS_URL = '';   // sheets desligado nos testes de anotações

  // 2) Limpa o cache dos módulos da app para reler com o novo ambiente.
  const raiz = path.join(__dirname, '..');
  Object.keys(require.cache)
    .filter(p => p.startsWith(path.join(raiz, 'src')))
    .forEach(p => delete require.cache[p]);

  // 3) Injeta o fake no lugar de src/config/supabase.js.
  const { criarFakeSupabase } = require('./_fakeSupabase');
  const fake = criarFakeSupabase();
  const caminhoSupabase = require.resolve(path.join(raiz, 'src', 'config', 'supabase.js'));
  require.cache[caminhoSupabase] = new Module(caminhoSupabase, null);
  require.cache[caminhoSupabase].filename = caminhoSupabase;
  require.cache[caminhoSupabase].loaded = true;
  require.cache[caminhoSupabase].exports = fake;

  // 4) Carrega a app real e sobe num porto efêmero.
  const app = require(path.join(raiz, 'src', 'app'));
  const server = app.listen(0);
  return { server, fake, porta: server.address().port };
}

/* Cliente HTTP mínimo (sem dependências). */
function req(porta, metodo, caminho, { body, headers } = {}) {
  const http = require('http');
  const payload = body !== undefined ? JSON.stringify(body) : null;
  const opcoes = {
    host: '127.0.0.1', port: porta, path: caminho, method: metodo,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      payload ? { 'Content-Length': Buffer.byteLength(payload) } : {},
      headers || {}
    ),
  };
  return new Promise((resolve, reject) => {
    const r = http.request(opcoes, res => {
      let dados = '';
      res.on('data', c => dados += c);
      res.on('end', () => {
        let json = null;
        try { json = dados ? JSON.parse(dados) : null; } catch { /* não-JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, raw: dados });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

module.exports = { iniciarServidorDeTeste, req };
