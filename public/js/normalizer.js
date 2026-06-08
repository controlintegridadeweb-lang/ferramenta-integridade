
'use strict';

const Normalizer = (() => {

  /* ─── Utilidades de string ─────────────────────────────────── */

  /** Remove diacríticos/acentos mantendo a letra base */
  function stripAccents(str) {
    return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Colapsa sequências de espaços/tabs/quebras/NBSP em um único espaço e faz trim.
   * [BUG-07] Adicionado \u00A0 (non-breaking space) ao replace para evitar
   * tokens invisíveis que quebram lookups no dicionário e filtros de texto.
   */
  function collapseSpaces(str) {
    return String(str)
      .replace(/[\t\r\n\u00A0]+/g, ' ')
      .replace(/  +/g, ' ')
      .trim();
  }

  /**
   * Forma canônica para lookup em dicionário:
   * sem acentos, lowercase, espaços colapsados.
   * Ex.: "  Serviços  COMUNS  " → "servicos comuns"
   */
  function canonical(str) {
    return stripAccents(collapseSpaces(String(str || ''))).toLowerCase();
  }

  /**
   * Title Case inteligente para o português:
   * preserva preposições/artigos em minúsculo no meio da frase.
   */
  const MINORS = new Set([
    'de','da','do','das','dos','e','em','a','o','as','os',
    'para','por','com','no','na','nos','nas','ao','aos','à','às','até'
  ]);

  function toTitleCase(str) {
    return collapseSpaces(str)
      .toLowerCase()
      .replace(/\b\w+/g, (word, offset) =>
        (offset === 0 || !MINORS.has(word))
          ? word.charAt(0).toUpperCase() + word.slice(1)
          : word
      );
  }

  /**
   * Resolve o valor de exibição de um campo textual:
   *   1. Checa no dicionário pela forma canônica (sem acento, lowercase)
   *   2. Se não encontrado: aplica Title Case + colapsa espaços
   *
   * @param {string} value — valor bruto do campo
   * @param {Object} dict  — mapa { 'forma_canonica': 'Termo Oficial' }
   * @returns {string}
   */
  function resolve(value, dict) {
    if (!value) return '';
    const key = canonical(value);
    return dict[key] !== undefined ? dict[key] : toTitleCase(collapseSpaces(value));
  }

  /* ─── Dicionários de termos canônicos ──────────────────────── */

  /**
   * MODALIDADE — mapeia variações/abreviações para o termo legal oficial
   * Lei 14.133/2021 (Nova Lei de Licitações) + formas antigas (8.666/1993)
   */
  const DICT_MODALIDADE = {
    // Pregão
    'pregao eletronico':               'Pregão Eletrônico',
    'pregao e-letronico':              'Pregão Eletrônico',
    'pregao':                          'Pregão Eletrônico',
    'pregao presencial':               'Pregão Presencial',
    'pe':                              'Pregão Eletrônico',
    'pp':                              'Pregão Presencial',

    // Concorrência
    'concorrencia':                    'Concorrência',
    'concorrencia publica':            'Concorrência',
    'concorrencia internacional':      'Concorrência Internacional',
    'concorrencia eletronico':         'Concorrência Eletrônica',
    'concorrencia eletronica':         'Concorrência Eletrônica',

    // Tomada de Preços
    'tomada de precos':                'Tomada de Preços',
    'tomada de preco':                 'Tomada de Preços',
    'tp':                              'Tomada de Preços',

    // Convite
    'convite':                         'Convite',
    'carta convite':                   'Convite',

    // Concurso
    'concurso':                        'Concurso',
    'concurso publico':                'Concurso',

    // Leilão
    'leilao':                          'Leilão',
    'leilao eletronico':               'Leilão Eletrônico',

    // Diálogo Competitivo
    'dialogo competitivo':             'Diálogo Competitivo',
    'dc':                              'Diálogo Competitivo',

    // Inexigibilidade
    'inexigibilidade':                 'Inexigibilidade',
    'inexigibilidade de licitacao':    'Inexigibilidade',
    'inexigib.':                       'Inexigibilidade',
    'inexig':                          'Inexigibilidade',

    // Dispensa
    'dispensa':                        'Dispensa de Licitação',
    'dispensa de licitacao':           'Dispensa de Licitação',
    'dispensa de licitacao eletronica':'Dispensa de Licitação Eletrônica',
    'dispensa eletronico':             'Dispensa de Licitação Eletrônica',
    'dispensa eletronica':             'Dispensa de Licitação Eletrônica',
    'dl':                              'Dispensa de Licitação',

    // Credenciamento
    'credenciamento':                  'Credenciamento',

    // PPP / Concessão
    'ppp':                             'PPP / Parceria Público-Privada',
    'parceria publico-privada':        'PPP / Parceria Público-Privada',
    'parceria publico privada':        'PPP / Parceria Público-Privada',
    'concessao':                       'Concessão',
    'concessao publica':               'Concessão',

    // Emergencial / Outros
    'contratacao emergencial':         'Contratação Emergencial',
    'emergencial':                     'Contratação Emergencial',
    'contratacao direta':              'Contratação Direta',
    'adesao a ata':                    'Adesão à Ata de RP',
    'adesao ata':                      'Adesão à Ata de RP',
    'registro de precos':              'Sistema de Registro de Preços',
    'srp':                             'Sistema de Registro de Preços',
  };

  /**
   * TIPO DE OBJETO — mapeia variações para a categoria oficial ALICE / PNCP
   */
  const DICT_TIPO_OBJETO = {
    // Obras
    'obra':                            'Obras',
    'obras':                           'Obras',
    'obras e servicos de engenharia':  'Obras e Serviços de Engenharia',
    'obras/engenharia':                'Obras e Serviços de Engenharia',

    // Serviços de Engenharia
    'servico de engenharia':           'Serviços de Engenharia',
    'servicos de engenharia':          'Serviços de Engenharia',
    'servico engenharia':              'Serviços de Engenharia',
    'engenharia':                      'Serviços de Engenharia',

    // Serviços Comuns
    'servico':                         'Serviços Comuns',
    'servicos':                        'Serviços Comuns',
    'servico comum':                   'Serviços Comuns',
    'servicos comuns':                 'Serviços Comuns',
    'servicos em geral':               'Serviços Comuns',
    'prestacao de servicos':           'Serviços Comuns',
    'servicos continuados':            'Serviços Continuados',
    'servico continuado':              'Serviços Continuados',

    // Compras
    'compra':                          'Compras',
    'compras':                         'Compras',
    'aquisicao':                       'Compras',
    'aquisicoes':                      'Compras',
    'material':                        'Compras',
    'materiais':                       'Compras',
    'bem':                             'Compras',
    'bens':                            'Compras',
    'fornecimento':                    'Compras',
    'fornecimento de materiais':       'Compras',
    'fornecimento de bens':            'Compras',

    // Insumos / Saúde
    'insumo hospitalar':               'Insumos Hospitalares',
    'insumos hospitalares':            'Insumos Hospitalares',
    'material hospitalar':             'Insumos Hospitalares',
    'materiais hospitalares':          'Insumos Hospitalares',
    'medicamento':                     'Medicamentos',
    'medicamentos':                    'Medicamentos',
    'farmaceutico':                    'Medicamentos',

    // Alimentação
    'merenda escolar':                 'Merenda Escolar',
    'alimentacao escolar':             'Merenda Escolar',
    'alimentacao':                     'Alimentação',

    // Mão de obra / TI
    'mao de obra':                     'Mão de Obra / Terceirização',
    'terceirizacao':                   'Mão de Obra / Terceirização',
    'terceirizado':                    'Mão de Obra / Terceirização',
    'tecnologia da informacao':        'Tecnologia da Informação',
    'ti':                              'Tecnologia da Informação',
    'solucao de ti':                   'Tecnologia da Informação',

    // Alienações / Concessões
    'alienacao':                       'Alienações',
    'alienacoes':                      'Alienações',
    'concessao':                       'Concessões',
    'concessoes':                      'Concessões',
    'permissao':                       'Permissões',
    'permissoes':                      'Permissões',

    // Locação
    'locacao':                         'Locação',
    'locacao de imovel':               'Locação de Imóvel',
    'locacao imovel':                  'Locação de Imóvel',
  };

  /**
   * CRITÉRIO DE JULGAMENTO — variações para o padrão oficial
   */
  const DICT_CRITERIO = {
    'menor preco':                     'Menor Preço',
    'menor preco unitario':            'Menor Preço Unitário',
    'menor preco global':              'Menor Preço Global',
    'maior desconto':                  'Maior Desconto',
    'maior lance':                     'Maior Lance',
    'melhor tecnica e preco':          'Melhor Técnica e Preço',
    'tecnica e preco':                 'Melhor Técnica e Preço',
    'melhor tecnica':                  'Melhor Técnica',
    'maior retorno economico':         'Maior Retorno Econômico',
    'conteudo artistico':              'Conteúdo Artístico',
    'nao se aplica':                   'Não se aplica',
    'n/a':                             'Não se aplica',
    'na':                              'Não se aplica',
  };

  /* ─── Normalização de UASG / Órgãos ────────────────────────── */

  /**
   * Normaliza o nome do órgão/UASG:
   * - Colapsa espaços
   * - Converte ALL CAPS para Title Case (exceto siglas curtas ≤ 5 letras)
   * - Mantém siglas em maiúsculo
   */
  function normalizeOrgao(str) {
    if (!str) return '';
    const clean = collapseSpaces(str);
    // Se não estiver em ALL CAPS, apenas colapsa espaços
    if (clean !== clean.toUpperCase()) return clean;
    // ALL CAPS: converte para Title Case preservando siglas curtas (≤5 letras)
    // Usa [A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝ] em vez de [A-ZÀ-Ú] para evitar
    // o range que inclui o caractere × (U+00D7) não-letra
    return clean.replace(/\b(\w{1,5})\b/g, m => m.toUpperCase())
               .replace(/\b(\w{6,})\b/g, m =>
                  m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()
               );
  }

  /* ─── Normalização de texto livre (objeto, nat_despesa) ─────── */

  /**
   * Normaliza campo de texto livre:
   * - Colapsa espaços/quebras de linha
   * - Não aplica title case (preserva a redação original mas limpa espaços)
   */
  function normalizeFreeText(str) {
    return collapseSpaces(String(str || ''));
  }

  /* ─── Normalização completa de uma linha ────────────────────── */

  /**
   * Aplica o pipeline completo de normalização a uma linha do dataset.
   * Modifica o objeto in-place e também salva a forma original para auditoria.
   *
   * @param {Object} row
   * @returns {Object} — a mesma linha (mutada)
   */
  function normalizeRow(row) {
    // Campos categóricos — aplicar dicionário
    if (row.modalidade !== undefined) {
      row._modalidade_original = row.modalidade;
      row.modalidade = resolve(row.modalidade, DICT_MODALIDADE);
    }

    if (row.tipo_objeto !== undefined) {
      row._tipo_objeto_original = row.tipo_objeto;
      row.tipo_objeto = resolve(row.tipo_objeto, DICT_TIPO_OBJETO);
    }

    if (row.criterio !== undefined) {
      row._criterio_original = row.criterio;
      row.criterio = resolve(row.criterio, DICT_CRITERIO);
    }

    // Nome do órgão — normalização de caixa e espaços
    if (row.nome_Uasg !== undefined) {
      row._nome_uasg_original = row.nome_Uasg;
      row.nome_Uasg = normalizeOrgao(row.nome_Uasg);
    }

    // Texto livre — apenas limpeza de espaços
    if (row.objeto !== undefined) {
      row.objeto = normalizeFreeText(row.objeto);
    }
    if (row.nat_despesa !== undefined) {
      row.nat_despesa = normalizeFreeText(row.nat_despesa);
    }
    if (row.fonte_recursos !== undefined) {
      row.fonte_recursos = normalizeFreeText(row.fonte_recursos);
    }
    if (row.observacoes !== undefined) {
      row.observacoes = normalizeFreeText(row.observacoes);
    }
    if (row.processo !== undefined) {
      row.processo = collapseSpaces(String(row.processo || ''));
    }

    return row;
  }

  /**
   * Normaliza todo o dataset.
   * Deve ser chamado ANTES de Classifier.classifyAll() e ANTES de
   * popular os dropdowns de filtro.
   *
   * @param {Object[]} data
   * @returns {Object[]}
   */
  function normalizeAll(data) {
    data.forEach(normalizeRow);
    return data;
  }

  /* ─── Estatísticas de normalização ─────────────────────────── */

  /**
   * Retorna um relatório de quantas linhas tiveram cada campo alterado.
   * Útil para debug / log de qualidade dos dados.
   *
   * @param {Object[]} data — dataset JÁ normalizado
   * @returns {Object}
   */
  function getNormalizationReport(data) {
    const changed = { modalidade: 0, tipo_objeto: 0, criterio: 0, nome_Uasg: 0 };
    data.forEach(r => {
      if (r._modalidade_original  !== undefined && r._modalidade_original  !== r.modalidade)  changed.modalidade++;
      if (r._tipo_objeto_original  !== undefined && r._tipo_objeto_original !== r.tipo_objeto) changed.tipo_objeto++;
      if (r._criterio_original     !== undefined && r._criterio_original    !== r.criterio)    changed.criterio++;
      if (r._nome_uasg_original    !== undefined && r._nome_uasg_original   !== r.nome_Uasg)   changed.nome_Uasg++;
    });
    return { total: data.length, changed };
  }

  /* ─── API pública ───────────────────────────────────────────── */
  return {
    normalizeAll,
    normalizeRow,
    getNormalizationReport,
    // Utilities exposed for testing / external use
    canonical,
    stripAccents,
    collapseSpaces,
    toTitleCase,
    // Dictionaries exposed so they can be extended at runtime
    DICT_MODALIDADE,
    DICT_TIPO_OBJETO,
    DICT_CRITERIO,
  };

})();
