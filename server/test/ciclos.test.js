'use strict';

/* Testes de API do fluxo de CICLOS — sincronização idempotente, fila,
   transições, geração de relatório atômica, não-duplicação e histórico.
   Usa a app real com o Supabase fake de ciclos. */

const assert = require('assert');
const path = require('path');
const Module = require('module');
const { req } = require('./_harness');
const { criarFakeCiclos } = require('./_fakeCiclos');
const { gerarTokenTeste, TEST_JWT_SECRET } = require('./helpers/authTestToken');

let passou = 0, falhou = 0;
const testes = [];
function teste(nome, fn) { testes.push({ nome, fn }); }

function iniciar() {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'fake-key';
  process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;   // modo Supabase Auth
  process.env.API_USERS = '';                          // sem login local legado
  process.env.API_SECRET = '';
  process.env.SHEETS_URL = '';

  const raiz = path.join(__dirname, '..');
  Object.keys(require.cache).filter(p => p.startsWith(path.join(raiz, 'src'))).forEach(p => delete require.cache[p]);

  const fake = criarFakeCiclos();
  const cp = require.resolve(path.join(raiz, 'src', 'config', 'supabase.js'));
  require.cache[cp] = new Module(cp, null);
  require.cache[cp].loaded = true;
  require.cache[cp].exports = fake;

  const app = require(path.join(raiz, 'src', 'app'));
  const server = app.listen(0);
  return { server, fake, porta: server.address().port };
}

/* Token de teste no formato Supabase, sem /api/auth/login. */
function token(_p) {
  return gerarTokenTeste();
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function sincronizar(p, t, registros) {
  return req(p, 'POST', '/api/ciclos/sincronizar', { body: { registros }, headers: auth(t) });
}
async function transicao(p, t, uid, status) {
  return req(p, 'POST', `/api/ciclos/analises/${encodeURIComponent(uid)}/transicao`, { body: { status }, headers: auth(t) });
}

// ── Sincronização ────────────────────────────────────────────────────────────
teste('sincronizar insere apenas registros novos (idempotente)', async (p) => {
  const t = await token(p);
  const regs = [{ uid: 'a', processo: 'P-1' }, { uid: 'b', processo: 'P-2' }];
  const r1 = await sincronizar(p, t, regs);
  assert.strictEqual(r1.json.inseridos, 2);
  const r2 = await sincronizar(p, t, regs);   // de novo
  assert.strictEqual(r2.json.inseridos, 0, 'não deve recriar existentes');
});

teste('sincronização exige autenticação', async (p) => {
  const r = await req(p, 'POST', '/api/ciclos/sincronizar', { body: { registros: [] } });
  assert.strictEqual(r.status, 401);
});

teste('sincronização com token inválido → 401', async (p) => {
  const r = await req(p, 'POST', '/api/ciclos/sincronizar', {
    body: { registros: [] }, headers: { Authorization: 'Bearer token.invalido.xyz' },
  });
  assert.strictEqual(r.status, 401);
});

teste('gerar relatório exige autenticação (sem token → 401)', async (p) => {
  const r = await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a'] } });
  assert.strictEqual(r.status, 401);
});

teste('transição exige autenticação (sem token → 401)', async (p) => {
  const r = await req(p, 'POST', '/api/ciclos/analises/a/transicao', { body: { status: 'EM_ANALISE' } });
  assert.strictEqual(r.status, 401);
});

// ── Fila e dashboard ──────────────────────────────────────────────────────────
teste('fila lista pendentes; dashboard conta por status', async (p) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a', processo: 'P-1' }, { uid: 'b', processo: 'P-2' }]);
  const fila = await req(p, 'GET', '/api/ciclos/fila');
  assert.ok(fila.json.a && fila.json.b);
  const dash = await req(p, 'GET', '/api/ciclos/dashboard');
  assert.strictEqual(dash.json.pendentes, 2);
  assert.strictEqual(dash.json.finalizados, 0);
});

// ── Transições ────────────────────────────────────────────────────────────────
teste('transição PENDENTE→EM_ANALISE→VALIDADO', async (p) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a' }]);
  assert.strictEqual((await transicao(p, t, 'a', 'EM_ANALISE')).json.status, 'EM_ANALISE');
  assert.strictEqual((await transicao(p, t, 'a', 'VALIDADO')).json.status, 'VALIDADO');
});

teste('transição de status inválido → 400', async (p) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a' }]);
  const r = await transicao(p, t, 'a', 'FINALIZADO');   // não permitido via transição
  assert.strictEqual(r.status, 400);
});

teste('transição de uid inexistente → 404', async (p) => {
  const t = await token(p);
  const r = await transicao(p, t, 'nao-existe', 'EM_ANALISE');
  assert.strictEqual(r.status, 404);
});

// ── Geração de relatório ─────────────────────────────────────────────────────
teste('gerar relatório finaliza só os VALIDADO e numera sequencialmente', async (p, fake) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }]);
  await transicao(p, t, 'a', 'VALIDADO');
  await transicao(p, t, 'b', 'VALIDADO');
  // 'c' fica PENDENTE de propósito
  const r = await req(p, 'POST', '/api/ciclos/relatorios', {
    body: { uids: ['a', 'b', 'c'], html: '<!DOCTYPE html><html><body><h1>Relatório de teste</h1></body></html>' },
    headers: auth(t),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.relatorio.numero, 1);
  assert.strictEqual(r.json.relatorio.total_registros, 2, 'só a e b eram VALIDADO');
  assert.ok(r.json.relatorio.pdf_url, 'PDF deve ter URL');
  // c continua não-finalizado
  assert.strictEqual(fake._analises.get('c').status, 'PENDENTE');
  assert.strictEqual(fake._analises.get('a').status, 'FINALIZADO');
});

teste('relatório com incluirFinalizados reúne os já concluídos', async (p, fake) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a' }, { uid: 'b' }]);
  await transicao(p, t, 'a', 'VALIDADO');
  await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a'] }, headers: auth(t) });
  assert.strictEqual(fake._analises.get('a').status, 'FINALIZADO');

  const r = await req(p, 'POST', '/api/ciclos/relatorios', {
    body: { uids: ['a', 'b'], incluirFinalizados: true, html: '<p>concluidos</p>' },
    headers: auth(t),
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.relatorio.total_registros, 1, 'b não está concluído; só a entra');
  assert.strictEqual(fake._analises.get('a').status, 'FINALIZADO');
  assert.strictEqual(fake._analises.get('b').status, 'PENDENTE');
});

teste('gerar relatório sem nenhum VALIDADO → 409', async (p) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a' }]);
  const r = await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a'] }, headers: auth(t) });
  assert.strictEqual(r.status, 409);
});

// ── Não-duplicação / novos ciclos ─────────────────────────────────────────────
teste('registro FINALIZADO não volta para fila nem muda de status', async (p, fake) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a' }]);
  await transicao(p, t, 'a', 'VALIDADO');
  await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a'] }, headers: auth(t) });

  // some da fila
  const fila = await req(p, 'GET', '/api/ciclos/fila');
  assert.ok(!fila.json.a, 'finalizado não aparece na fila');
  // re-sincronizar não reabre
  const re = await sincronizar(p, t, [{ uid: 'a' }]);
  assert.strictEqual(re.json.inseridos, 0);
  // tentar transicionar → 409
  const tr = await transicao(p, t, 'a', 'EM_ANALISE');
  assert.strictEqual(tr.status, 409);
});

teste('ciclo 2: só novos entram; relatório #002 não contém antigos', async (p, fake) => {
  const t = await token(p);
  // Ciclo 1
  await sincronizar(p, t, [{ uid: 'a' }, { uid: 'b' }]);
  await transicao(p, t, 'a', 'VALIDADO');
  await transicao(p, t, 'b', 'VALIDADO');
  const r1 = await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a', 'b'] }, headers: auth(t) });
  assert.strictEqual(r1.json.relatorio.numero, 1);

  // Ciclo 2: chegam c, d (a, b já finalizados)
  const sync2 = await sincronizar(p, t, [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }, { uid: 'd' }]);
  assert.strictEqual(sync2.json.inseridos, 2, 'só c e d são novos');
  await transicao(p, t, 'c', 'VALIDADO');
  await transicao(p, t, 'd', 'VALIDADO');
  const r2 = await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a', 'b', 'c', 'd'] }, headers: auth(t) });
  assert.strictEqual(r2.json.relatorio.numero, 2);
  assert.strictEqual(r2.json.relatorio.total_registros, 2, 'a e b já finalizados não recontam');
});

// ── Histórico ─────────────────────────────────────────────────────────────────
teste('histórico lista relatórios e detalha registros', async (p) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a', processo: 'P-1' }]);
  await transicao(p, t, 'a', 'VALIDADO');
  const g = await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a'] }, headers: auth(t) });
  const id = g.json.relatorio.id;

  const lista = await req(p, 'GET', '/api/ciclos/relatorios');
  assert.ok(Array.isArray(lista.json) && lista.json.length === 1);

  const det = await req(p, 'GET', `/api/ciclos/relatorios/${id}`);
  assert.strictEqual(det.json.relatorio.numero, 1);
  assert.strictEqual(det.json.registros.length, 1);
  assert.strictEqual(det.json.registros[0].uid, 'a');
});

teste('dashboard reflete último relatório', async (p) => {
  const t = await token(p);
  await sincronizar(p, t, [{ uid: 'a' }]);
  await transicao(p, t, 'a', 'VALIDADO');
  await req(p, 'POST', '/api/ciclos/relatorios', { body: { uids: ['a'] }, headers: auth(t) });
  const dash = await req(p, 'GET', '/api/ciclos/dashboard');
  assert.ok(dash.json.ultimoRelatorio);
  assert.strictEqual(dash.json.ultimoRelatorio.numero, 1);
  assert.strictEqual(dash.json.finalizados, 1);
});

// ── Runner ───────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n  TESTES DE API — CICLOS (sincronização · fila · relatório · não-duplicação)\n');
  for (const t of testes) {
    const { server, fake } = iniciar();
    const porta = server.address().port;
    try {
      await t.fn(porta, fake);
      console.log(`  ✓ ${t.nome}`);
      passou++;
    } catch (e) {
      console.log(`  ✗ ${t.nome}\n      ${e.message}`);
      falhou++;
    } finally {
      server.close();
    }
  }
  console.log(`\n  RESULTADO CICLOS: ${passou} aprovados | ${falhou} falhou(ram) | Total: ${passou + falhou}\n`);
  process.exit(falhou ? 1 : 0);
})();
