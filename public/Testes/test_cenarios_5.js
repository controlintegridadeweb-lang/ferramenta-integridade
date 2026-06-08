'use strict';

/**
 * ════════════════════════════════════════════════════════════════════
 *  CINCO CENÁRIOS DE VALIDAÇÃO PARA TESTES — Decreto Estadual 34.196/2024
 *  Ferramenta de Conformidade / Avaliação de Integridade
 *
 *  Cada cenário cobre um caso representativo da lógica completa:
 *    Cenário A — Órgão excluído pelo Art. 1º (CAERN, sigla direta)
 *    Cenário B — Órgão excluído pelo Art. 1º (detecção por keyword)
 *    Cenário C — Enquadrado no Art. 2º, §2º + dispensado pelo Art. 8º
 *    Cenário D — Enquadrado no Art. 2º, I (obras) + Art. 8º obrigatório
 *    Cenário E — Não enquadrado no Art. 2º (valor abaixo de todos os limiares)
 *
 *  Execute: node test_cenarios_5.js
 * ════════════════════════════════════════════════════════════════════
 */

// ── Carregar módulos REAIS de produção (Classifier + Normalizer) ─────────────
// Usa o carregador comum, que avalia js/classifier.js e js/normalizer.js em um
// sandbox Node sem alterá-los nem gravar arquivos temporários.
const { Classifier, Normalizer } = require('./_load_real_modules.js');

// ── Utilitários ──────────────────────────────────────────────────────────────
const PASS  = ' PASSOU';
const FAIL  = ' FALHOU';
let   total = 0, passed = 0;

function assert(label, condition, got, expected) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ${PASS} — ${label}`);
    console.log(`         Status obtido : ${JSON.stringify(got)}`);
  } else {
    console.log(`  ${FAIL} — ${label}`);
    console.log(`         Esperado      : ${JSON.stringify(expected)}`);
    console.log(`         Obtido        : ${JSON.stringify(got)}`);
  }
}

function classify(row) {
  const data = [row];
  Normalizer.normalizeAll(data);   // espelha o pipeline real de io.js
  Classifier.classifyAll(data);
  return data[0];
}

// ════════════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  CINCO CENÁRIOS SIMULADOS — Decreto Estadual 34.196/2024');
console.log('═══════════════════════════════════════════════════════════════\n');

// ────────────────────────────────────────────────────────────────────
// CENÁRIO A — Órgão excluído pelo Art. 1º (sigla exata: CAERN)
// ────────────────────────────────────────────────────────────────────
console.log('── CENÁRIO A: Órgão excluído pelo Art. 1º (CAERN — sigla direta) ──');
console.log('   Contexto: Processo da CAERN, R$ 120.000.000, obra de engenharia,');
console.log('   edital publicado em 15/01/2025.');
console.log('   → Esperado: EXCLUÍDO pelo Art. 1º — não chega ao Art. 2º nem ao Art. 8º.\n');

const rowA = classify({
  nome_Uasg:       'CAERN',
  objeto:          'Construção de adutora — ampliação do sistema de abastecimento hídrico',
  tipo_objeto:     'Obra',
  modalidade:      'Concorrência',
  valor_estimado:  120_000_000,
  dt_public_edital: '15/01/2025',
  nat_despesa:     '449051',
});

assert(
  'Art. 1º BLOQUEIA — status deve ser nao-enquadrado-art1',
  rowA._statusFinal === 'nao-enquadrado-art1',
  rowA._statusFinal, 'nao-enquadrado-art1'
);
assert(
  'Art. 1º BLOQUEIA — Art. 2º NÃO deve ter sido processado (_requerAlice = false)',
  rowA._requerAlice === false,
  rowA._requerAlice, false
);
assert(
  'Art. 1º BLOQUEIA — Art. 8º NÃO deve ter sido processado (_art8 = nao-aplicavel)',
  rowA._art8 === 'nao-aplicavel',
  rowA._art8, 'nao-aplicavel'
);
assert(
  'Art. 1º — órgão identificado como excluído (_excluido_art1 = true)',
  rowA._excluido_art1 === true,
  rowA._excluido_art1, true
);
assert(
  'Art. 1º — motivo preenchido com nome do órgão',
  typeof rowA._motivoArt1 === 'string' && rowA._motivoArt1.includes('CAERN'),
  rowA._motivoArt1.slice(0, 80) + '…', 'deve conter "CAERN"'
);

// ────────────────────────────────────────────────────────────────────
// CENÁRIO B — Órgão excluído pelo Art. 1º (keyword: nome por extenso)
// ────────────────────────────────────────────────────────────────────
console.log('\n── CENÁRIO B: Órgão excluído pelo Art. 1º (keyword — nome por extenso) ──');
console.log('   Contexto: nome_Uasg = "Companhia Potiguar de Gás S.A.",');
console.log('   R$ 50.000.000, compra de equipamentos industriais.');
console.log('   → Esperado: EXCLUÍDO pelo Art. 1º (keyword "companhia potiguar de gas").\n');

const rowB = classify({
  nome_Uasg:       'Companhia Potiguar de Gás S.A.',
  objeto:          'Aquisição de medidores inteligentes de gás',
  tipo_objeto:     'Material',
  modalidade:      'Pregão Eletrônico',
  valor_estimado:  50_000_000,
  dt_public_edital: '20/04/2025',
});

assert(
  'Art. 1º — POTIGAS detectada por keyword → nao-enquadrado-art1',
  rowB._statusFinal === 'nao-enquadrado-art1',
  rowB._statusFinal, 'nao-enquadrado-art1'
);
assert(
  'Art. 1º — _excluido_art1 = true',
  rowB._excluido_art1 === true,
  rowB._excluido_art1, true
);
assert(
  'Art. 1º — Art. 2º não processado (nenhum reason)',
  rowB._reasons.length === 0,
  rowB._reasons, []
);
assert(
  'Art. 1º — motivo contém referência à POTIGAS',
  rowB._motivoArt1.includes('POTIGAS'),
  rowB._motivoArt1.slice(0, 80) + '…', 'deve conter "POTIGAS"'
);

// ────────────────────────────────────────────────────────────────────
// CENÁRIO C — Art. 2º (§2º inexigibilidade) + Art. 8º dispensado
// ────────────────────────────────────────────────────────────────────
console.log('\n── CENÁRIO C: Art. 2º §2º (inexigibilidade R$ 22M) + Art. 8º dispensado ──');
console.log('   Contexto: Secretaria de Saúde, inexigibilidade de R$ 22.000.000,');
console.log('   início do processo em 05/02/2025 (antes de 10/03/2025).');
console.log('   Analista confirma evento "inicio_antes".');
console.log('   → Esperado: Art. 1º OK → Art. 2º §2º ENQUADRADO → Art. 8º DISPENSADO.\n');

const rowC = classify({
  nome_Uasg:       'Secretaria de Estado da Saúde Pública — SESAP',
  objeto:          'Contratação de empresa especializada em serviços laboratoriais — inexigibilidade',
  tipo_objeto:     'Serviço',
  modalidade:      'Inexigibilidade',
  valor_estimado:  22_000_000,
  dt_public_edital: '05/02/2025',
  _validacao_art8: { opcao: 'inicio_antes' },  // analista confirma
});

assert(
  'Art. 1º — SESAP NÃO é excluída (pertence à admin. direta)',
  rowC._excluido_art1 === false,
  rowC._excluido_art1, false
);
assert(
  'Art. 2º — §2º inexigibilidade enquadra',
  rowC._reasons.includes('art2-p2'),
  rowC._reasons, ['art2-p2']
);
assert(
  'Art. 8º — dispensado (analista confirmou inicio_antes)',
  rowC._art8 === 'dispensado',
  rowC._art8, 'dispensado'
);
assert(
  'Status final = dispensada',
  rowC._statusFinal === 'dispensada',
  rowC._statusFinal, 'dispensada'
);

// ────────────────────────────────────────────────────────────────────
// CENÁRIO D — Art. 2º, I (obras R$ 80M) + Art. 8º NÃO dispensado
// ────────────────────────────────────────────────────────────────────
console.log('\n── CENÁRIO D: Art. 2º I (obra R$ 80M) + Art. 8º NÃO dispensado ──');
console.log('   Contexto: DER/RN, obra de pavimentação R$ 80.000.000,');
console.log('   edital publicado em 12/04/2025 (APÓS vigência do decreto).');
console.log('   → Esperado: Art. 1º OK → Art. 2º I ENQUADRADO → Art. 8º NÃO dispensado → OBRIGATÓRIO.\n');

const rowD = classify({
  nome_Uasg:       'Departamento de Estradas de Rodagem do RN — DER/RN',
  objeto:          'Obras de pavimentação e restauração da RN-117, trecho Mossoró-Apodi',
  tipo_objeto:     'Obra',
  modalidade:      'Concorrência',
  valor_estimado:  80_000_000,
  dt_public_edital: '12/04/2025',  // após 10/03/2025
  nat_despesa:     '449051',
});

assert(
  'Art. 1º — DER/RN NÃO é excluído',
  rowD._excluido_art1 === false,
  rowD._excluido_art1, false
);
assert(
  'Art. 2º — Inciso I (obra > R$ 35M)',
  rowD._reasons.includes('art2-I'),
  rowD._reasons, ['art2-I']
);
assert(
  'Art. 8º — vigente (edital após 10/03/2025)',
  rowD._art8 === 'vigente',
  rowD._art8, 'vigente'
);
assert(
  'Status final = avaliacao-obrigatoria',
  rowD._statusFinal === 'avaliacao-obrigatoria',
  rowD._statusFinal, 'avaliacao-obrigatoria'
);

// ────────────────────────────────────────────────────────────────────
// CENÁRIO E — Processo abaixo de todos os limiares (Não enquadrado)
// ────────────────────────────────────────────────────────────────────
console.log('\n── CENÁRIO E: Valor abaixo de todos os limiares → Não enquadrado ──');
console.log('   Contexto: SEJUCDH, compra de material de expediente R$ 4.000.000,');
console.log('   sem modalidade especial.');
console.log('   → Esperado: Art. 1º OK → Art. 2º NÃO enquadrado → sem Art. 8º.\n');

const rowE = classify({
  nome_Uasg:       'Secretaria de Estado da Justiça e Cidadania e Direitos Humanos — SEJUCDH',
  objeto:          'Aquisição de material de consumo — expediente e informática',
  tipo_objeto:     'Material',
  modalidade:      'Pregão Eletrônico',
  valor_estimado:  4_000_000,
  dt_public_edital: '01/06/2025',
});

assert(
  'Art. 1º — SEJUCDH NÃO é excluída',
  rowE._excluido_art1 === false,
  rowE._excluido_art1, false
);
assert(
  'Art. 2º — NENHUM inciso enquadra (valor R$ 4M abaixo de todos os limiares)',
  rowE._requerAlice === false && rowE._reasons.length === 0,
  { requerAlice: rowE._requerAlice, reasons: rowE._reasons },
  { requerAlice: false, reasons: [] }
);
assert(
  'Art. 8º — nao-aplicavel (Art. 2º não enquadrou)',
  rowE._art8 === 'nao-aplicavel',
  rowE._art8, 'nao-aplicavel'
);
assert(
  'Status final = nao-enquadrado',
  rowE._statusFinal === 'nao-enquadrado',
  rowE._statusFinal, 'nao-enquadrado'
);

// ════════════════════════════════════════════════════════════════════
// RESULTADO FINAL
// ════════════════════════════════════════════════════════════════════
const failed = total - passed;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  RESULTADO: ${passed} aprovados | ${failed} falhou(ram) | Total: ${total}`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (failed === 0) {
  console.log('   Todos os 5 cenários simulados passaram com sucesso!\n');
} else {
  console.log(`    ${failed} cenário(s) com falha — revise a lógica.\n`);
  process.exit(1);
}
