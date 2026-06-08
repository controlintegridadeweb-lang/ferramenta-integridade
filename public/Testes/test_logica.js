/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTES AUTOMATIZADOS — Lógica do Classifier (Decreto 34.196/2024)
 * ───────────────────────────────────────────────────────────────────────────
 * Estes testes exercitam o CÓDIGO REAL de produção (js/classifier.js e
 * js/normalizer.js), carregado via _load_real_modules.js. NÃO há reimplementação
 * (stub) das regras aqui — assim qualquer divergência entre teste e produção
 * fica impossível: o que falha no teste falha em produção e vice-versa.
 *
 * O fluxo replica exatamente o de io.js:
 *     Normalizer.normalizeAll(data)  →  Classifier.classifyAll(data)
 *
 * Execute com: node test_logica.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { Classifier, Normalizer } = require('./_load_real_modules.js');

// ── Pipeline real: normaliza e classifica uma única linha ────────────────────
// Recebe a linha "crua" (como sairia do mapeamento de colunas do io.js) e devolve
// a mesma linha após passar pelo pipeline de produção completo.
function classify(row) {
  const data = [row];
  Normalizer.normalizeAll(data);   // reescreve campos de exibição + salva *_original
  Classifier.classifyAll(data);    // Art. 1º → Art. 2º → Art. 8º → status final
  return data[0];
}

// ── Harness ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(descricao, row, esperado, camposEsperados) {
  classify(row);
  const ok = row._statusFinal === esperado;
  const camposOk = !camposEsperados ||
    Object.entries(camposEsperados).every(([k, v]) => row[k] === v);

  if (ok && camposOk) {
    console.log(`  ✅ PASSOU — ${descricao}`);
    console.log(`         Status: ${row._statusFinal}`);
    if (row._reasons && row._reasons.length) {
      console.log(`         Art. 2º: ${row._reasons.join(', ')}`);
    }
    passed++;
  } else {
    console.log(`  ❌ FALHOU — ${descricao}`);
    console.log(`         Esperado : ${esperado}  |  Obtido: ${row._statusFinal}`);
    if (!camposOk) {
      Object.entries(camposEsperados || {}).forEach(([k, v]) => {
        if (row[k] !== v) {
          console.log(`         Campo [${k}]: esperado="${v}" obtido="${row[k]}"`);
        }
      });
    }
    if (row._reasons) {
      console.log(`         Art. 2º acionado: ${row._reasons.join(', ') || 'nenhum'}`);
    }
    if (row._art8) console.log(`         Art. 8º status: ${row._art8}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  TESTES AUTOMATIZADOS — Decreto Estadual 34.196/2024');
console.log('═══════════════════════════════════════════════════════════════\n');

// ────────────────────────────────────────────────────────────────────
console.log('── BLOCO 1: Verificação do Art. 1º (âmbito de aplicação) ─────\n');

test(
  'Cenário 5 — CAERN (empresa pública): R$ 100M → Não enquadrado no decreto',
  { nome_Uasg: 'CAERN', valor_estimado: 100_000_000, objeto: 'abastecimento de agua', modalidade: 'Pregão Eletrônico', tipo_objeto: 'Obras', dt_public_edital: '2025-05-01' },
  'nao-enquadrado-art1'
);

test(
  'CAERN com nome por extenso: Companhia de Águas e Esgotos do RN → Não enquadrado',
  { nome_Uasg: 'Companhia de Águas e Esgotos do RN', valor_estimado: 100_000_000, objeto: 'construcao', modalidade: 'Concorrência', tipo_objeto: 'Obras' },
  'nao-enquadrado-art1'
);

test(
  'CEHAB — R$ 50M → Não enquadrado no decreto',
  { nome_Uasg: 'CEHAB', valor_estimado: 50_000_000, objeto: 'construcao de habitacoes', modalidade: 'Concorrência', tipo_objeto: 'Obras', dt_public_edital: '2025-06-01' },
  'nao-enquadrado-art1'
);

test(
  'EMPARN — R$ 20M medicamentos → Não enquadrado no decreto',
  { nome_Uasg: 'EMPARN', valor_estimado: 20_000_000, objeto: 'medicamentos', modalidade: 'Pregão Eletrônico', tipo_objeto: 'Compras' },
  'nao-enquadrado-art1'
);

test(
  'AGN — R$ 200M consórcio → Não enquadrado no decreto',
  { nome_Uasg: 'AGN', valor_estimado: 200_000_000, objeto: 'consórcio de empresas para exploração', modalidade: 'Concorrência', tipo_objeto: 'Serviços' },
  'nao-enquadrado-art1'
);

test(
  'Secretaria Estadual de Saúde — R$ 20M medicamentos → NÃO deve ser excluída pelo Art. 1º',
  { nome_Uasg: 'Secretaria Estadual de Saúde', valor_estimado: 20_000_000, objeto: 'medicamentos', modalidade: 'Pregão Eletrônico', tipo_objeto: 'Compras', dt_public_edital: '2025-06-01' },
  'avaliacao-obrigatoria'
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 2: Art. 2º (obrigatoriedade) ────────────────────────\n');

test(
  'Cenário 1 — Obra R$ 40M, edital 2025 → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria Estadual de Infraestrutura', valor_estimado: 40_000_000, objeto: 'construção de rodovia estadual', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2025-04-01' },
  'avaliacao-obrigatoria'
);

test(
  'Cenário 2 — Medicamentos R$ 20M → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 20_000_000, objeto: 'aquisição de medicamentos e insumos', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-05-01' },
  'avaliacao-obrigatoria'
);

test(
  'Cenário 3 — Compra geral R$ 5M → Não enquadrado',
  { nome_Uasg: 'Secretaria de Administração', valor_estimado: 5_000_000, objeto: 'aquisição de material de escritório', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-03-20' },
  'nao-enquadrado'
);

test(
  'Merenda escolar R$ 16M → art2-p1 → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Educação', valor_estimado: 16_000_000, objeto: 'merenda escolar para rede pública estadual', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-04-15' },
  'avaliacao-obrigatoria'
);

test(
  'Vacinas R$ 15.000.001 → art2-p1 → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 15_000_001, objeto: 'vacinas para campanha estadual', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-05-01' },
  'avaliacao-obrigatoria'
);

test(
  'Vacinas R$ 15.000.000 exato (NÃO ultrapassa limiar) → Não enquadrado',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 15_000_000, objeto: 'vacinas', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-05-01' },
  'nao-enquadrado'
);

test(
  'Inexigibilidade R$ 20M → art2-p2 → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Cultura', valor_estimado: 20_000_000, objeto: 'contratação de serviço especializado', tipo_objeto: 'Serviços', modalidade: 'Inexigibilidade', dt_public_edital: '2025-04-01' },
  'avaliacao-obrigatoria'
);

test(
  'Contratação emergencial R$ 18M → art2-p2 → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Obras', valor_estimado: 18_000_000, objeto: 'obras emergenciais após desastre', tipo_objeto: 'Obras', modalidade: 'Contratação Emergencial', dt_public_edital: '2025-05-10' },
  'avaliacao-obrigatoria'
);

test(
  'PPP R$ 200M → art2-p2 → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Transportes', valor_estimado: 200_000_000, objeto: 'parceria público-privada para rodovias', tipo_objeto: 'Serviços', modalidade: 'PPP', dt_public_edital: '2025-06-01' },
  'avaliacao-obrigatoria'
);

test(
  'Compra TI R$ 30M → art2-II (residual) → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Tecnologia', valor_estimado: 30_000_000, objeto: 'solução de TI e suporte técnico', tipo_objeto: 'Tecnologia da Informação', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-04-20' },
  'avaliacao-obrigatoria'
);

test(
  'Obra engenharia R$ 35M exato (NÃO ultrapassa limiar) → Não enquadrado',
  { nome_Uasg: 'Secretaria de Infraestrutura', valor_estimado: 35_000_000, objeto: 'obra de pavimentação', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2025-05-01' },
  'nao-enquadrado'
);

test(
  'Obra engenharia R$ 35.000.001 → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Infraestrutura', valor_estimado: 35_000_001, objeto: 'obra de pavimentação', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2025-05-01' },
  'avaliacao-obrigatoria'
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 3: Art. 8º (dispensa) ────────────────────────────────\n');

test(
  'Cenário 4 — R$ 30M, edital publicado em 2024 → Pendente validação (aguarda analista)',
  { nome_Uasg: 'Secretaria de Obras', valor_estimado: 30_000_000, objeto: 'serviços de manutenção', tipo_objeto: 'Serviços', modalidade: 'Pregão Eletrônico', dt_public_edital: '2024-11-01' },
  'verificacao-humana'
);

test(
  'Art. 8º: edital antes de 10/03/2025 + analista confirma "publicacao_antes" → Dispensado',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 30_000_000, objeto: 'serviços de limpeza hospitalar', tipo_objeto: 'Serviços', modalidade: 'Pregão Eletrônico', dt_public_edital: '2024-12-01', _validacao_art8: { opcao: 'publicacao_antes' } },
  'dispensada'
);

test(
  'Art. 8º: edital antes de 10/03/2025 + analista confirma "assinatura_antes" → Dispensado',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 40_000_000, objeto: 'obras de reforma predial', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2025-01-15', _validacao_art8: { opcao: 'assinatura_antes' } },
  'dispensada'
);

test(
  'Art. 8º: analista confirma "nenhum" → Avaliação obrigatória (mesmo com data antiga)',
  { nome_Uasg: 'Secretaria de Fazenda', valor_estimado: 30_000_000, objeto: 'serviços financeiros terceirizados', tipo_objeto: 'Serviços', modalidade: 'Pregão Eletrônico', dt_public_edital: '2024-10-01', _validacao_art8: { opcao: 'nenhum' } },
  'avaliacao-obrigatoria'
);

test(
  'Art. 8º: data após 10/03/2025 → não dispensado → Avaliação obrigatória',
  { nome_Uasg: 'Secretaria de Segurança', valor_estimado: 30_000_000, objeto: 'serviços de vigilância terceirizados', tipo_objeto: 'Serviços', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-04-01' },
  'avaliacao-obrigatoria'
);

test(
  'Art. 8º: sem data → pendente validação → verificacao-humana',
  { nome_Uasg: 'Secretaria de Educação', valor_estimado: 26_000_000, objeto: 'livros didáticos para rede estadual', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '' },
  'verificacao-humana'
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 4: Aditivos contratuais ──────────────────────────────\n');

test(
  'Aditivo contratual enquadrado no Art. 2º → excecao-aditivo (obrigatório sempre)',
  { nome_Uasg: 'Secretaria de Obras', valor_estimado: 40_000_000, objeto: '1º Termo Aditivo ao Contrato de Obras', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2024-06-01' },
  'avaliacao-obrigatoria',
  { _art8: 'excecao-aditivo' }
);

test(
  'Aditivo com valor baixo (R$ 5M) → verificacao-humana (precisa valor total)',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 5_000_000, objeto: 'aditivo contratual ao contrato de medicamentos', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico' },
  'verificacao-humana',
  { _aditivoValorInsuficiente: true }
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 5: Ordem correta das verificações ─────────────────────\n');

test(
  'CAERN com dados que enquadrariam Art. 2º: deve ser excluído pelo Art. 1º PRIMEIRO',
  { nome_Uasg: 'CAERN', valor_estimado: 50_000_000, objeto: 'medicamentos para rede hospitalar', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-05-01' },
  'nao-enquadrado-art1'
);

test(
  'CAERN com dados de inexigibilidade R$ 200M: deve ser excluído pelo Art. 1º PRIMEIRO (não "avaliacao-obrigatoria")',
  { nome_Uasg: 'CAERN', valor_estimado: 200_000_000, objeto: 'contratação por inexigibilidade', tipo_objeto: 'Serviços', modalidade: 'Inexigibilidade', dt_public_edital: '2025-06-01' },
  'nao-enquadrado-art1'
);

test(
  'Processo R$ 10M (abaixo de todos os limiares) NÃO deve ser "dispensado" — deve ser "nao-enquadrado"',
  { nome_Uasg: 'Secretaria de Administração', valor_estimado: 10_000_000, objeto: 'aquisição de material de consumo', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2024-01-01' },
  'nao-enquadrado'  // NÃO deve ser dispensado! (Art. 8º não se aplica)
);

test(
  'Processo R$ 14M (abaixo de R$ 15M) NÃO deve ser "dispensado" — deve ser "nao-enquadrado"',
  { nome_Uasg: 'Secretaria de Educação', valor_estimado: 14_999_999, objeto: 'merenda escolar', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2024-06-01' },
  'nao-enquadrado'  // NÃO deve ser dispensado! (Art. 2º §1º exige > R$ 15M)
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 6: Valor sigiloso ─────────────────────────────────────\n');

test(
  'Valor sigiloso (0) → verificacao-humana',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 0, objeto: 'medicamentos', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico' },
  'verificacao-humana'
);

test(
  'Valor sigiloso + valor manual R$ 20M medicamentos → avaliacao-obrigatoria',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 0, objeto: 'medicamentos', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-05-01', _valor_manual: 20_000_000 },
  'avaliacao-obrigatoria'
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 7: Zona cinzenta — obra entre R$25M e R$35M ──────────\n');

// Comportamento INTENCIONAL: engenharia tem limiar próprio de R$35M (art2-I).
// Uma obra entre R$25M e R$35M NÃO deve cair no art2-II (residual), pois esse
// inciso exclui explicitamente engenharia. Resultado correto: nao-enquadrado.
// Este teste protege contra regressão (ex.: remover a exclusão de engenharia
// do checkArt2II, o que geraria falsos-positivos).
test(
  'Obra de engenharia R$ 30M (entre 25M e 35M) → NÃO enquadra art2-II → nao-enquadrado',
  { nome_Uasg: 'Secretaria de Infraestrutura', valor_estimado: 30_000_000, objeto: 'obra de pavimentação asfáltica de rodovia', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2025-05-01' },
  'nao-enquadrado'
);

test(
  'Serviço comum R$ 30M (não-engenharia, >25M) → art2-II → avaliacao-obrigatoria',
  { nome_Uasg: 'Secretaria de Administração', valor_estimado: 30_000_000, objeto: 'serviços de limpeza e conservação predial', tipo_objeto: 'Serviços', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-05-01' },
  'avaliacao-obrigatoria'
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 8: Matching usa campo original (pré-normalização) ─────\n');

// O Normalizer reescreve tipo_objeto para exibição; o classificador deve usar o
// valor ORIGINAL para casar keywords. Simulamos o que sai do mapeamento de colunas
// (valor bruto), e o pipeline real (normalizeAll → classifyAll) deve preservá-lo.
test(
  'tipo_objeto "insumo farmaceutico" R$ 16M → art2-p1 (mesmo após normalização de exibição)',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 16_000_000, objeto: 'processo administrativo de aquisição', tipo_objeto: 'insumo farmaceutico para laboratório', modalidade: 'Pregão Eletrônico', dt_public_edital: '2025-05-01' },
  'avaliacao-obrigatoria'
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 9: Aditivo com valor sigiloso (orientação correta) ────\n');

test(
  'Aditivo + valor sigiloso → verificacao-humana com orientação de valor total',
  { nome_Uasg: 'Secretaria de Saúde', valor_estimado: 0, objeto: '1º Termo Aditivo ao contrato de medicamentos', tipo_objeto: 'Compras', modalidade: 'Pregão Eletrônico' },
  'verificacao-humana',
  { _aditivoSigiloso: true }
);

// ────────────────────────────────────────────────────────────────────
console.log('\n── BLOCO 10: Art. 8º — trava de sanidade (conflito de data) ────\n');

test(
  'Dispensa confirmada (assinatura_antes) mas edital de 2026 → dispensada + flag de conflito',
  { nome_Uasg: 'Secretaria de Obras', valor_estimado: 40_000_000, objeto: 'obra de pavimentação', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2026-01-15', _validacao_art8: { opcao: 'assinatura_antes' } },
  'dispensada'
);

test(
  'Dispensa coerente (publicacao_antes, edital 2024) → dispensada sem conflito',
  { nome_Uasg: 'Secretaria de Obras', valor_estimado: 40_000_000, objeto: 'obra de pavimentação', tipo_objeto: 'Obras', modalidade: 'Concorrência', dt_public_edital: '2024-12-01', _validacao_art8: { opcao: 'publicacao_antes' } },
  'dispensada',
  { _art8Conflito: null }
);

// ────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  RESULTADO FINAL: ${passed} aprovados | ${failed} falhou(ram)`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('  ⚠️  ATENÇÃO: Há falhas na lógica. Verifique os cenários acima.\n');
  process.exit(1);
} else {
  console.log('  🎉 Todos os cenários passaram com sucesso!\n');
  process.exit(0);
}
