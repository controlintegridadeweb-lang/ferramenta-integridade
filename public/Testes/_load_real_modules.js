/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CARREGADOR DE MÓDULOS REAIS — para testes em Node.js
 * ───────────────────────────────────────────────────────────────────────────
 * Os módulos de produção (js/classifier.js, js/normalizer.js) são IIFEs que
 * registram objetos globais (Classifier, Normalizer) para uso no browser.
 * Eles NÃO usam module.exports, justamente para rodar sem build no navegador.
 *
 * Este carregador avalia esses MESMOS arquivos num sandbox Node e devolve os
 * objetos resultantes — sem editar uma linha do código de produção. Assim os
 * testes exercitam exatamente o que roda em produção (e não um stub paralelo).
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.resolve(__dirname, '..', 'js');

/**
 * Avalia um arquivo de módulo IIFE e retorna o(s) global(is) que ele cria.
 * Roda todos os arquivos no MESMO contexto (sandbox), de modo que dependências
 * entre eles (ex.: classifier usa nada de normalizer, mas io usa ambos) sejam
 * resolvidas como no browser, onde compartilham o escopo global.
 */
function loadModules(fileNames) {
  // Sandbox com o mínimo que os módulos de produção esperam do ambiente global.
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    Set,
    Map,
    Intl,           // toLocaleString usa Intl
    isNaN,
    isFinite,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);

  // Nomes globais que os módulos de produção declaram via `const NAME = (() => {...})()`.
  // Como `const`/`let` no topo de um script vm NÃO viram propriedades do objeto de
  // contexto, anexamos cada módulo a globalThis logo após avaliá-lo, usando uma
  // expressão executada no MESMO contexto (que enxerga o binding léxico).
  const EXPECTED_GLOBALS = {
    'normalizer.js': 'Normalizer',
    'classifier.js': 'Classifier',
  };

  for (const name of fileNames) {
    const full = path.join(JS_DIR, name);
    let code = fs.readFileSync(full, 'utf8');

    const globalName = EXPECTED_GLOBALS[name];
    if (globalName) {
      // Após o código do módulo, no mesmo escopo léxico, copia o binding const
      // para o objeto de contexto (globalThis), tornando-o legível de fora.
      code += `\n;globalThis.${globalName} = ${globalName};\n`;
    }

    vm.runInContext(code, context, { filename: full });
  }

  return sandbox;
}

const sandbox = loadModules(['normalizer.js', 'classifier.js']);

if (!sandbox.Classifier || !sandbox.Normalizer) {
  throw new Error(
    'Falha ao carregar módulos reais: ' +
    `Classifier=${!!sandbox.Classifier}, Normalizer=${!!sandbox.Normalizer}`
  );
}

module.exports = {
  Classifier: sandbox.Classifier,
  Normalizer: sandbox.Normalizer,
};
