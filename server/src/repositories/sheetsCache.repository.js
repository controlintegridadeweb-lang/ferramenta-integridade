'use strict';

const fs   = require('fs');
const fsp  = require('fs/promises');
const path = require('path');
const config = require('../config');

const DIR          = config.sheets.dataDir;
const MANIFEST     = path.join(DIR, 'manifest.json');
const HISTORY      = path.join(DIR, 'history.jsonl');
const KEEP         = config.sheets.keepVersoes;

/* Acesso a dados do cache da planilha:
   - guarda cada versão baixada em disco, nomeada pelo hash do conteúdo
   - mantém um manifest.json com a versão "atual" (a última válida)
   - registra todas as importações em history.jsonl (append-only)
   Nenhuma regra de negócio aqui: só I/O. */
const sheetsCacheRepository = {
  async _garantirDir() {
    await fsp.mkdir(DIR, { recursive: true });
  },

  caminhoVersao(hash) {
    return path.join(DIR, `sheet-${hash}.xlsx`);
  },

  /* Lê o manifest (versão atual) ou null se ainda não houver cache. */
  async lerManifest() {
    try {
      const txt = await fsp.readFile(MANIFEST, 'utf8');
      return JSON.parse(txt);
    } catch (_) {
      return null;
    }
  },

  /* Lê os bytes de uma versão específica. */
  async lerBuffer(hash) {
    return fsp.readFile(this.caminhoVersao(hash));
  },

  existeVersao(hash) {
    return fs.existsSync(this.caminhoVersao(hash));
  },

  /* Grava uma nova versão (se ainda não existir), atualiza o manifest e
     adiciona uma linha ao histórico. Retorna o registro de metadados. */
  async salvarVersao({ hash, buffer, origem }) {
    await this._garantirDir();

    const novo = !this.existeVersao(hash);
    if (novo) {
      await fsp.writeFile(this.caminhoVersao(hash), buffer);
    }

    const meta = {
      hash,
      tamanhoBytes: buffer.length,
      importadoEm:  new Date().toISOString(),
      origem:       origem || config.sheets.url || 'desconhecida',
      novaVersao:   novo,
    };

    await fsp.writeFile(MANIFEST, JSON.stringify(meta, null, 2));
    await fsp.appendFile(HISTORY, JSON.stringify(meta) + '\n');

    if (novo) await this._podarAntigas();
    return meta;
  },

  /* Lê o histórico de importações (mais recente primeiro). */
  async lerHistorico(limite = 50) {
    try {
      const txt = await fsp.readFile(HISTORY, 'utf8');
      const linhas = txt.split('\n').filter(Boolean);
      const regs = linhas.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return regs.reverse().slice(0, limite);
    } catch (_) {
      return [];
    }
  },

  /* Remove arquivos de versões além do limite KEEP, preservando o atual. */
  async _podarAntigas() {
    try {
      const manifest = await this.lerManifest();
      const atual = manifest && manifest.hash;
      const arquivos = (await fsp.readdir(DIR))
        .filter(f => f.startsWith('sheet-') && f.endsWith('.xlsx'));

      if (arquivos.length <= KEEP) return;

      const comStat = await Promise.all(arquivos.map(async f => ({
        f,
        mtime: (await fsp.stat(path.join(DIR, f))).mtimeMs,
      })));
      comStat.sort((a, b) => b.mtime - a.mtime); // recentes primeiro

      for (const { f } of comStat.slice(KEEP)) {
        if (atual && f === `sheet-${atual}.xlsx`) continue; // nunca apaga o atual
        await fsp.unlink(path.join(DIR, f)).catch(() => {});
      }
    } catch (_) { /* poda é best-effort */ }
  },
};

module.exports = sheetsCacheRepository;
