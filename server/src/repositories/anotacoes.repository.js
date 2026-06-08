'use strict';

const supabase = require('../config/supabase');
const config = require('../config');

const TABLE = config.supabase.table;
const PAGE = 1000;

/* Acesso a dados puro: só fala com o Supabase, sem regra de negócio nem HTTP.
   As escritas passam pelas funções RPC (upsert_anotacao/delete_anotacao), que
   fazem versionamento + auditoria numa única transação no banco. */
const anotacoesRepository = {
  async listarTodas() {
    const mapa = {};
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('uid, dados, versao')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      (data || []).forEach(r => { mapa[r.uid] = { dados: r.dados || {}, versao: r.versao }; });
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return mapa;
  },

  /* Upsert via RPC. Retorna a linha resultante (com versao nova).
     Em conflito de versão, o banco ergue P0001 → propagamos com .code. */
  async upsert({ uid, dados, ator, origemIp, versaoEsperada }) {
    const { data, error } = await supabase.rpc('upsert_anotacao', {
      p_uid:             uid,
      p_dados:           dados,
      p_ator:            ator || null,
      p_origem_ip:       origemIp || null,
      p_versao_esperada: versaoEsperada,
    });
    if (error) {
      const e = new Error(error.message || 'Erro no upsert.');
      e.code = error.code;            // 'P0001' em conflito
      e.pgMessage = error.message;
      throw e;
    }
    return data;
  },

  async remover({ uid, ator, origemIp }) {
    const { error } = await supabase.rpc('delete_anotacao', {
      p_uid:       uid,
      p_ator:      ator || null,
      p_origem_ip: origemIp || null,
    });
    if (error) throw error;
  },
};

module.exports = anotacoesRepository;
