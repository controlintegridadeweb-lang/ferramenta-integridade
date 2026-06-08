'use strict';

/* Testes de API — exercitam a app real (auth, validação, versionamento,
   auditoria) com o Supabase fake. Sem dependências externas. */

const assert = require('assert');
const { iniciarServidorDeTeste, req } = require('./_harness');
const {
  gerarTokenTeste,
  gerarTokenExpirado,
  gerarTokenAssinaturaInvalida,
  ATOR_TESTE,
} = require('./helpers/authTestToken');

let passou = 0, falhou = 0;
const testes = [];
function teste(nome, fn) { testes.push({ nome, fn }); }

/* Token de sessão para chamadas protegidas: gerado localmente no MESMO formato
   e com o MESMO segredo de um access_token do Supabase. Sem /api/auth/login. */
function tokenValido() { return gerarTokenTeste(); }

// ── Autenticação (modelo Supabase Auth) ──────────────────────────────────────
teste('login local legado está desativado (não há /api/auth/login ativo)', async (p) => {
  // No modo Supabase, o endpoint legado responde 400 e NUNCA emite token.
  const r = await req(p, 'POST', '/api/auth/login', { body: { usuario: 'ana', senha: 'segredo123' } });
  assert.strictEqual(r.status, 400);
  assert.ok(!r.json || !r.json.token, 'endpoint legado não pode emitir token');
});

teste('rota protegida com token válido de teste → autentica', async (p) => {
  const r = await req(p, 'PUT', '/api/anotacoes/auth-ok', {
    body: { dados: { _observacao_manual: 'ok' } },
    headers: { Authorization: `Bearer ${tokenValido()}` },
  });
  assert.strictEqual(r.status, 200);
});

teste('rota protegida com token expirado → 401', async (p) => {
  const r = await req(p, 'PUT', '/api/anotacoes/exp', {
    body: { dados: { _observacao_manual: 'x' } },
    headers: { Authorization: `Bearer ${gerarTokenExpirado()}` },
  });
  assert.strictEqual(r.status, 401);
});

teste('rota protegida com assinatura inválida → 401', async (p) => {
  const r = await req(p, 'PUT', '/api/anotacoes/sig', {
    body: { dados: { _observacao_manual: 'x' } },
    headers: { Authorization: `Bearer ${gerarTokenAssinaturaInvalida()}` },
  });
  assert.strictEqual(r.status, 401);
});

// ── Proteção de rotas ────────────────────────────────────────────────────────
teste('PUT sem token → 401', async (p) => {
  const r = await req(p, 'PUT', '/api/anotacoes/proc-1', { body: { dados: { _observacao_manual: 'x' } } });
  assert.strictEqual(r.status, 401);
});

teste('DELETE sem token → 401', async (p) => {
  const r = await req(p, 'DELETE', '/api/anotacoes/proc-1');
  assert.strictEqual(r.status, 401);
});

teste('PUT com token inválido → 401', async (p) => {
  const r = await req(p, 'PUT', '/api/anotacoes/proc-1', {
    body: { dados: {} }, headers: { Authorization: 'Bearer abc.def' },
  });
  assert.strictEqual(r.status, 401);
});

teste('GET é público por padrão (protegeLeitura=false)', async (p) => {
  const r = await req(p, 'GET', '/api/anotacoes');
  assert.strictEqual(r.status, 200);
});

teste('PUT com token válido → 200 e versão 1', async (p) => {
  const token = tokenValido();
  const r = await req(p, 'PUT', '/api/anotacoes/proc-1', {
    body: { dados: { _observacao_manual: 'ok' } },
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.versao, 1);
  assert.strictEqual(r.headers.etag, '1');
});

// ── Validação de payload ─────────────────────────────────────────────────────
teste('campo não permitido → 400', async (p) => {
  const token = tokenValido();
  const r = await req(p, 'PUT', '/api/anotacoes/proc-x', {
    body: { dados: { campo_proibido: 1 } },
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.json.erro, /não permitido/i);
});

teste('tipo inválido → 400', async (p) => {
  const token = tokenValido();
  const r = await req(p, 'PUT', '/api/anotacoes/proc-x', {
    body: { dados: { _observacao_manual: 123 } },   // espera string|null
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.json.erro, /tipo inválido/i);
});

teste('campos válidos da whitelist são aceitos', async (p) => {
  const token = tokenValido();
  const r = await req(p, 'PUT', '/api/anotacoes/proc-ok', {
    body: { dados: {
      _valor_manual: 1000,
      _validacao_art8: 'edital_anterior',
      _contrato_assinado: true,
      _observacao_manual: 'texto',
      _avaliacao_obrig_dados: { foo: 'bar' },
    } },
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(r.status, 200);
});

teste('dados acima do limite de tamanho → 400', async (p) => {
  const token = tokenValido();
  const grande = 'a'.repeat(70 * 1024);
  const r = await req(p, 'PUT', '/api/anotacoes/proc-big', {
    body: { dados: { _observacao_manual: grande } },
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(r.status, 400);
});

// ── Versionamento / conflito ─────────────────────────────────────────────────
teste('gravações sucessivas incrementam a versão', async (p) => {
  const token = tokenValido();
  const h = { Authorization: `Bearer ${token}` };
  const r1 = await req(p, 'PUT', '/api/anotacoes/v', { body: { dados: { _observacao_manual: 'a' } }, headers: h });
  const r2 = await req(p, 'PUT', '/api/anotacoes/v', { body: { dados: { _observacao_manual: 'b' } }, headers: h });
  assert.strictEqual(r1.json.versao, 1);
  assert.strictEqual(r2.json.versao, 2);
});

teste('If-Match com versão correta → 200', async (p) => {
  const token = tokenValido();
  const h = { Authorization: `Bearer ${token}` };
  await req(p, 'PUT', '/api/anotacoes/c', { body: { dados: { _observacao_manual: 'a' } }, headers: h });
  const r = await req(p, 'PUT', '/api/anotacoes/c', {
    body: { dados: { _observacao_manual: 'b' } },
    headers: Object.assign({ 'If-Match': '1' }, h),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.versao, 2);
});

teste('If-Match com versão defasada → 409 (conflito)', async (p) => {
  const token = tokenValido();
  const h = { Authorization: `Bearer ${token}` };
  await req(p, 'PUT', '/api/anotacoes/d', { body: { dados: { _observacao_manual: 'a' } }, headers: h });
  await req(p, 'PUT', '/api/anotacoes/d', { body: { dados: { _observacao_manual: 'b' } }, headers: h }); // versao 2
  const r = await req(p, 'PUT', '/api/anotacoes/d', {
    body: { dados: { _observacao_manual: 'c' } },
    headers: Object.assign({ 'If-Match': '1' }, h),   // espera 1, atual é 2
  });
  assert.strictEqual(r.status, 409);
  assert.match(r.json.erro, /conflito/i);
});

// ── Listagem e _versoes ──────────────────────────────────────────────────────
teste('GET devolve dados por uid e mapa _versoes', async (p) => {
  const token = tokenValido();
  const h = { Authorization: `Bearer ${token}` };
  await req(p, 'PUT', '/api/anotacoes/lst', { body: { dados: { _observacao_manual: 'z' } }, headers: h });
  const r = await req(p, 'GET', '/api/anotacoes');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json.lst, { _observacao_manual: 'z' });
  assert.strictEqual(r.json._versoes.lst, 1);
});

// ── Auditoria ────────────────────────────────────────────────────────────────
teste('upsert registra auditoria com ator', async (p, fake) => {
  const token = tokenValido();
  await req(p, 'PUT', '/api/anotacoes/aud', {
    body: { dados: { _observacao_manual: 'auditar' } },
    headers: { Authorization: `Bearer ${token}` },
  });
  const reg = fake._auditoria.find(a => a.uid === 'aud');
  assert.ok(reg, 'deve haver registro de auditoria');
  assert.strictEqual(reg.acao, 'upsert');
  assert.strictEqual(reg.ator, ATOR_TESTE);
  assert.strictEqual(reg.versao_nova, 1);
});

teste('delete registra auditoria e remove a linha', async (p, fake) => {
  const token = tokenValido();
  const h = { Authorization: `Bearer ${token}` };
  await req(p, 'PUT', '/api/anotacoes/del', { body: { dados: { _observacao_manual: 'x' } }, headers: h });
  const r = await req(p, 'DELETE', '/api/anotacoes/del', { headers: h });
  assert.strictEqual(r.status, 200);
  assert.ok(!fake._tabela.has('del'), 'linha deve ter sido removida');
  const reg = fake._auditoria.find(a => a.uid === 'del' && a.acao === 'delete');
  assert.ok(reg, 'deve haver registro de delete na auditoria');
  assert.strictEqual(reg.ator, ATOR_TESTE);
});

// ── Runner ───────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n  TESTES DE API (auth · validação · versão · auditoria)\n');
  for (const t of testes) {
    const { server, fake, porta } = iniciarServidorDeTeste();
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
  console.log(`\n  RESULTADO API: ${passou} aprovados | ${falhou} falhou(ram) | Total: ${passou + falhou}\n`);
  process.exit(falhou ? 1 : 0);
})();
