
'use strict';

const Classifier = (() => {

  // ── Thresholds (BRL) ─────────────────────────────────────────────────────────
  const THRESHOLD_I   = 35_000_000;   // Art. 2º, I  — Obras/Engenharia
  const THRESHOLD_II  = 25_000_000;   // Art. 2º, II — Serviços / Compras gerais
  const THRESHOLD_P1  = 15_000_000;   // §1º          — Objetos especiais
  const THRESHOLD_P2  = 15_000_000;   // §2º          — Modalidade especial

  // ── Data de vigência do Decreto ──────────────────────────────────────────────
  /**
   * Decreto publicado em 10/12/2024 (DOE Nº 15.809).
   * Art. 10: entra em vigor 90 dias após a publicação → 10/03/2025.
   * Vigência confirmada: 10/03/2025 (publicação 10/12/2024 + 90 dias corridos).
   */
  const DECREE_ENTRY_ISO = '2025-03-10';

  // ── Art. 1º — Órgãos excluídos do âmbito do Decreto ────────────────────────
  /**
   * Mapa de órgãos excluídos do âmbito do Decreto 34.196/2024 (Art. 1º).
   * São empresas públicas e sociedades de economia mista do Estado do RN
   * que NÃO pertencem à administração direta, autarquias ou fundações.
   *
   * Cada entrada contém:
   *   sigla     — identificador canônico (MAIÚSCULO, sem acento)
   *   nome      — nome oficial completo (para exibição ao analista)
   *   keywords  — termos (sem acento, lowercase) usados para detecção inteligente
   *               O sistema considera excluído se QUALQUER keyword estiver presente
   *               no campo nome_Uasg após normalização.
   *
   * DETECÇÃO INTELIGENTE:
   *   1. Sigla exata (campo nome_Uasg inteiro ou primeiro token, em MAIÚSCULO)
   *   2. Qualquer keyword presente no texto normalizado (sem acento, lowercase)
   *   Isso garante que variações como "CAERN - Companhia de Águas", "Cia. de Aguas",
   *   "companhia de aguas e esgotos do rn" etc. sejam todas identificadas.
   */
  const ORGAOS_EXCLUIDOS_MAP = [
    {
      sigla: 'AGN',
      nome: 'Agência de Fomento do Rio Grande do Norte (Desenvolve RN)',
      keywords: ['agn', 'agencia de fomento', 'desenvolve rn'],
    },
    {
      sigla: 'ARSEP',
      nome: 'Agência Reguladora de Serviços Públicos do RN',
      keywords: ['arsep', 'agencia reguladora de servicos publicos'],
    },
    {
      sigla: 'CAERN',
      nome: 'Companhia de Águas e Esgotos do Rio Grande do Norte',
      keywords: ['caern', 'companhia de aguas e esgotos', 'aguas e esgotos do rn'],
    },
    {
      sigla: 'CEASA',
      nome: 'Centrais de Abastecimento do Rio Grande do Norte',
      keywords: ['ceasa', 'centrais de abastecimento'],
    },
    {
      sigla: 'CEHAB',
      nome: 'Companhia Estadual de Habitação e Desenvolvimento Urbano',
      keywords: ['cehab', 'companhia estadual de habitacao'],
    },
    {
      sigla: 'DATANORTE',
      nome: 'Companhia de Processamento de Dados do Rio Grande do Norte',
      keywords: ['datanorte', 'processamento de dados do rn', 'companhia de processamento de dados'],
    },
    {
      sigla: 'EMGERN',
      nome: 'Empresa Gestora de Ativos do Rio Grande do Norte',
      keywords: ['emgern', 'gestora de ativos do rn', 'empresa gestora de ativos'],
    },
    {
      sigla: 'EMPARN',
      nome: 'Empresa de Pesquisa Agropecuária do Rio Grande do Norte',
      keywords: ['emparn', 'pesquisa agropecuaria do rn', 'empresa de pesquisa agropecuaria'],
    },
    {
      sigla: 'EMPROTUR',
      nome: 'Empresa Potiguar de Promoção Turística',
      keywords: ['emprotur', 'promocao turistica', 'empresa potiguar de promocao'],
    },
    {
      sigla: 'POTIGAS',
      nome: 'Companhia Potiguar de Gás',
      keywords: ['potigas', 'companhia potiguar de gas', 'potiguar de gas'],
    },
  ];

  // Set de siglas para lookup O(1) — gerado automaticamente a partir do map
  const ORGAOS_EXCLUIDOS_ART1 = new Set(ORGAOS_EXCLUIDOS_MAP.map(o => o.sigla));

  // ── Keyword sets ─────────────────────────────────────────────────────────────

  /**
   * Art. 2º, I — Obras e serviços de ENGENHARIA (valor > R$ 35.000.000)
   * NOTA: keywords devem estar SEM acentos (textOf() remove acentos antes de comparar)
   */
  const ENG_KEYWORDS = [
    'obra', 'obras', 'engenharia', 'construcao',
    'construcao civil',
    'reforma predial', 'reforma de edificio', 'reforma e ampliacao',
    'ampliacao',
    'pavimentacao', 'recapeamento', 'asfalt',
    'infraestrutura viaria', 'infraestrutura hidrica', 'infraestrutura urbana',
    'infraestrutura de saneamento', 'obras de infraestrutura',
    'barragem', 'ponte', 'pontes', 'viaduto', 'tunel',
    'galeria pluvial', 'galeria de aguas pluviais', 'bueiro',
    'saneamento', 'drenagem', 'esgot', 'abastecimento de agua',
    'adutora', 'reservatorio',
    'obras de fundacao', 'fundacao e estrutura', 'terraplanagem', 'escavacao',
    'aterro', 'contencao', 'arrimo',
    'restauracao predial', 'restauracao de edificio', 'restauracao de ponte',
    'recuperacao de pavimento', 'recuperacao de estrada', 'recuperacao de via',
    'recuperacao de barragem', 'recuperacao de ponte',
    'requalificacao', 'revitalizacao',
    'demolicao',
    'usina', 'subestacao', 'linha de transmissao',
    'rede eletrica',
    'edificacao', 'predio publico',
  ];

  /**
   * Art. 2º, §1º — Objetos especiais (valor > R$ 15.000.000)
   * NOTA: keywords devem estar SEM acentos
   */
  const P1_KEYWORDS = [
    'insumos hospitalares', 'insumo hospital', 'insumos hospital',
    'material hospitalar', 'medicament', 'medicamento', 'medicamentos',
    'vacina', 'vacinas', 'imunobiol',
    'insumo farmaceutico',
    'merenda', 'merenda escolar',
    'alimentacao escolar',
    'uniform', 'livro escolar', 'livros escolar',
    'livro didatico', 'livros didaticos', 'material didatico', 'material escolar',
    'alimentacao prisional',
    'sistema prisional', 'internos do sistema',
    'presidio', 'penitenciaria',
    'cadeia', 'detentos', 'reeducandos',
    'mao de obra', 'terceiriz',
    'fornecimento de mao de obra',
  ];

  /**
   * Art. 2º, §2º — Modalidades especiais (valor > R$ 15.000.000)
   * NOTA: keywords devem estar SEM acentos
   */
  const P2_KEYWORDS = [
    'inexigibilidade',
    'emergenci', 'emergencia',
    'calamidade', 'situacao de emergencia',
    'ppp', 'parceria publico-privada', 'parceria publico privada',
    'concessao patrocinada',
    'concessao administrativa',
    'consorcio',
    'consorcio de empresas',
  ];

  /**
   * Aditivos contratuais → EXCEÇÃO ao Art. 8º (§ único do Decreto 34.196/2024).
   * Sempre requerem Avaliação de Integridade, independente da data.
   * NOTA: keywords devem estar SEM acentos
   */
  const ADITIVO_KEYWORDS = [
    'aditivo', 'termo aditivo', 'aditamento', 'apostilamento', 'apostila contratual',
    '1o aditivo', '2o aditivo', '3o aditivo', '4o aditivo', '5o aditivo',
    '1º aditivo', '2º aditivo', '3º aditivo', '4º aditivo', '5º aditivo',
    'primeiro aditivo', 'segundo aditivo', 'terceiro aditivo', 'quarto aditivo', 'quinto aditivo',
    'aditivo contratual', 'aditamento contratual',
  ];

  // ── Opções válidas de validação manual do Art. 8º ────────────────────────────
  const ART8_OPCOES_DISPENSA = ['assinatura_antes', 'publicacao_antes', 'inicio_antes'];
  const ART8_OPCAO_NENHUM    = 'nenhum';
  const ART8_OPCAO_INFO_ND   = 'info_nao_disponivel';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Mapa de campos categóricos → campo que guarda o valor ORIGINAL (pré-dicionário).
   *
   * O Normalizer reescreve campos como `tipo_objeto`, `modalidade` e `criterio`
   * para a forma canônica de EXIBIÇÃO (ex.: "farmaceutico" → "Medicamentos",
   * "terceirizacao" → "Mão de Obra / Terceirização"). Essa reescrita pode APAGAR
   * o termo-gatilho que o classificador procura (ex.: a keyword "insumo farmaceutico"
   * deixa de existir após "farmaceutico" virar "Medicamentos").
   *
   * Para classificar, o termo a comparar deve ser o texto BRUTO original. Este mapa
   * permite que textOf() recupere o valor original quando ele existir, mantendo a
   * exibição normalizada intacta.
   */
  const _ORIGINAL_FIELD = {
    tipo_objeto: '_tipo_objeto_original',
    modalidade:  '_modalidade_original',
    criterio:    '_criterio_original',
  };

  /**
   * Retorna o valor de um campo priorizando a forma ORIGINAL (pré-dicionário),
   * quando o Normalizer a tiver preservado. Campos de texto livre (objeto,
   * nat_despesa, observacoes) não têm original — retornam o próprio valor.
   */
  function _fieldRawValue(row, field) {
    const origKey = _ORIGINAL_FIELD[field];
    if (origKey && row[origKey] !== undefined && row[origKey] !== null && row[origKey] !== '') {
      return row[origKey];
    }
    return row[field];
  }

  /**
   * Extrai texto dos campos especificados, em lowercase e SEM acentos.
   *
   * Usa o valor ORIGINAL (pré-normalização) dos campos categóricos para que o
   * matching de keywords não seja afetado pela reescrita de exibição do Normalizer.
   */
  function textOf(row, ...fields) {
    const raw = fields.map(f => String(_fieldRawValue(row, f) || '')).join(' ').toLowerCase();
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function matchesAny(text, keywords) {
    return keywords.some(k => text.includes(k));
  }

  /**
   * Normaliza string de data para ISO YYYY-MM-DD.
   * Aceita: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
   * Retorna null se inválida.
   */
  function normalizeDateToISO(dateStr) {
    const s = String(dateStr || '').trim();
    if (!s || s === '—' || s.toLowerCase().includes('não informado') ||
        s.toLowerCase().includes('nao informado')) return null;

    let yyyy, mm, dd;

    const brMatch = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (brMatch) {
      dd   = parseInt(brMatch[1], 10);
      mm   = parseInt(brMatch[2], 10);
      yyyy = parseInt(brMatch[3], 10);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const parts = s.split('-');
      yyyy = parseInt(parts[0], 10);
      mm   = parseInt(parts[1], 10);
      dd   = parseInt(parts[2], 10);
    } else {
      return null;
    }

    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    if (yyyy < 1900 || yyyy > 2100) return null;

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (
      dt.getUTCFullYear() !== yyyy ||
      dt.getUTCMonth()    !== mm - 1 ||
      dt.getUTCDate()     !== dd
    ) {
      return null;
    }

    return `${String(yyyy).padStart(4,'0')}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }

  /**
   * Valor efetivo para classificação.
   */
  function getEffectiveValue(row) {
    if (row._valor_manual !== undefined && _toNumber(row._valor_manual) > 0) {
      return _toNumber(row._valor_manual);
    }
    return _toNumber(row.valor_estimado);
  }

  /**
   * Converte um valor para número de forma robusta.
   *
   * No pipeline normal, io.js já entrega `valor_estimado` como Number — nesse caso
   * o número é usado direto. Mas se o classifier for chamado fora do pipeline (ou
   * uma planilha entregar string), `parseFloat` ingênuo quebraria silenciosamente:
   * parseFloat("35.000.000,00") === 35. Este helper aplica a mesma regra do
   * io.js (o ÚLTIMO separador é o decimal) para strings BR e US.
   *
   * @param {number|string} v
   * @returns {number} valor numérico (0 se não parseável)
   */
  function _toNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined) return 0;

    const s = String(v).trim().replace(/^R?\$\s*/i, '').trim();
    if (!s) return 0;

    const hasDot   = s.includes('.');
    const hasComma = s.includes(',');
    let parsed;

    if (hasDot && hasComma) {
      parsed = (s.lastIndexOf(',') > s.lastIndexOf('.'))
        ? parseFloat(s.replace(/\./g, '').replace(',', '.'))  // BR: 1.234,56
        : parseFloat(s.replace(/,/g, ''));                    // US: 1,234.56
    } else if (hasComma) {
      parsed = parseFloat(s.replace(',', '.'));               // só vírgula → decimal BR
    } else if (hasDot) {
      parsed = _parseDotOnly(s);                              // só ponto → milhar BR ou decimal
    } else {
      parsed = parseFloat(s);                                 // inteiro puro
    }
    return parsed || 0;
  }

  /**
   * Interpreta uma string numérica que contém SOMENTE pontos (sem vírgula).
   *
   * O ponto é ambíguo em pt-BR: pode ser separador de MILHAR ("35.000.000" = 35
   * milhões) ou separador DECIMAL ("1234.56"). A versão anterior fazia
   * parseFloat() direto, que truncava "35.000.000" em 35 — derrubando contratos
   * milionários para fora do Art. 2º.
   *
   * Heurística (determinística):
   *   - 2+ pontos                         → milhar BR (remove todos os pontos)
   *   - 1 ponto + exatamente 3 dígitos no
   *     final E parte inteira sem zeros à
   *     esquerda                          → milhar BR ("35.000" → 35000)
   *   - caso contrário                     → decimal ("1234.56", "35.5")
   *
   * @param {string} s — string já sem prefixo R$ e sem vírgulas
   * @returns {number}
   */
  function _parseDotOnly(s) {
    const dotCount = (s.match(/\./g) || []).length;

    // 2+ pontos: só pode ser agrupamento de milhar (decimais têm 1 ponto).
    if (dotCount >= 2) return parseFloat(s.replace(/\./g, ''));

    // 1 ponto: distinguir milhar de decimal pela forma do grupo final.
    const [intPart, fracPart = ''] = s.split('.');
    // "35.000" → grupo final de 3 dígitos sem zero à esquerda no inteiro = milhar.
    const pareceMilhar = fracPart.length === 3 && !/^0\d/.test(intPart);
    return pareceMilhar
      ? parseFloat(intPart + fracPart)   // milhar: 35.000 → 35000
      : parseFloat(s);                   // decimal: 1234.56 → 1234.56
  }

  /**
   * Retorna true quando não há valor utilizável.
   */
  function isSigiloso(row) {
    const base   = _toNumber(row.valor_estimado);
    const manual = row._valor_manual;
    return base === 0 && (manual === undefined || _toNumber(manual) <= 0);
  }

  /**
   * Detecta se o processo é um aditivo contratual.
   */
  function isAditivo(row) {
    const text = textOf(row, 'objeto', 'observacoes', 'modalidade', 'tipo_objeto');
    return matchesAny(text, ADITIVO_KEYWORDS);
  }

  // ── Art. 1º — Verificação do âmbito de aplicação ────────────────

  /**
   * Verifica se o órgão está EXCLUÍDO do âmbito do Decreto 34.196/2024.
   *
   * DETECÇÃO INTELIGENTE (3 níveis):
   *   1. Sigla exata: nome_Uasg inteiro ou primeiro token em MAIÚSCULO no Set de siglas
   *   2. Keywords por órgão: qualquer keyword do ORGAOS_EXCLUIDOS_MAP no texto normalizado
   *
   * Normalização do texto:
   *   - Lowercase
   *   - Remove acentos (NFD + strip diacríticos)
   *   - Remove pontuação típica de razão social (S.A., LTDA, S/A, etc.)
   *   - Colapsa espaços
   *
   * @param {Object} row
   * @returns {boolean} true = órgão EXCLUÍDO (decreto não se aplica)
   */
  function isOrgaoExcluidoArt1(row) {
    // ── Nível 1: Sigla exata ────────────────────────────────────────────
    const nomeRaw   = String(row.nome_Uasg || '').trim();
    const siglaNorm = nomeRaw.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // maiúsculo sem acento

    // nome_Uasg inteiro = sigla
    if (ORGAOS_EXCLUIDOS_ART1.has(siglaNorm)) return true;

    // Primeiro token antes de separador (ex: "CAERN - Companhia de Águas" → "CAERN")
    const primeiroToken = siglaNorm.split(/[\s\-\/,;:]+/)[0];
    if (primeiroToken && ORGAOS_EXCLUIDOS_ART1.has(primeiroToken)) return true;

    // ── Nível 2: Keywords por órgão ──────────────────────────────────────
    // Normalização completa: sem acento, lowercase, remove pontuação de razão social
    const nomeNorm = nomeRaw
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(s\.?a\.?|ltda\.?|s\/a|eireli|me\b|epp\b)/g, ' ')
      .replace(/[.\-\/,;:()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Verifica keywords de cada órgão excluído
    for (const orgao of ORGAOS_EXCLUIDOS_MAP) {
      if (orgao.keywords.some(kw => nomeNorm.includes(kw))) return true;
    }

    return false;
  }

  /**
   * Retorna o objeto do órgão excluído correspondente ao row, ou null.
   * Útil para exibir o nome oficial do órgão no motivo da exclusão.
   * @param {Object} row
   * @returns {Object|null}
   */
  function getOrgaoExcluidoInfo(row) {
    const nomeRaw   = String(row.nome_Uasg || '').trim();
    const siglaNorm = nomeRaw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const primeiro  = siglaNorm.split(/[\s\-\/,;:]+/)[0];

    // Primeiro tenta por sigla exata
    const porSigla = ORGAOS_EXCLUIDOS_MAP.find(
      o => o.sigla === siglaNorm || o.sigla === primeiro
    );
    if (porSigla) return porSigla;

    // Depois por keyword
    const nomeNorm = nomeRaw.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(s\.?a\.?|ltda\.?|s\/a|eireli|me\b|epp\b)/g, ' ')
      .replace(/[.\-\/,;:()]+/g, ' ').replace(/\s+/g, ' ').trim();

    return ORGAOS_EXCLUIDOS_MAP.find(
      o => o.keywords.some(kw => nomeNorm.includes(kw))
    ) || null;
  }

  // ── Art. 2º — Verificações individuais ───────────────────────────────────────

  function checkArt2I(row) {
    if (getEffectiveValue(row) <= THRESHOLD_I) return false;
    return matchesAny(textOf(row, 'tipo_objeto', 'objeto', 'nat_despesa'), ENG_KEYWORDS);
  }

  function checkArt2II(row) {
    if (getEffectiveValue(row) <= THRESHOLD_II) return false;
    return !matchesAny(textOf(row, 'tipo_objeto', 'objeto', 'nat_despesa'), ENG_KEYWORDS);
  }

  function checkArt2P1(row) {
    if (getEffectiveValue(row) <= THRESHOLD_P1) return false;
    return matchesAny(textOf(row, 'objeto', 'tipo_objeto', 'nat_despesa'), P1_KEYWORDS);
  }

  function checkArt2P2(row) {
    if (getEffectiveValue(row) <= THRESHOLD_P2) return false;
    if (matchesAny(textOf(row, 'modalidade'), P2_KEYWORDS)) return true;
    return matchesAny(textOf(row, 'objeto', 'tipo_objeto'), P2_KEYWORDS);
  }

  // ── Art. 8º — Dispensa por anterioridade (FLUXO DE DUAS ETAPAS) ──────────────

  /**
   * Verifica Art. 8º para uma linha que JÁ atende ao Art. 2º.
   *
   * IMPORTANTE: Esta função NUNCA deve ser chamada para órgãos excluídos (Art. 1º)
   * nem para processos que não atendem ao Art. 2º.
   */
  function checkArt8(row) {
    // ── Prioridade 1: Validação manual já realizada pelo analista ────────────
    if (row._validacao_art8 && row._validacao_art8.opcao) {
      const op = row._validacao_art8.opcao;
      if (ART8_OPCOES_DISPENSA.includes(op)) return 'dispensado';
      if (op === ART8_OPCAO_NENHUM)          return 'vigente';
      if (op === ART8_OPCAO_INFO_ND)         return 'sem-data';
    }

    // ── Prioridade 2: Aditivos contratuais (exceção expressa ao Art. 8º) ────
    const text = textOf(row, 'objeto', 'observacoes', 'modalidade', 'tipo_objeto');
    if (matchesAny(text, ADITIVO_KEYWORDS)) {
      return 'excecao-aditivo';
    }

    // ── Prioridade 3: Verificar data disponível ───────────────────────────────
    let isoDate = null;

    if (row._data_referencia_manual && row._data_referencia_manual.data) {
      isoDate = normalizeDateToISO(row._data_referencia_manual.data);
    }

    if (!isoDate) {
      isoDate = normalizeDateToISO(row.dt_public_edital);
    }

    if (!isoDate) {
      return 'pendente-validacao';
    }

    if (isoDate >= DECREE_ENTRY_ISO) {
      return 'vigente';
    }

    return 'pendente-validacao';
  }

  /**
   * Detecta CONFLITO entre a dispensa confirmada pelo analista (Art. 8º) e a
   * única data conhecida do processo.
   *
   * A validação humana tem primazia e NÃO é sobrescrita — o analista pode
   * conhecer datas (assinatura, início da dispensa) que não estão na planilha.
   * Porém, quando a ÚNICA data disponível ao sistema é igual ou POSTERIOR a
   * 10/03/2025, a marcação de "evento ocorreu antes de 10/03/2025" é, no mínimo,
   * suspeita. Esta função devolve uma mensagem de alerta nesse caso (e null
   * quando não há conflito aparente), para a UI sinalizar ao analista sem
   * bloquear sua decisão.
   *
   * @param {Object} row
   * @returns {string|null}
   */
  function detectArt8Conflito(row) {
    const v = row._validacao_art8;
    if (!v || !ART8_OPCOES_DISPENSA.includes(v.opcao)) return null;

    // Data que o sistema conhece (referência manual tem prioridade sobre a planilha).
    let isoDate = null;
    if (row._data_referencia_manual && row._data_referencia_manual.data) {
      isoDate = normalizeDateToISO(row._data_referencia_manual.data);
    }
    if (!isoDate) isoDate = normalizeDateToISO(row.dt_public_edital);

    // Sem data conhecida → nada a contradizer.
    if (!isoDate) return null;

    // Data conhecida anterior à vigência → coerente com a dispensa, sem conflito.
    if (isoDate < DECREE_ENTRY_ISO) return null;

    // Data conhecida >= vigência, mas analista afirmou evento anterior → conflito.
    const dataFmt = isoDate.split('-').reverse().join('/');
    const opcaoLabel = ART8_VALIDACAO_OPCOES_LABEL[v.opcao] || v.opcao;
    return `CONFLITO DE DATA — O analista confirmou "${opcaoLabel}" (evento anterior a ` +
      `10/03/2025), mas a única data registrada para este processo (${dataFmt}) é igual ou ` +
      `posterior à entrada em vigor do Decreto. A dispensa foi mantida conforme a validação ` +
      `humana, porém recomenda-se revisar se a data do evento informado está correta.`;
  }

  // ── Motivos textuais ─────────────────────────────────────────────────────────

  function buildMotivoArt2(reasons, row) {
    if (!reasons || reasons.length === 0) return '';
    const val    = getEffectiveValue(row);
    const fmtVal = val > 0
      ? `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : 'valor não informado';

    const principal = reasons.map(r => {
      switch (r) {
        case 'art2-I':
          return `Art. 2º, I (Decreto 34.196/2024) — Obra ou serviço de engenharia com valor superior a R$ 35.000.000,00 (valor identificado: ${fmtVal}).`;
        case 'art2-II':
          return `Art. 2º, II (Decreto 34.196/2024) — Serviço ou compra com valor superior a R$ 25.000.000,00 (valor identificado: ${fmtVal}).`;
        case 'art2-p1':
          return `Art. 2º, §1º (Decreto 34.196/2024) — Objeto de categoria especial (insumo hospitalar, medicamento, vacina, merenda escolar, alimentação prisional, uniforme, livro escolar ou mão de obra terceirizada) com valor superior a R$ 15.000.000,00 (valor identificado: ${fmtVal}).`;
        case 'art2-p2':
          return `Art. 2º, §2º (Decreto 34.196/2024) — Modalidade especial (inexigibilidade, contratação emergencial, PPP ou consórcio de empresas) com valor superior a R$ 15.000.000,00 (valor identificado: ${fmtVal}).`;
        default:
          return r;
      }
    }).join('');

    const allR  = row._allReasons || reasons;
    const outros = allR.filter(r => !reasons.includes(r));
    if (outros.length > 0) {
      const outrosLabel = outros.map(r => ({
        'art2-I':  'Art. 2º I',
        'art2-II': 'Art. 2º II',
        'art2-p1': 'Art. 2º §1º',
        'art2-p2': 'Art. 2º §2º',
      }[r] || r)).join(', ');
      return principal + ` [Critério predominante aplicado. Outros critérios também atendidos: ${outrosLabel} — suprimidos pela regra de prioridade única.]`;
    }
    return principal;
  }

  /**
   * Gera descrição textual para órgãos excluídos pelo Art. 1º.
   * Usa getOrgaoExcluidoInfo() para exibir o nome oficial do órgão.
   */
  function buildMotivoArt1(row) {
    const info  = getOrgaoExcluidoInfo(row);
    const orgao = row.nome_Uasg || row.codigoUasg || 'Não identificado';
    const nome  = info ? `${info.sigla} — ${info.nome}` : orgao;
    return `O órgão "${nome}" é empresa pública ou sociedade de economia mista e não pertence à administração direta, autarquias ou fundações do Poder Executivo Estadual. O Decreto 34.196/2024 não se aplica a este processo.`;
  }

  /**
   * Gera descrição textual da decisão do Art. 8º do Decreto 34.196/2024.
   */
  function buildMotivoArt8(art8Status, row) {
    switch (art8Status) {

      case 'pendente-validacao': {
        let isoDate = null;
        if (row._data_referencia_manual && row._data_referencia_manual.data) {
          isoDate = normalizeDateToISO(row._data_referencia_manual.data);
        }
        if (!isoDate) isoDate = normalizeDateToISO(row.dt_public_edital);

        if (isoDate && isoDate < DECREE_ENTRY_ISO) {
          const dataFmt = isoDate.split('-').reverse().join('/');
          return `PENDENTE — Data detectada (${dataFmt}) é anterior a 10/03/2025. ` +
            `O Art. 8º do Decreto 34.196/2024 pode dispensar esta contratação, ` +
            `mas a dispensa NÃO é automática. O analista deve confirmar qual evento ` +
            `(assinatura do contrato, publicação do edital ou início da dispensa/inexigibilidade) ` +
            `ocorreu antes de 10/03/2025, ou indicar que nenhum desses eventos ocorreu nesse período.`;
        }
        return `PENDENTE — Não foi possível verificar o Art. 8º automaticamente. ` +
          `O analista deve confirmar se algum evento relevante (assinatura do contrato, ` +
          `publicação do edital ou início da dispensa/inexigibilidade) ocorreu ` +
          `antes de 10/03/2025 (data de entrada em vigor do Decreto 34.196/2024).`;
      }

      case 'dispensado': {
        const v     = row._validacao_art8;
        const label = v ? (ART8_VALIDACAO_OPCOES_LABEL[v.opcao] || v.opcao) : 'evento anterior';
        return `DISPENSADA — O analista confirmou que "${label}" ocorreu antes de 10/03/2025. ` +
          `Conforme Art. 8º caput do Decreto 34.196/2024, a Avaliação de Integridade ` +
          `está DISPENSADA para esta contratação.`;
      }

      case 'excecao-aditivo':
        return `NÃO DISPENSADA — Identificado como aditivo contratual. Conforme Art. 8º, ` +
          `§ único do Decreto 34.196/2024, a celebração de aditivo contratual é exceção ` +
          `expressa à dispensa. A Avaliação de Integridade é OBRIGATÓRIA ` +
          `independentemente da data da contratação original.`;

      case 'vigente': {
        if (row._validacao_art8 && row._validacao_art8.opcao === ART8_OPCAO_NENHUM) {
          return `OBRIGATÓRIA — O analista confirmou que nenhum dos eventos relevantes ` +
            `(assinatura do contrato, publicação do edital ou início da dispensa/inexigibilidade) ` +
            `ocorreu antes de 10/03/2025. O Decreto 34.196/2024 está em plena vigência ` +
            `para esta contratação. A Avaliação de Integridade é OBRIGATÓRIA.`;
        }
        let isoDate = null;
        if (row._data_referencia_manual && row._data_referencia_manual.data) {
          isoDate = normalizeDateToISO(row._data_referencia_manual.data);
        }
        if (!isoDate) isoDate = normalizeDateToISO(row.dt_public_edital);
        const dataFmt = isoDate ? isoDate.split('-').reverse().join('/') : 'data da planilha';
        return `NÃO DISPENSADA — Data de referência (${dataFmt}) é igual ou posterior a 10/03/2025. ` +
          `O Decreto 34.196/2024 está em plena vigência para esta contratação. ` +
          `A Avaliação de Integridade é OBRIGATÓRIA.`;
      }

      case 'sem-data':
        return `INDETERMINADO — O analista indicou que a informação sobre a data dos eventos ` +
          `relevantes (assinatura do contrato, publicação do edital ou início da ` +
          `dispensa/inexigibilidade) não está disponível no momento. ` +
          `O status permanece como "Verificação Pendente" até que a informação seja obtida.`;

      case 'nao-aplicavel':
      default:
        return '';
    }
  }

  // ── Rótulos para opções de validação do Art. 8º ───────────────────────────────
  const ART8_VALIDACAO_OPCOES_LABEL = {
    assinatura_antes: 'Assinatura do instrumento contratual antes de 10/03/2025',
    publicacao_antes: 'Publicação do edital antes de 10/03/2025',
    inicio_antes:     'Início do processo por dispensa/inexigibilidade antes de 10/03/2025',
    nenhum:           'Nenhum dos anteriores',
    info_nao_disponivel: 'Informação não disponível',
  };

  // ── Classificação completa ────────────────────────────────────────────────────

  /**
   * Classifica uma linha pelos critérios do Art. 2º.
   *
   * ATENÇÃO: Esta função pressupõe que checkArt1 já foi verificado ANTES.
   * Para órgãos excluídos pelo Art. 1º, classifyRow NÃO deve ser chamado.
   *
   * Ordem de prioridade (do mais específico para o mais genérico):
   *   1. art2-p2 — Modalidade especial
   *   2. art2-p1 — Objeto especial
   *   3. art2-I  — Obra ou serviço de engenharia > R$35M
   *   4. art2-II — Serviço/Compra geral > R$25M (critério RESIDUAL)
   */
  function classifyRow(row) {
    const allMatched = [];
    if (checkArt2I(row))  allMatched.push('art2-I');
    if (checkArt2II(row)) allMatched.push('art2-II');
    if (checkArt2P1(row)) allMatched.push('art2-p1');
    if (checkArt2P2(row)) allMatched.push('art2-p2');

    row._allReasons = allMatched;

    if (allMatched.includes('art2-p2')) return ['art2-p2'];
    if (allMatched.includes('art2-p1')) return ['art2-p1'];
    if (allMatched.includes('art2-I'))  return ['art2-I'];
    if (allMatched.includes('art2-II')) return ['art2-II'];
    return [];
  }

  /**
   * Formata valor em BRL inline.
   */
  function _fmtBRLInline(v) {
    if (!v || v <= 0) return 'não informado';
    return 'R\u0024 ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Classifica todo o dataset.
   *
   * ORDEM CORRETA DAS VERIFICAÇÕES (conforme prompt de auditoria):
   *   1️⃣  Ler dados do processo
   *   2️⃣  Verificar Art. 1º (âmbito de aplicação — órgão excluído?)
   *   3️⃣  Verificar Art. 2º (obrigatoriedade)
   *   4️⃣  Verificar Art. 8º (dispensa — APENAS se enquadrou no Art. 2º)
   *   5️⃣  Classificar com status final
   *
   * Status finais possíveis:
   *   'avaliacao-obrigatoria'  — enquadra Art. 2º e não está dispensado
   *   'dispensada'             — enquadra Art. 2º + analista confirmou dispensa Art. 8º
   *   'verificacao-humana'     — valor sigiloso, ou Art. 8º pendente/sem-data
   *   'nao-enquadrado'         — não atinge critérios do Art. 2º (mas está no escopo do Art. 1º)
   *   'nao-enquadrado-art1'    — [NOVO] órgão excluído pelo Art. 1º (empresa pública/economia mista)
   */
  /**
   * Classifica UMA linha pelo ciclo completo do Decreto:
   *   Art. 1º (âmbito) → Art. 2º (obrigatoriedade) → Art. 8º (dispensa) → status.
   *
   * Esta é a FONTE ÚNICA DE VERDADE do ciclo de classificação por linha. Tanto
   * classifyAll() (carga inicial) quanto a reclassificação após entrada manual do
   * analista (handlers.js) devem chamá-la, para que nunca haja divergência entre
   * os dois caminhos.
   *
   * @param {Object} row — linha do dataset (mutada in-place)
   * @returns {Object} a mesma linha
   */
  function classifyRowFull(row) {
    // ── ETAPA 0: Sigiloso / valor ausente ─────────────────────────────────
    row._isSigiloso  = isSigiloso(row);
    row._isAditivo   = isAditivo(row);

    // ── ETAPA 1: Verificação do Art. 1º (âmbito de aplicação) ─────────────
    // Esta verificação deve ocorrer ANTES de qualquer outra.
    row._excluido_art1 = isOrgaoExcluidoArt1(row);

    if (row._excluido_art1) {
      // Órgão fora do escopo do decreto → classificação imediata, sem Art. 2º ou 8º
      row._reasons              = [];
      row._allReasons           = [];
      row._requerAlice          = false;
      row._art8                 = 'nao-aplicavel';
      row._dispensadoArt8       = false;
      row._art8Conflito         = null;
      row._requerAvaliacaoFinal = false;
      row._indeterminado        = false;
      row._aditivoValorInsuficiente = false;
      row._aditivoSigiloso      = false;
      row._campoFaltante        = [];
      row._statusFinal          = 'nao-enquadrado-art1';
      row._motivoArt1           = buildMotivoArt1(row);
      row._motivoArt2           = '';
      row._motivoArt8           = '';
      return row; // CURTO-CIRCUITO: não processa Art. 2º nem Art. 8º
    }

    // ── ETAPA 2 & 3: Art. 2º (obrigatoriedade) ────────────────────────────
    row._reasons     = classifyRow(row);
    row._requerAlice = row._reasons.length > 0;

    // ── ETAPA 4: Art. 8º (dispensa — APENAS se enquadrou no Art. 2º) ──────
    row._art8 = row._requerAlice ? checkArt8(row) : 'nao-aplicavel';

    row._dispensadoArt8       = row._art8 === 'dispensado';
    row._requerAvaliacaoFinal = row._requerAlice && !row._dispensadoArt8;
    row._indeterminado        = row._isSigiloso ||
      (row._requerAlice && (row._art8 === 'pendente-validacao' || row._art8 === 'sem-data'));

    // Alerta de sanidade: dispensa confirmada pelo analista que contradiz a
    // única data conhecida do processo. Não altera o status — apenas sinaliza.
    row._art8Conflito = row._dispensadoArt8 ? detectArt8Conflito(row) : null;

    row._aditivoValorInsuficiente = (
      row._isAditivo &&
      !row._requerAlice &&
      !row._isSigiloso
    );

    // Aditivo cujo valor está sigiloso/ausente: o status continua sendo
    // 'verificacao-humana' pela via do sigiloso, mas a orientação ao analista
    // precisa ser a de ADITIVO (informar o valor TOTAL acumulado = original +
    // aditivo, conforme Art. 2º, §3º) — e não o pedido genérico de "valor".
    row._aditivoSigiloso = row._isAditivo && row._isSigiloso;

    // ── Campos faltantes ──────────────────────────────────────────────────
    const camposFaltantes = [];
    if (row._aditivoSigiloso) {
      // Aditivo SEM valor: orientação específica (tem prioridade sobre a genérica)
      camposFaltantes.push(
        'Informe o valor TOTAL do contrato (original + aditivo) — processo identificado ' +
        'como aditivo contratual com orçamento sigiloso ou não informado. O Art. 2º, §3º do ' +
        'Decreto exige o cálculo sobre o valor acumulado da contratação'
      );
    } else if (row._isSigiloso) {
      camposFaltantes.push(
        'Informe o valor estimado do contrato — o orçamento está como sigiloso ou não foi informado'
      );
    }
    if (row._aditivoValorInsuficiente) {
      camposFaltantes.push(
        'Informe o valor TOTAL do contrato (original + aditivo) — processo identificado como aditivo ' +
        'contratual. Necessário para verificação correta do Art. 2º, §3º do Decreto'
      );
    }
    if (row._requerAlice && row._art8 === 'pendente-validacao') {
      camposFaltantes.push(
        'Confirmação Art. 8º pendente — selecione qual evento relevante ocorreu antes de 10/03/2025'
      );
    }
    if (row._requerAlice && row._art8 === 'sem-data') {
      camposFaltantes.push(
        'Informação sobre data dos eventos relevantes não disponível — status permanece pendente'
      );
    }
    row._campoFaltante = camposFaltantes;

    // O motivo de aditivo é recalculado a cada classificação; limpamos antes
    // para não carregar um texto obsoleto de uma reclassificação anterior.
    row._motivoAditivoValorBaixo = '';

    // ── ETAPA 5: Status Final ──────────────────────────────────────────────
    if (row._isSigiloso) {
      row._statusFinal = 'verificacao-humana';
      // Se também for aditivo, anexar a orientação de valor total acumulado,
      // pois a UI exibe _motivoAditivoValorBaixo nas células de verificação.
      if (row._aditivoSigiloso) {
        row._motivoAditivoValorBaixo =
          'ATENÇÃO — Processo identificado como ADITIVO CONTRATUAL com orçamento ' +
          'sigiloso ou não informado. Conforme Art. 2º, §3º do Decreto 34.196/2024, ' +
          'o cálculo deve considerar o VALOR TOTAL da contratação — para aditivos, o ' +
          'valor relevante é o acumulado: valor do contrato original + valor deste aditivo. ' +
          'Informe o valor total via campo de valor manual para que o sistema verifique ' +
          'corretamente o enquadramento no Art. 2º.';
      }
    } else if (row._aditivoValorInsuficiente) {
      row._statusFinal = 'verificacao-humana';
      row._motivoAditivoValorBaixo =
        'ATENÇÃO — Processo identificado como ADITIVO CONTRATUAL com valor registrado (' +
        _fmtBRLInline(getEffectiveValue(row)) + ') abaixo dos limites do Art. 2º. ' +
        'Conforme Art. 2º, §3º do Decreto 34.196/2024, o cálculo deve considerar o ' +
        'VALOR TOTAL da contratação. Para aditivos, o valor relevante é o acumulado: ' +
        'valor do contrato original + valor deste aditivo. ' +
        'Informe o valor total via campo de valor manual para que o sistema verifique ' +
        'corretamente o enquadramento no Art. 2º.';
    } else if (row._requerAlice && row._art8 === 'pendente-validacao') {
      row._statusFinal = 'verificacao-humana';
    } else if (row._requerAlice && row._art8 === 'sem-data') {
      row._statusFinal = 'verificacao-humana';
    } else if (row._requerAlice && row._dispensadoArt8) {
      row._statusFinal = 'dispensada';
    } else if (row._requerAlice && row._requerAvaliacaoFinal) {
      row._statusFinal = 'avaliacao-obrigatoria';
    } else {
      row._statusFinal = 'nao-enquadrado';
    }

    // ── ETAPA 6: Contrato interrompido → fora do escopo ────────────────────
    // Se o analista informou que o contrato foi interrompido no questionário,
    // o processo sai de "Avaliação Obrigatória" e vai para "Fora do Escopo".
    if (row._avaliacao_obrig_dados &&
        row._avaliacao_obrig_dados.contrato_interrompido === 'sim') {
      row._statusFinal = 'nao-enquadrado';
      row._interrompido = true;
    } else {
      row._interrompido = false;
    }

    row._motivoArt1 = '';
    row._motivoArt2 = buildMotivoArt2(row._reasons, row);
    row._motivoArt8 = buildMotivoArt8(row._art8, row);
    return row;
  }

  /**
   * Classifica todo o dataset, delegando cada linha a classifyRowFull().
   */
  function classifyAll(data) {
    data.forEach(classifyRowFull);
    return data;
  }

  /**
   * Contagens agregadas para os cards de resumo.
   * Inclui contador para naoEnquadradoArt1.
   */
  function getCounts(data) {
    // Contratos interrompidos pelo analista enquadravam no Art. 2º, mas saíram da
    // FILA ATIVA (viraram 'nao-enquadrado'). Os cards do Art. 2º refletem o
    // trabalho ativo, então os interrompidos NÃO somam neles — evitando que o
    // mesmo registro apareça como "enquadrado" e "não enquadrado" ao mesmo tempo.
    // A flag _reasons/_requerAlice é preservada na linha apenas para auditoria/PDF.
    const ativoArt2 = r => r._requerAlice && !r._interrompido;

    return {
      total: data.length,

      // Art. 2º (fila ativa — desconta interrompidos)
      alice: data.filter(ativoArt2).length,
      none:  data.filter(r => (!r._requerAlice || r._interrompido) && !r._isSigiloso && !r._excluido_art1).length,
      I:     data.filter(r => ativoArt2(r) && r._reasons.includes('art2-I')).length,
      II:    data.filter(r => ativoArt2(r) && r._reasons.includes('art2-II')).length,
      p1:    data.filter(r => ativoArt2(r) && r._reasons.includes('art2-p1')).length,
      p2:    data.filter(r => ativoArt2(r) && r._reasons.includes('art2-p2')).length,

      // Status final
      avaliacaoObrigatoria: data.filter(r => r._statusFinal === 'avaliacao-obrigatoria').length,
      dispensada:           data.filter(r => r._statusFinal === 'dispensada').length,
      verificacaoHumana:    data.filter(r => r._statusFinal === 'verificacao-humana').length,
      naoEnquadrado:        data.filter(r => r._statusFinal === 'nao-enquadrado').length,
      // Novo contador: órgãos excluídos pelo Art. 1º
      naoEnquadradoArt1:    data.filter(r => r._statusFinal === 'nao-enquadrado-art1').length,

      art8Aditivo:      data.filter(r => ativoArt2(r) && r._art8 === 'excecao-aditivo').length,
      aditivoValorBaixo: data.filter(r => r._aditivoValorInsuficiente).length,
      art8SemData:      data.filter(r => r._art8 === 'sem-data').length,
    };
  }

  // ── Metadados de apresentação ─────────────────────────────────────────────────

  const RULE_META = {
    'art2-I':  {
      label:      'Art. 2º, I — Obra/Engenharia > R$ 35M',
      shortLabel: 'Inc. I · Obra > R$ 35M',
      descricao: 'Obra ou serviço de engenharia com valor superior a R$ 35.000.000,00 (Decreto 34.196/2024, Art. 2º, I)',
      tagClass: 'tag-red',
      icon:     'alertTriangle',
    },
    'art2-II': {
      label:      'Art. 2º, II — Serviço/Compra > R$ 25M',
      shortLabel: 'Inc. II · Compra > R$ 25M',
      descricao: 'Serviços ou compras em geral com valor superior a R$ 25.000.000,00 (Decreto 34.196/2024, Art. 2º, II)',
      tagClass: 'tag-orange',
      icon:     'alertCircle',
    },
    'art2-p1': {
      label:      'Art. 2º, §1º — Objeto Especial > R$ 15M',
      shortLabel: '§1º · Objeto esp. > R$ 15M',
      descricao: 'Insumo hospitalar, medicamento, vacina, merenda, alimentação prisional, uniforme, livro escolar ou mão de obra terceirizada, acima de R$ 15.000.000,00 (Decreto 34.196/2024, Art. 2º, §1º)',
      tagClass: 'tag-yellow',
      icon:     'package',
    },
    'art2-p2': {
      label:      'Art. 2º, §2º — Modalidade Especial > R$ 15M',
      shortLabel: '§2º · Modal. esp. > R$ 15M',
      descricao: 'Inexigibilidade, contratação emergencial, PPP ou consórcio de empresas, acima de R$ 15.000.000,00 (Decreto 34.196/2024, Art. 2º, §2º)',
      tagClass: 'tag-blue',
      icon:     'shieldOff',
    },
  };

  const ART8_META = {
    'pendente-validacao': {
      tagClass: 'tag-art8-pendente',
      icon:     'helpCircle',
      badge:    'Art. 8º — Validação Necessária',
      label:    'Art. 8º — Aguardando Validação Humana',
      detail:   'Data anterior a 10/03/2025 detectada (ou data ausente). O Art. 8º do Decreto 34.196/2024 pode dispensar esta contratação, mas a dispensa não é automática. O analista deve confirmar qual evento ocorreu antes de 10/03/2025.',
    },
    'dispensado': {
      tagClass: 'tag-art8-dispensado',
      icon:     'checkCircle',
      badge:    'Art. 8º — Dispensado',
      label:    'Dispensado pelo Art. 8º',
      detail:   'O analista confirmou que um evento relevante (assinatura do contrato, publicação do edital ou início da dispensa/inexigibilidade) ocorreu ANTES de 10/03/2025 — data de entrada em vigor do Decreto Estadual N° 34.196/2024. Conforme Art. 8º caput, esta contratação está DISPENSADA da Avaliação de Integridade.',
    },
    'excecao-aditivo': {
      tagClass: 'tag-art8-excecao',
      icon:     'alertTriangle',
      badge:    'Exceção Art. 8º — Aditivo',
      label:    'Exceção ao Art. 8º — Aditivo Contratual',
      detail:   'Identificado como aditivo contratual. Conforme Art. 8º, § único do Decreto 34.196/2024, a celebração de aditivo contratual é exceção expressa à dispensa. A Avaliação de Integridade é OBRIGATÓRIA independentemente da data da contratação original.',
    },
    'vigente': {
      tagClass: 'tag-art8-vigente',
      icon:     'shieldCheck',
      badge:    'Art. 8º — Não Dispensado',
      label:    'Não Dispensado pelo Art. 8º (Decreto em Vigência)',
      detail:   'A data de referência é igual ou POSTERIOR a 10/03/2025, ou o analista confirmou que nenhum dos eventos relevantes ocorreu antes dessa data. O Decreto 34.196/2024 está em plena vigência. A Avaliação de Integridade é OBRIGATÓRIA.',
    },
    'sem-data': {
      tagClass: 'tag-art8-semdata',
      icon:     'helpCircle',
      badge:    'Art. 8º — Pendente (informação indisponível)',
      label:    'Art. 8º — Indeterminado (informação indisponível)',
      detail:   'O analista indicou que a informação sobre os eventos relevantes (assinatura do contrato, publicação do edital ou início da dispensa/inexigibilidade) não está disponível. O status permanece como pendente de verificação.',
    },
    'nao-aplicavel': {
      tagClass: 'tag-gray',
      icon:     'minus',
      badge:    '',
      label:    '',
      detail:   '',
    },
  };

  const STATUS_FINAL_META = {
    'avaliacao-obrigatoria': {
      label:    'Avaliação obrigatória',
      tableLabel: 'Obrigatória',
      tagClass: 'status-obrigatoria',
      icon:     'shield',
      color:    'var(--danger)',
      descricao: 'Enquadra no Art. 2º do Decreto 34.196/2024 e não está dispensado pelo Art. 8º. Conforme Art. 1º, §2º do Decreto, a Avaliação de Integridade pode ser realizada: (I) antes da assinatura do contrato ou do aditivo contratual; (II) durante a vigência contratual, antes do vencimento da última avaliação; (III) a qualquer momento durante a vigência, a critério da administração — especialmente em caso de denúncia ou alteração relevante nas informações prestadas pela empresa.',
    },
    'dispensada': {
      label:    'Dispensada',
      tableLabel: 'Dispensada',
      tagClass: 'status-dispensada',
      icon:     'checkCircle',
      color:    'var(--success)',
      descricao: 'Enquadra no Art. 2º do Decreto 34.196/2024, mas a avaliação está dispensada pelo Art. 8º — o analista confirmou que um evento relevante ocorreu antes de 10/03/2025.',
    },
    'verificacao-humana': {
      label:    'Verificação pendente',
      tableLabel: 'Pendente',
      tagClass: 'status-verificacao',
      icon:     'alertCircle',
      color:    'var(--warning)',
      descricao: 'Não foi possível classificar automaticamente. Pode ser por: (1) valor sigiloso — informe o valor estimado; (2) aditivo contratual com valor abaixo dos limites — informe o valor total do contrato (original + aditivo); ou (3) Art. 8º pendente — confirme qual evento relevante (assinatura, publicação do edital ou início da dispensa) ocorreu antes de 10/03/2025.',
    },
    'nao-enquadrado': {
      label:    'Não enquadrado no Art. 2º',
      tableLabel: 'Não enquadrado',
      tagClass: 'status-nao-enquadrado',
      icon:     'xCircle',
      color:    'var(--muted)',
      descricao: 'Órgão pertence ao escopo do Decreto 34.196/2024 (administração direta, autarquia ou fundação), mas a contratação não atinge nenhum critério de valor ou modalidade do Art. 2º. Fora do escopo de obrigatoriedade da Avaliação de Integridade.',
    },
    // NOVO status para órgãos excluídos pelo Art. 1º
    'nao-enquadrado-art1': {
      label:    'Não enquadrado no Decreto (Art. 1º)',
      tableLabel: 'Fora do Decreto',
      tagClass: 'status-nao-enquadrado-art1',
      icon:     'slash',
      color:    'var(--muted)',
      descricao: 'O órgão é empresa pública ou sociedade de economia mista e não pertence à administração direta, autarquias ou fundações. O Decreto não se aplica a este processo.',
    },
  };

  // ── API pública ───────────────────────────────────────────────────────────────
  return {
    classifyRow,
    classifyRowFull,
    classifyAll,
    getCounts,
    getEffectiveValue,
    // Exposto para que io.js use o MESMO parser de valor (fonte única de verdade),
    // evitando divergência de interpretação de separadores entre os dois caminhos.
    parseValor: _toNumber,
    isSigiloso,
    isOrgaoExcluidoArt1,
    getOrgaoExcluidoInfo,
    checkArt8,
    isAditivo,
    normalizeDateToISO,
    buildMotivoArt1,
    buildMotivoArt2,
    buildMotivoArt8,
    RULE_META,
    ART8_META,
    STATUS_FINAL_META,
    ART8_VALIDACAO_OPCOES_LABEL,
    DECREE_ENTRY_ISO,
    ART8_OPCOES_DISPENSA,
    ART8_OPCAO_NENHUM,
    ART8_OPCAO_INFO_ND,
    ORGAOS_EXCLUIDOS_ART1,
    ORGAOS_EXCLUIDOS_MAP,
  };

})();
