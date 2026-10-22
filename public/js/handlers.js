
'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 1 — FILTROS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica todos os filtros ativos (card, texto, dropdowns, faixa de valor)
 * ao dataset completo e renderiza a tabela resultante.
 */
function applyFilters() {
  const search    = DOM.searchInput.value.toLowerCase().trim();
  const modVal    = DOM.filterModalidade.value;
  const tipoVal   = DOM.filterTipoObj.value;
  const uasgVal   = DOM.filterUasg.value;
  const valMin    = (parseFloat(DOM.filterValorMin.value) || 0) * 1_000_000;
  const valMax    = DOM.filterValorMax.value ? parseFloat(DOM.filterValorMax.value) * 1_000_000 : Infinity;
  const statusVal = DOM.filterStatus ? DOM.filterStatus.value : '';
  const filter    = State.activeFilter;

  State.filteredData = State.allData.filter(row => {

    // ── Regra de ciclo: registros FINALIZADOS saem da fila de trabalho ────
    // Uma busca explícita ainda encontra o processo, senão o número parece inexistente.
    if (!search && window.Ciclos && Ciclos.ativo()) {
      if (Ciclos.statusDe(row._uid) === 'FINALIZADO') return false;
    }

    // ── Filtro pelo card de status ativo ──────────────────────────────────
    // [v5.3] filter=null → sem filtro de card (mostra todos os registros)
    if (filter) {
      if      (filter === 'avaliacao-obrigatoria' && row._statusFinal !== 'avaliacao-obrigatoria') return false;
      else if (filter === 'dispensada'            && row._statusFinal !== 'dispensada')            return false;
      else if (filter === 'verificacao-humana'    && row._statusFinal !== 'verificacao-humana')    return false;
      else if (filter === 'nao-enquadrado-art1'   && row._statusFinal !== 'nao-enquadrado-art1') return false;
      else if (filter === 'nao-enquadrado'        && row._statusFinal !== 'nao-enquadrado' && row._statusFinal !== 'nao-enquadrado-art1') return false;
      // Cards do Art. 2º refletem a fila ATIVA: interrompidos saíram de escopo e
      // não aparecem aqui (coerente com getCounts), apesar de _reasons preservado.
      else if (filter === 'all-art2'              && (!row._requerAlice || row._interrompido))     return false;
      else if (filter === 'art2-I'               && (!row._reasons.includes('art2-I')  || row._interrompido)) return false;
      else if (filter === 'art2-II'              && (!row._reasons.includes('art2-II') || row._interrompido)) return false;
      else if (filter === 'art2-p1'              && (!row._reasons.includes('art2-p1') || row._interrompido)) return false;
      else if (filter === 'art2-p2'              && (!row._reasons.includes('art2-p2') || row._interrompido)) return false;
    }

    // ── Filtro dropdown de status ─────────────────────────────────────────
    if (statusVal && row._statusFinal !== statusVal) return false;

    // ── Busca textual (edital, UASG, objeto, processo, modalidade, código) ─
    // Números de processo vêm como 00110033.000251/2025-71. A busca sem o ponto
    // (00110033000251/2025-71) também precisa encontrar o mesmo registro.
    if (search) {
      const hay = [
        row.numero_ano_edital, row.nome_Uasg, row.objeto,
        row.processo, row.modalidade, row.codigoUasg,
      ].join(' ').toLowerCase();
      const compact = s => String(s || '').replace(/[^a-z0-9]/g, '');
      const buscaCompacta = compact(search);
      const achouTexto = hay.includes(search);
      const achouNumero = buscaCompacta.length >= 4 && compact(hay).includes(buscaCompacta);
      if (!achouTexto && !achouNumero) return false;
    }

    // ── Filtros de dropdown ───────────────────────────────────────────────
    if (modVal  && row.modalidade  !== modVal)  return false;
    if (tipoVal && row.tipo_objeto !== tipoVal) return false;
    if (uasgVal && row.nome_Uasg   !== uasgVal) return false;

    // ── Faixa de valor ────────────────────────────────────────────────────
    const v = Classifier.getEffectiveValue(row);
    if (valMin > 0 && v < valMin) return false;
    if (valMax < Infinity && v > valMax) return false;

    return true;
  });

  State.currentPage = 1;
  renderTable(); // ui.js
}

/**
 * Limpa todos os filtros e reaplica (mostra todos os registros
 * do filtro de card ativo).
 */
function clearFilters() {
  DOM.searchInput.value      = '';
  DOM.filterModalidade.value = '';
  DOM.filterTipoObj.value    = '';
  DOM.filterUasg.value       = '';
  DOM.filterValorMin.value   = '';
  DOM.filterValorMax.value   = '';
  if (DOM.filterStatus) DOM.filterStatus.value = '';
  if (State.activeFilter) {
    setActiveFilter(null);
    return;
  }
  applyFilters();
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 2 — PAGINAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Navega para a página indicada e rola a viewport até a tabela.
 * @param {number} p — número da página (base 1)
 */
function changePage(p) {
  State.currentPage = p;
  renderTable(); // ui.js
  const tableTop = document.querySelector('.table-section')?.offsetTop ?? 0;
  window.scrollTo({ top: tableTop - 90, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 3 — RECLASSIFICAÇÃO APÓS MUDANÇA MANUAL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reclassifica uma linha após entrada manual do analista
 * (valor, data de referência ou validação do Art. 8º).
 *
 * Ordem: Art. 1º → Art. 2º → Art. 8º → status final.
 * @param {Object} row — linha do dataset (mutada in-place)
 */
/**
 * Persiste as anotações do analista de uma linha no Supabase (se ativo).
 * Chamado após QUALQUER mutação manual. Debounced internamente por _uid.
 * @param {Object} row
 */
function _persistRow(row) {
  if (window.Supa && Supa.isReady()) Supa.salvarLinha(row);
}

/**
 * Sincroniza o ESTADO DO CICLO de um registro com o estado real da análise,
 * de forma idempotente e centralizada (fonte única de verdade do fluxo).
 *
 * Regra de derivação do estado-alvo, a partir do registro já reclassificado:
 *   - não é mais obrigatório (saiu de escopo, interrompido, etc.) → PENDENTE
 *     (sai da contagem de "em análise/validado"; se reentrar, recomeça limpo)
 *   - obrigatório COM questionário completo                       → VALIDADO
 *   - obrigatório SEM questionário, modal aberto                  → EM_ANALISE
 *
 * Só transiciona quando o estado-alvo difere do atual, e nunca mexe em
 * registros já FINALIZADOS (o back-end também bloqueia, mas evitamos o request).
 *
 * @param {Object} row
 * @param {{abrindo?: boolean}} [opts] — abrindo=true sinaliza que o modal acabou
 *        de ser aberto (permite a transição PENDENTE → EM_ANALISE).
 * @returns {Promise<void>}
 */
async function _sincronizarCiclo(row, opts) {
  if (!(window.Ciclos && Ciclos.ativo() && row && row._uid)) return;

  const atual = Ciclos.statusDe(row._uid);
  if (atual === 'FINALIZADO') return;   // terminal: nada a fazer

  const obrigatorio = row._statusFinal === 'avaliacao-obrigatoria';
  const questionarioCompleto = !!(row._avaliacao_obrig_dados &&
    row._avaliacao_obrig_dados.contrato_interrompido === 'nao' &&
    row._avaliacao_obrig_dados.categoria &&
    row._avaliacao_obrig_dados.valor_adjudicacao &&
    row._avaliacao_obrig_dados.contrato_assinado);

  let alvo;
  if (!obrigatorio) {
    // Deixou de ser obrigatório: precisa sair de VALIDADO/EM_ANALISE.
    // O back-end só permite VALIDADO → EM_ANALISE (não VALIDADO → PENDENTE),
    // então damos o passo legal: de VALIDADO recua para EM_ANALISE; de
    // EM_ANALISE recua para PENDENTE. Em chamadas seguintes converge a PENDENTE.
    if (atual === 'VALIDADO')      alvo = 'EM_ANALISE';
    else                            alvo = 'PENDENTE';
  } else if (questionarioCompleto) {
    alvo = 'VALIDADO';
  } else if (opts && opts.abrindo) {
    alvo = 'EM_ANALISE';
  } else {
    // Obrigatório, sem questionário e sem evento de abertura: preserva o
    // estado atual (ex.: já estava EM_ANALISE) em vez de forçar regressão.
    return;
  }

  if (alvo === atual) return;

  try {
    await Ciclos.transicionar(row._uid, alvo);
    // Caso de saída de escopo a partir de VALIDADO: o primeiro passo levou a
    // EM_ANALISE; encadeia o segundo passo até PENDENTE para convergir agora.
    if (!obrigatorio && alvo === 'EM_ANALISE') {
      await Ciclos.transicionar(row._uid, 'PENDENTE');
    }
    if (typeof renderCiclosDashboard === 'function') renderCiclosDashboard();
    // O badge de estágio na fila lê Ciclos.statusDe(); reaplica para refletir
    // a transição recém-feita sem o analista precisar recarregar.
    if (typeof applyFilters === 'function') applyFilters();
  } catch (e) {
    console.error('[Ciclos] Falha ao sincronizar estado do ciclo:', e.message || e);
  }
}

function _reclassifyRow(row) {
  // Delega para a FONTE ÚNICA DE VERDADE do ciclo de classificação por linha
  // (Art. 1º → Art. 2º → Art. 8º → status final), a mesma usada por
  // Classifier.classifyAll na carga inicial. Isso garante que a reclassificação
  // após entrada manual do analista (valor, data de referência, validação do
  // Art. 8º) siga EXATAMENTE as mesmas regras da carga inicial — sem risco de
  // divergência entre os dois caminhos.
  return Classifier.classifyRowFull(row);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 4 — VALOR MANUAL (orçamento sigiloso) — ETAPA 1
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica o valor digitado no input inline da célula da tabela.
 * Implementa a Etapa 1: após aplicar o valor, o sistema dispara Etapa 2 (Art. 2º).
 * @param {number} globalIdx — índice em State.filteredData
 */
function applyManualValue(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const input = document.getElementById(`valorInput_${globalIdx}`);
  if (!input) return;

  const val = parseFloat(input.value);
  if (!val || val <= 0) {
    input.classList.add('input-error');
    input.focus();
    setTimeout(() => input.classList.remove('input-error'), 1800);
    showToast('Informe um valor numérico positivo.', 'error', 2500);
    return;
  }

  row._valor_manual = val;
  _persistRow(row);
  _reclassifyRow(row);
  _updateAllStats(); // ui.js
  applyFilters();
  _refreshAnalyticsIfActive();
  showToast(
    `Valor R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} aplicado — registro reclassificado.`,
    'success'
  );
}

/**
 * Remove o valor manual informado, devolvendo o registro ao estado sigiloso.
 * @param {number} globalIdx
 */
function clearManualValue(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;
  delete row._valor_manual;
  _persistRow(row);
  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();
  showToast('Valor manual removido — registro voltou para sigiloso.', 'info');
}

/**
 * Aplica o valor digitado no input do modal.
 * Reabre o modal se o registro permanecer na lista filtrada;
 * caso contrário, fecha e exibe toast informando a mudança de categoria.
 * @param {number} globalIdx
 */
function applyManualValueFromModal(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const input = document.getElementById('modalValorInput');
  if (!input) return;

  const val = parseFloat(input.value);
  if (!val || val <= 0) {
    input.classList.add('input-error');
    input.focus();
    setTimeout(() => input.classList.remove('input-error'), 1800);
    showToast('Informe um valor numérico positivo.', 'error', 2500);
    return;
  }

  row._valor_manual = val;
  _persistRow(row);
  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  const label  = `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const newIdx = State.filteredData.indexOf(row);
  if (newIdx !== -1) {
    openModal(newIdx); // ui.js
    showToast(`Valor ${label} aplicado — registro reclassificado.`, 'success');
  } else {
    closeModal(); // ui.js
    showToast(`Valor ${label} aplicado — registro movido para outra categoria.`, 'success', 5000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 5 — VALIDAÇÃO ART. 8º (bloco de 4 opções) — ETAPA 2
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica a validação manual do Art. 8º a partir das 4 opções do bloco.
 *
 * Lógica de status final baseada na opção selecionada:
 *   assinatura_antes | publicacao_antes | inicio_antes → 'dispensada'
 *   nenhum                                             → 'avaliacao-obrigatoria'
 *   info_nao_disponivel                                → 'verificacao-humana' (sem-data)
 *
 * @param {number} globalIdx — índice em State.filteredData
 */
function applyArt8Validation(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const radioChecked = document.querySelector('input[name="art8ValidationOpcao"]:checked');
  if (!radioChecked) {
    showToast('Selecione uma das opções antes de aplicar.', 'error', 2500);
    return;
  }

  const opcao = radioChecked.value;
  row._validacao_art8 = { opcao, ts: Date.now() };
  _persistRow(row);

  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  // Mensagem contextual por opção
  const mensagens = {
    assinatura_antes: 'Dispensado — assinatura do contrato confirmada antes de 10/03/2025.',
    publicacao_antes: 'Dispensado — publicação do edital confirmada antes de 10/03/2025.',
    inicio_antes:     'Dispensado — início da dispensa/inexigibilidade confirmado antes de 10/03/2025.',
    nenhum:           'Avaliação Obrigatória — nenhum evento anterior a 10/03/2025 confirmado.',
    info_nao_disponivel: 'Pendente — informação não disponível. Registro permanece em verificação.',
  };

  const msg     = mensagens[opcao] || 'Validação aplicada.';
  const tipo    = (opcao === 'nenhum' || opcao === 'info_nao_disponivel') ? 'info' : 'success';
  const newIdx  = State.filteredData.indexOf(row);

  if (newIdx !== -1) {
    openModal(newIdx); // ui.js — reabre modal atualizado
    showToast(msg, tipo, 5000);
  } else {
    closeModal();
    showToast(`${msg} — Registro movido para outra categoria.`, tipo, 5000);
  }
}

/**
 * Remove a validação manual do Art. 8º e reclassifica o registro.
 * O status volta para 'verificacao-humana' (pendente-validacao).
 * @param {number} globalIdx
 */
function clearArt8Validation(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;
  delete row._validacao_art8;
  _persistRow(row);
  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  const newIdx = State.filteredData.indexOf(row);
  if (newIdx !== -1) {
    openModal(newIdx);
    showToast('Validação do Art. 8º removida — registro volta para pendente.', 'info');
  } else {
    closeModal();
    showToast('Validação do Art. 8º removida — registro reclassificado.', 'info');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 6 — DATA DE REFERÊNCIA MANUAL (complementar ao Art. 8º)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica uma data de referência programaticamente (ex.: chamada via API pública).
 * Nota: a data manual agora serve apenas como contexto informacional;
 * a dispensa pelo Art. 8º requer o bloco de validação de 4 opções.
 * @param {number} globalIdx
 * @param {string} tipo     — chave de DATA_REF_TIPOS
 * @param {string} dataISO  — data no formato ISO ou DD/MM/YYYY
 * @param {string} fonte    — texto livre de origem da data (opcional)
 */
function applyManualDate(globalIdx, tipo, dataISO, fonte) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const isoNorm = Classifier.normalizeDateToISO(dataISO);
  if (!isoNorm) {
    showToast('Data inválida. Verifique mês e dia.', 'error', 3000);
    return;
  }

  row._data_referencia_manual = { tipo, data: isoNorm, fonte: (fonte || '').trim() };
  _persistRow(row);
  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  const tipoLabel = DATA_REF_TIPOS[tipo] || tipo;
  const dataFmt   = isoNorm.split('-').reverse().join('/');
  showToast(
    `Data de referência aplicada (${tipoLabel}: ${dataFmt}) — registro reclassificado.`,
    'success', 4000
  );
}

/**
 * Lê os campos do formulário de data no modal e aplica a data de referência.
 * @param {number} globalIdx
 */
function applyManualDateFromModal(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const inputDate  = document.getElementById('modalDataRefInput');
  const inputFonte = document.getElementById('modalDataRefFonte');
  const tipoRadio  = document.querySelector('input[name="modalDataRefTipo"]:checked');
  if (!inputDate || !tipoRadio) return;

  const dataISO = inputDate.value;
  const tipo    = tipoRadio.value;
  const fonte   = inputFonte ? inputFonte.value : '';

  if (!dataISO) {
    inputDate.classList.add('input-error');
    inputDate.focus();
    setTimeout(() => inputDate.classList.remove('input-error'), 1800);
    showToast('Selecione uma data válida.', 'error', 2500);
    return;
  }

  const isoNorm = Classifier.normalizeDateToISO(dataISO);
  if (!isoNorm) {
    inputDate.classList.add('input-error');
    showToast('Data inválida. Verifique mês e dia.', 'error', 3000);
    return;
  }

  row._data_referencia_manual = { tipo, data: isoNorm, fonte: (fonte || '').trim() };
  _persistRow(row);
  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  const newIdx = State.filteredData.indexOf(row);
  if (newIdx !== -1) {
    openModal(newIdx); // ui.js
  } else {
    closeModal(); // ui.js
    const tipoLabel = DATA_REF_TIPOS[tipo] || tipo;
    const dataFmt   = isoNorm.split('-').reverse().join('/');
    showToast(
      `Data aplicada (${tipoLabel}: ${dataFmt}) — registro movido para outra categoria.`,
      'success', 5000
    );
  }
}

/**
 * Remove a data de referência manual e reclassifica.
 * @param {number} globalIdx
 */
function clearManualDate(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;
  delete row._data_referencia_manual;
  _persistRow(row);
  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();
  showToast('Data de referência removida — registro reclassificado.', 'info');
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO — CONTRATO ASSINADO (inline na tabela)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Registra a resposta "O contrato já foi assinado?" para o registro
 * e re-renderiza apenas a linha afetada na tabela.
 * @param {number} globalIdx
 * @param {'sim'|'nao'} valor
 */
function applyContratoAssinado(globalIdx, valor) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  row._contrato_assinado = valor;
  _persistRow(row);

  _refreshTableRow(globalIdx);

  const msg = valor === 'sim'
    ? 'Contrato marcado como assinado.'
    : 'Contrato marcado como não assinado.';
  showToast(msg, 'success', 2500);
}

/**
 * Alterna a resposta entre 'sim' e 'nao' (clique no badge já respondido).
 * @param {number} globalIdx
 */
function toggleContratoAssinado(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const atual = row._contrato_assinado;
  const novo  = atual === 'sim' ? 'nao' : 'sim';
  applyContratoAssinado(globalIdx, novo);
}

/**
 * Remove a resposta "O contrato já foi assinado?" do registro.
 * @param {number} globalIdx
 */
function clearContratoAssinado(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  delete row._contrato_assinado;
  _persistRow(row);
  _refreshTableRow(globalIdx);
  showToast('Resposta de contrato removida.', 'info', 2500);
}

/**
 * Re-renderiza a <tr> de um registro específico sem re-renderizar
 * a tabela inteira (evita perda de scroll/foco).
 * @param {number} globalIdx
 */
function _refreshTableRow(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  // Localiza o <tr> pelo botão de detalhe (atributo onclick único)
  const tbody = DOM.tableBody;
  if (!tbody) return;

  const trs = tbody.querySelectorAll('tr');
  for (const tr of trs) {
    const btn = tr.querySelector(`.btn-detail[onclick="App.openModal(${globalIdx})"]`);
    if (btn) {
      // [FIX] Usa insertAdjacentHTML + remove() em vez de outerHTML assignment
      // para garantir que o novo <tr> seja inserido corretamente no DOM.
      const newRowHtml = _buildTableRow(row, globalIdx);
      tr.insertAdjacentHTML('afterend', newRowHtml);
      tr.remove();
      return;
    }
  }
  // Fallback: re-renderiza a tabela completa (raro)
  renderTable();
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 7 — OBSERVAÇÕES MANUAIS DO ANALISTA
   Permite ao analista registrar anotações livres por processo.
   Essas observações são exportadas no PDF e no CSV.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica a observação manual digitada no textarea do modal.
 * @param {number} globalIdx — índice em State.filteredData
 */
function applyObservacaoManual(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  const textarea = document.getElementById('modalObservacaoInput');
  if (!textarea) return;

  const texto = textarea.value.trim();
  if (!texto) {
    textarea.classList.add('input-error');
    textarea.focus();
    setTimeout(() => textarea.classList.remove('input-error'), 1800);
    showToast('Digite uma observação antes de salvar.', 'error', 2500);
    return;
  }

  row._observacao_manual = texto;
  _persistRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  const newIdx = State.filteredData.indexOf(row);
  if (newIdx !== -1) {
    openModal(newIdx);
    showToast('Observação salva com sucesso.', 'success', 3000);
  } else {
    closeModal();
    showToast('Observação salva.', 'success', 3000);
  }
}

/**
 * Remove a observação manual do registro.
 * @param {number} globalIdx
 */
function clearObservacaoManual(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;
  delete row._observacao_manual;
  _persistRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();
  const newIdx = State.filteredData.indexOf(row);
  if (newIdx !== -1) {
    openModal(newIdx);
    showToast('Observação removida.', 'info', 2500);
  } else {
    closeModal();
    showToast('Observação removida.', 'info', 2500);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 8 — QUESTIONÁRIO AVALIAÇÃO OBRIGATÓRIA
   Perguntas adicionais exibidas no modal apenas para processos classificados
   como "Avaliação Obrigatória". Respostas exportadas no PDF e CSV.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica as respostas do questionário de Avaliação Obrigatória.
 * Lê os radio buttons e textarea do modal e salva em row._avaliacao_obrig_dados.
 * @param {number} globalIdx — índice em State.filteredData
 */
function applyAvaliacaoObrigatoria(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;

  // 1. Contrato interrompido (PRIMEIRA PERGUNTA — decide o fluxo)
  const intRadio = document.querySelector('input[name="avalObrigInterrompido"]:checked');
  if (!intRadio) {
    showToast('Informe se o contrato foi interrompido (pergunta 1).', 'error', 3000);
    return;
  }

  // ── FLUXO A: Contrato INTERROMPIDO → apenas motivo, depois fora do escopo ──
  if (intRadio.value === 'sim') {
    const motivoInput = document.getElementById('avalObrigMotivoInput');
    const motivo = motivoInput ? motivoInput.value.trim() : '';
    if (!motivo) {
      if (motivoInput) {
        motivoInput.classList.add('input-error');
        motivoInput.focus();
        setTimeout(() => motivoInput.classList.remove('input-error'), 1800);
      }
      showToast('Informe o motivo da interrupção do contrato (pergunta 2).', 'error', 3000);
      return;
    }

    // Salva apenas os dados de interrupção (demais perguntas não se aplicam)
    row._avaliacao_obrig_dados = {
      contrato_interrompido:  'sim',
      motivo_interrupcao:     motivo,
      categoria:              '',
      valor_adjudicacao:      '',
      contrato_assinado:      '',
      ts:                     Date.now(),
    };
    _persistRow(row);

    // Reclassifica → status final será 'nao-enquadrado' (fora do escopo)
    _reclassifyRow(row);
    _updateAllStats();
    applyFilters();
    _refreshAnalyticsIfActive();

    // Ciclo: saiu de escopo → recua o estado do ciclo (não fica como validado).
    _sincronizarCiclo(row);

    const newIdx = State.filteredData.indexOf(row);
    if (newIdx !== -1) {
      openModal(newIdx);
      showToast('Contrato interrompido — processo direcionado para fora do escopo.', 'success', 5000);
    } else {
      closeModal();
      showToast('Contrato interrompido — processo movido para "Fora do Escopo".', 'success', 5000);
    }
    return;
  }

  // ── FLUXO B: Contrato NÃO interrompido → exige todas as perguntas ──────────
  // 2. Categoria do processo
  const catRadio = document.querySelector('input[name="avalObrigCategoria"]:checked');
  if (!catRadio) {
    showToast('Selecione a categoria do processo (pergunta 2).', 'error', 3000);
    return;
  }

  // 3. Valor de adjudicação
  const adjRadio = document.querySelector('input[name="avalObrigAdjudicacao"]:checked');
  if (!adjRadio) {
    showToast('Informe se existe valor de adjudicação (pergunta 3).', 'error', 3000);
    return;
  }

  // 4. Contrato assinado
  const ctrRadio = document.querySelector('input[name="avalObrigContratoAssinado"]:checked');
  if (!ctrRadio) {
    showToast('Informe se o contrato já foi assinado (pergunta 4).', 'error', 3000);
    return;
  }

  // Salva os dados — fluxo normal completo
  row._contrato_assinado = ctrRadio.value;
  row._avaliacao_obrig_dados = {
    contrato_interrompido:  'nao',
    motivo_interrupcao:     '',
    categoria:              catRadio.value,
    valor_adjudicacao:      adjRadio.value,
    contrato_assinado:      ctrRadio.value,
    ts:                     Date.now(),
  };
  _persistRow(row);

  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  // ── Ciclo: sincroniza o estado do ciclo após salvar o questionário ───────
  // Se o registro continua obrigatório e o questionário está completo, o helper
  // o leva a VALIDADO; se a reclassificação o tirou de escopo, recua o ciclo.
  _sincronizarCiclo(row);

  const newIdx = State.filteredData.indexOf(row);
  if (newIdx !== -1) {
    openModal(newIdx);
    showToast('Questionário de Avaliação Obrigatória salvo com sucesso.', 'success', 4000);
  } else {
    closeModal();
    showToast('Questionário salvo — registro movido para outra categoria.', 'success', 5000);
  }
}

/**
 * Remove as respostas do questionário de Avaliação Obrigatória e reabre o modal.
 * @param {number} globalIdx
 */
function clearAvaliacaoObrigatoria(globalIdx) {
  const row = State.filteredData[globalIdx];
  if (!row) return;
  delete row._avaliacao_obrig_dados;
  _persistRow(row);
  row._interrompido = false;
  _reclassifyRow(row);
  _updateAllStats();
  applyFilters();
  _refreshAnalyticsIfActive();

  // Ciclo: o questionário foi apagado, então um registro antes VALIDADO não pode
  // continuar validado. O helper recua o estado (VALIDADO → EM_ANALISE),
  // corrigindo o descompasso entre o front e o back-end.
  _sincronizarCiclo(row);

  const newIdx = State.filteredData.indexOf(row);
  if (newIdx !== -1) {
    openModal(newIdx);
    showToast('Questionário de Avaliação Obrigatória removido.', 'info', 3000);
  } else {
    closeModal();
    showToast('Questionário removido.', 'info', 3000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEÇÃO 9 — ATUALIZAÇÃO EM TEMPO REAL DO PAINEL ANALÍTICO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Atualiza o painel de Análise de Dados em tempo real se a aba estiver ativa.
 * Chamado após qualquer ação que altere o status de um registro.
 */
function _refreshAnalyticsIfActive() {
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab && activeTab.dataset.tab === 'analytics') {
    try { renderAnalytics(); } catch (e) { console.warn('[Analytics refresh]', e); }
  }
}
