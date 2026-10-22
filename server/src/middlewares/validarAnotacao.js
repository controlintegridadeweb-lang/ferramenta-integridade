'use strict';

/* Validação de payload das anotações. A whitelist espelha exatamente os campos
   que o front envia (supabase_store.js → CAMPOS_ANALISTA). Qualquer chave fora
   da lista, tipo inesperado ou tamanho excessivo é rejeitado com 400. Isso
   impede que o cliente grave estrutura arbitrária no jsonb. */

const CAMPOS_PERMITIDOS = {
  _valor_manual:           ['number', 'string', 'null'],
  // O front grava estes dois como OBJETO ({ opcao, ts } e { tipo, data, fonte }).
  // 'string' é mantido apenas por retrocompatibilidade com dados legados.
  _validacao_art8:         ['object', 'string', 'null'],
  _data_referencia_manual: ['object', 'string', 'null'],
  _contrato_assinado:      ['boolean', 'string', 'null'],
  _observacao_manual:      ['string', 'null'],
  _avaliacao_obrig_dados:  ['object', 'null'],
  _concluido:              ['boolean', 'null'],
  _concluido_em:           ['string', 'null'],
};

const MAX_UID_LEN     = 512;
const MAX_DADOS_BYTES = 64 * 1024;   // 64 KB por anotação — folgado e seguro
const MAX_STRING_LEN  = 5000;

function tipoDe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function erro(msg) {
  const e = new Error(msg);
  e.status = 400;
  e.expose = true;
  return e;
}

function validarUid(uid) {
  if (typeof uid !== 'string' || uid.trim() === '') {
    throw erro('uid ausente ou inválido.');
  }
  if (uid.length > MAX_UID_LEN) {
    throw erro(`uid excede o limite de ${MAX_UID_LEN} caracteres.`);
  }
  return uid;
}

function validarDados(dados) {
  if (dados === undefined || dados === null) return {};
  if (tipoDe(dados) !== 'object') {
    throw erro('Campo "dados" deve ser um objeto.');
  }

  const bytes = Buffer.byteLength(JSON.stringify(dados), 'utf8');
  if (bytes > MAX_DADOS_BYTES) {
    throw erro(`"dados" excede o limite de ${MAX_DADOS_BYTES} bytes.`);
  }

  const limpo = {};
  for (const [chave, valor] of Object.entries(dados)) {
    const permitido = CAMPOS_PERMITIDOS[chave];
    if (!permitido) {
      throw erro(`Campo não permitido em "dados": "${chave}".`);
    }
    const t = tipoDe(valor);
    if (!permitido.includes(t)) {
      throw erro(`Campo "${chave}" tem tipo inválido (${t}); esperado: ${permitido.join(' | ')}.`);
    }
    if (t === 'string' && valor.length > MAX_STRING_LEN) {
      throw erro(`Campo "${chave}" excede ${MAX_STRING_LEN} caracteres.`);
    }
    limpo[chave] = valor;
  }
  return limpo;
}

/* Valida a versão esperada vinda do header If-Match (controle de conflito).
   Ausente → null (sem checagem). Presente → inteiro >= 0. */
function validarVersaoEsperada(req) {
  const raw = req.get('if-match');
  if (raw === undefined || raw === '' || raw === '*') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw erro('Header If-Match deve ser um inteiro de versão válido.');
  }
  return n;
}

module.exports = { validarUid, validarDados, validarVersaoEsperada, CAMPOS_PERMITIDOS };
