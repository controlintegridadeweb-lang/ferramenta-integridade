'use strict';

const crypto = require('crypto');
const config = require('../config');
const cache  = require('../repositories/sheetsCache.repository');

/* Lida com o Google Sheets de forma resiliente:
   1. Serve do cache em memória enquanto o TTL não expira.
   2. Ao expirar, baixa o XLSX, calcula o hash do conteúdo e versiona.
      Conteúdo idêntico NÃO gera nova versão (mesmo hash).
   3. Se o Google falhar, cai de volta na última versão boa do disco —
      a ferramenta continua funcionando com dado rastreável.
   Toda importação fica registrada (hash, tamanho, horário, origem). */

let _memBuffer = null;   // bytes da versão atual em memória
let _memMeta   = null;   // metadados da versão atual
let _buscadoEm = 0;      // epoch ms da última busca no Google

function hashConteudo(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function ttlExpirado() {
  const ttl = config.sheets.cacheTtlSeg;
  if (ttl <= 0 && _memBuffer) return false;      // TTL 0 = só busca quando forçado
  return (Date.now() - _buscadoEm) >= ttl * 1000;
}

async function baixarDoGoogle() {
  const idMatch = config.sheets.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    return { erro: 'SHEETS_URL inválida no servidor.', status: 500 };
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=xlsx`;
  const r = await fetch(exportUrl, { redirect: 'follow' });

  if (!r.ok) {
    return {
      status: 502,
      erro: r.status === 404
        ? 'Planilha não encontrada. Verifique a SHEETS_URL no servidor.'
        : `Planilha inacessível (HTTP ${r.status}). Confirme o compartilhamento público.`,
    };
  }

  const ct = r.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    return {
      status: 502,
      erro: 'A planilha não está pública. Compartilhe como "Qualquer pessoa com o link → Leitor".',
    };
  }

  return { buffer: Buffer.from(await r.arrayBuffer()) };
}

/* Hidrata a memória a partir do disco na primeira chamada após reiniciar. */
async function hidratarDoDisco() {
  if (_memBuffer || _memMeta) return;
  const manifest = await cache.lerManifest();
  if (manifest && cache.existeVersao(manifest.hash)) {
    _memMeta   = manifest;
    _memBuffer = await cache.lerBuffer(manifest.hash);
  }
}

const sheetsService = {
  ativo() {
    return config.sheets.ativo;
  },

  /* Retorna { buffer, meta } ou { erro, status }.
     forcar=true ignora o TTL e busca direto no Google. */
  async obter({ forcar = false } = {}) {
    if (!config.sheets.ativo) {
      return { erro: 'Planilha não configurada no servidor.', status: 503 };
    }

    await hidratarDoDisco();

    // Cache quente e válido → serve direto.
    if (!forcar && _memBuffer && !ttlExpirado()) {
      return { buffer: _memBuffer, meta: { ..._memMeta, cache: 'hit' } };
    }

    // Precisa (re)buscar no Google.
    const baixado = await baixarDoGoogle();

    if (baixado.erro) {
      // Fallback: usa a última versão boa, se houver.
      if (_memBuffer) {
        return { buffer: _memBuffer, meta: { ..._memMeta, cache: 'stale', avisoOrigem: baixado.erro } };
      }
      return baixado; // sem fallback possível
    }

    const hash = hashConteudo(baixado.buffer);
    _buscadoEm = Date.now();

    // Conteúdo igual ao atual → não versiona de novo, só renova o relógio.
    if (_memMeta && _memMeta.hash === hash) {
      _memBuffer = baixado.buffer;
      return { buffer: _memBuffer, meta: { ..._memMeta, cache: 'revalidado' } };
    }

    const meta = await cache.salvarVersao({ hash, buffer: baixado.buffer, origem: config.sheets.url });
    _memBuffer = baixado.buffer;
    _memMeta   = meta;
    return { buffer: _memBuffer, meta: { ...meta, cache: 'miss' } };
  },

  /* Metadados da versão atual, sem devolver os bytes. */
  async meta() {
    if (!config.sheets.ativo) return { erro: 'Planilha não configurada no servidor.', status: 503 };
    await hidratarDoDisco();
    if (!_memMeta) return { meta: null };
    return { meta: _memMeta };
  },

  /* Histórico de importações. */
  async historico(limite) {
    if (!config.sheets.ativo) return { erro: 'Planilha não configurada no servidor.', status: 503 };
    const registros = await cache.lerHistorico(limite);
    return { historico: registros };
  },
};

module.exports = sheetsService;
