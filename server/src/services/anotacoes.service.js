'use strict';

const config = require('../config');
const repo = require('../repositories/anotacoes.repository');

function erro(msg, status) {
  const e = new Error(msg);
  e.status = status;
  e.expose = true;
  return e;
}

function exigirPersistencia() {
  if (!config.supabase.ativo) throw erro('Persistência indisponível.', 503);
}

/* Regra de negócio. Decide o que fazer quando a persistência está inativa,
   repassa ator/IP para a auditoria e traduz o conflito de versão em 409. */
const anotacoesService = {
  ativo() {
    return config.supabase.ativo;
  },

  async listar() {
    if (!config.supabase.ativo) return {};
    return repo.listarTodas();   // { uid: { dados, versao } }
  },

  async salvar({ uid, dados, ator, origemIp, versaoEsperada }) {
    exigirPersistencia();
    if (!uid) throw erro('uid ausente.', 400);
    try {
      const linha = await repo.upsert({ uid, dados: dados || {}, ator, origemIp, versaoEsperada });
      return { uid: linha.uid, versao: linha.versao };
    } catch (e) {
      if (e.code === 'P0001' || /conflito_versao/.test(e.pgMessage || e.message || '')) {
        throw erro('Conflito de versão: a anotação foi alterada por outro usuário. Recarregue e tente novamente.', 409);
      }
      throw e;
    }
  },

  async remover({ uid, ator, origemIp }) {
    exigirPersistencia();
    if (!uid) throw erro('uid ausente.', 400);
    await repo.remover({ uid, ator, origemIp });
  },
};

module.exports = anotacoesService;
