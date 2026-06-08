/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTE — Sincronização do estado do ciclo (_sincronizarCiclo de handlers.js)
 * ───────────────────────────────────────────────────────────────────────────
 * Carrega a FUNÇÃO REAL de handlers.js num sandbox Node, injetando apenas os
 * globais que ela toca (window.Ciclos, renderCiclosDashboard, applyFilters).
 * Assim validamos a lógica de derivação de estado-alvo sem stub paralelo:
 *
 *   - obrigatório + questionário completo            → VALIDADO
 *   - obrigatório + modal recém-aberto (abrindo)     → EM_ANALISE
 *   - obrigatório sem questionário e sem "abrindo"   → mantém estado atual
 *   - saiu de escopo a partir de VALIDADO            → EM_ANALISE depois PENDENTE
 *   - saiu de escopo a partir de EM_ANALISE          → PENDENTE
 *   - já FINALIZADO                                  → nenhuma transição
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HANDLERS = path.resolve(__dirname, '..', 'js', 'handlers.js');

/* Extrai apenas a definição de _sincronizarCiclo do arquivo real, preservando o
   corpo verbatim (sem reescrever a lógica). Localiza a função e captura até o
   fechamento equilibrado de chaves. */
function extrairFuncao(src, nome) {
  const marca = `async function ${nome}(`;
  const ini = src.indexOf(marca);
  if (ini === -1) throw new Error(`função ${nome} não encontrada`);
  // Avança até a primeira "{" do corpo
  let i = src.indexOf('{', ini);
  let prof = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) return src.slice(ini, j + 1); }
  }
  throw new Error('chave de fechamento não encontrada');
}

const corpo = extrairFuncao(fs.readFileSync(HANDLERS, 'utf8'), '_sincronizarCiclo');

/* Sandbox com Ciclos simulado que registra as transições pedidas. */
function novoContexto(statusInicial) {
  const chamadas = [];
  let statusAtual = statusInicial;
  const sandbox = {
    console,
    window: {},
    renderCiclosDashboard: () => {},
    applyFilters: () => {},
  };
  sandbox.window.Ciclos = {
    ativo: () => true,
    statusDe: () => statusAtual,
    transicionar: async (_uid, novo) => { chamadas.push(novo); statusAtual = novo; return { status: novo }; },
  };
  // No browser, `Ciclos` é global e `window.Ciclos === Ciclos`. Espelhamos isso.
  sandbox.Ciclos = sandbox.window.Ciclos;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(corpo + '\nthis.__fn = _sincronizarCiclo;', ctx);
  return { fn: sandbox.__fn, chamadas, get status() { return statusAtual; } };
}

/* Helpers de construção de "row". */
function rowObrigCompleto(uid) {
  return { _uid: uid, _statusFinal: 'avaliacao-obrigatoria',
    _avaliacao_obrig_dados: { contrato_interrompido: 'nao', categoria: 'contrato_firmado',
      valor_adjudicacao: 'sim', contrato_assinado: 'sim' } };
}
function rowObrigSemQuest(uid) {
  return { _uid: uid, _statusFinal: 'avaliacao-obrigatoria' };
}
function rowForaEscopo(uid) {
  return { _uid: uid, _statusFinal: 'nao-enquadrado' };
}

/* Mini-runner. */
let ok = 0, fail = 0;
function eq(desc, got, exp) {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) { ok++; console.log('  PASS', desc); }
  else { fail++; console.log('  FAIL', desc, '\n        obtido:', g, '\n        esperado:', e); }
}

(async () => {
  console.log('\n=== Sincronização de estado do ciclo ===');

  // 1. Obrigatório completo, partindo de EM_ANALISE → VALIDADO
  {
    const c = novoContexto('EM_ANALISE');
    await c.fn(rowObrigCompleto('a'));
    eq('completo: EM_ANALISE → VALIDADO', c.chamadas, ['VALIDADO']);
  }

  // 2. Obrigatório completo, partindo de PENDENTE → VALIDADO (front permite atalho)
  {
    const c = novoContexto('PENDENTE');
    await c.fn(rowObrigCompleto('b'));
    eq('completo: PENDENTE → VALIDADO', c.chamadas, ['VALIDADO']);
  }

  // 3. Obrigatório sem questionário, abrindo modal → EM_ANALISE
  {
    const c = novoContexto('PENDENTE');
    await c.fn(rowObrigSemQuest('c'), { abrindo: true });
    eq('sem quest + abrindo: → EM_ANALISE', c.chamadas, ['EM_ANALISE']);
  }

  // 4. Obrigatório sem questionário, SEM abrir (mera reclassificação) → não mexe
  {
    const c = novoContexto('EM_ANALISE');
    await c.fn(rowObrigSemQuest('d'));
    eq('sem quest + sem abrir: preserva estado', c.chamadas, []);
  }

  // 5. Saiu de escopo a partir de VALIDADO → EM_ANALISE depois PENDENTE
  {
    const c = novoContexto('VALIDADO');
    await c.fn(rowForaEscopo('e'));
    eq('fora de escopo de VALIDADO: → EM_ANALISE,PENDENTE', c.chamadas, ['EM_ANALISE', 'PENDENTE']);
  }

  // 6. Saiu de escopo a partir de EM_ANALISE → PENDENTE
  {
    const c = novoContexto('EM_ANALISE');
    await c.fn(rowForaEscopo('f'));
    eq('fora de escopo de EM_ANALISE: → PENDENTE', c.chamadas, ['PENDENTE']);
  }

  // 7. Já FINALIZADO → nenhuma transição
  {
    const c = novoContexto('FINALIZADO');
    await c.fn(rowObrigCompleto('g'));
    eq('finalizado: imutável', c.chamadas, []);
  }

  // 8. Já validado e continua completo → idempotente (sem nova transição)
  {
    const c = novoContexto('VALIDADO');
    await c.fn(rowObrigCompleto('h'));
    eq('validado + completo: idempotente', c.chamadas, []);
  }

  console.log(`\n  RESULTADO CICLO-ESTADO: ${ok} aprovados | ${fail} falhou(ram) | Total: ${ok + fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
