'use strict';

/* Fake do client Supabase para testes de API sem banco real.
   Replica o comportamento das funções SQL upsert_anotacao/delete_anotacao:
   versionamento, conflito otimista (P0001) e auditoria em memória. */

function criarFakeSupabase() {
  const tabela = new Map();       // uid -> { uid, dados, versao, atualizado_por }
  const auditoria = [];           // registros append-only

  function builderSelect() {
    return {
      _rows: [...tabela.values()].map(r => ({ uid: r.uid, dados: r.dados, versao: r.versao })),
      select() { return this; },
      range(from, to) {
        return Promise.resolve({ data: this._rows.slice(from, to + 1), error: null });
      },
    };
  }

  return {
    _tabela: tabela,
    _auditoria: auditoria,

    from() {
      return { select: () => builderSelect() };
    },

    rpc(fn, args) {
      if (fn === 'upsert_anotacao') {
        const { p_uid, p_dados, p_ator, p_origem_ip, p_versao_esperada } = args;
        const atual = tabela.get(p_uid);
        if (atual && p_versao_esperada != null && atual.versao !== p_versao_esperada) {
          return Promise.resolve({
            data: null,
            error: { code: 'P0001', message: `conflito_versao: esperado ${p_versao_esperada}, atual ${atual.versao}` },
          });
        }
        const versao = atual ? atual.versao + 1 : 1;
        const linha = { uid: p_uid, dados: p_dados, versao, atualizado_por: p_ator };
        tabela.set(p_uid, linha);
        auditoria.push({
          uid: p_uid, acao: 'upsert', ator: p_ator, versao_nova: versao,
          dados_antes: atual ? atual.dados : null, dados_depois: p_dados, origem_ip: p_origem_ip,
        });
        return Promise.resolve({ data: linha, error: null });
      }

      if (fn === 'delete_anotacao') {
        const { p_uid, p_ator, p_origem_ip } = args;
        const atual = tabela.get(p_uid);
        if (atual) {
          tabela.delete(p_uid);
          auditoria.push({
            uid: p_uid, acao: 'delete', ator: p_ator, versao_nova: null,
            dados_antes: atual.dados, dados_depois: null, origem_ip: p_origem_ip,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }

      return Promise.resolve({ data: null, error: { message: `rpc desconhecida: ${fn}` } });
    },
  };
}

module.exports = { criarFakeSupabase };
