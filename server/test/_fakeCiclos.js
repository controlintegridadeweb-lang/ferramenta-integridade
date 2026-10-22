'use strict';

/* Fake do client Supabase para os testes de CICLOS. Replica fielmente a
   semântica das funções SQL de supabase_cycles_schema.sql:
   - sincronizar_obrigatorios: insere só novos (on conflict do nothing)
   - transicionar_analise: FINALIZADO é terminal; valida destino
   - gerar_relatorio: numeração sequencial atômica; finaliza só os VALIDADO
   Implementa também o subset do query builder e do storage usado pelo repo. */

function criarFakeCiclos() {
  const analises   = new Map();   // uid -> { uid, status, processo, snapshot, analista_id, data_validacao, relatorio_id }
  const relatorios = [];          // { id, numero, gerado_por, gerado_em, total_registros, pdf_path, pdf_url }
  const vinculos   = [];          // { relatorio_id, uid, snapshot }
  const storage    = new Map();   // path -> buffer
  let _relId = 0;

  function aplicarFiltros(rows, filtros) {
    let r = rows;
    for (const f of filtros) {
      if (f.op === 'in') r = r.filter(row => f.val.includes(row[f.col]));
      else r = r.filter(row => row[f.col] === f.val);
    }
    return r;
  }

  function from(tabela) {
    const estado = { filtros: [], ordem: null, _single: false, _limit: null };

    const builder = {
      select() { return builder; },
      eq(col, val) { estado.filtros.push({ col, val }); return builder; },
      in(col, vals) { estado.filtros.push({ col, val: vals, op: 'in' }); return builder; },
      insert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const criados = [];
        if (tabela === 'relatorios') {
          rows.forEach(row => {
            const rel = {
              id: ++_relId,
              numero: row.numero,
              gerado_por: row.gerado_por || null,
              gerado_em: new Date().toISOString(),
              total_registros: row.total_registros || 0,
              pdf_path: null,
              pdf_url: null,
            };
            relatorios.push(rel);
            criados.push({ ...rel });
          });
        } else if (tabela === 'relatorio_registros') {
          rows.forEach(row => {
            vinculos.push({ ...row });
            criados.push({ ...row });
          });
        }
        estado._inserted = criados;
        return builder;
      },
      update(payload) { estado._update = payload; return builder; },
      order(col, opts) { estado.ordem = { col, asc: opts ? opts.ascending : true }; return builder; },
      limit(n) { estado._limit = n; return builder; },
      single() { estado._single = true; return builder; },
      range(fromI, toI) {
        const data = resolver().slice(fromI, toI + 1);
        return Promise.resolve({ data, error: null });
      },
      then(resolve, reject) {   // torna o builder "awaitable" sem .range()
        try {
          if (estado._update && tabela === 'relatorios') {
            const alvos = aplicarFiltros(relatorios, estado.filtros);
            alvos.forEach(r => Object.assign(r, estado._update));
            resolve({ data: null, error: null });
            return;
          }
          if (estado._inserted) {
            const data = estado._single ? (estado._inserted[0] || null) : estado._inserted;
            resolve({ data, error: null });
            return;
          }
          let data = resolver();
          if (estado._single) data = data[0] || null;
          resolve({ data, error: null });
        } catch (e) { reject ? reject(e) : resolve({ data: null, error: e }); }
      },
    };

    function resolver() {
      let base;
      if (tabela === 'analises') base = [...analises.values()];
      else if (tabela === 'relatorios') base = [...relatorios];
      else if (tabela === 'relatorio_registros') base = [...vinculos];
      else base = [];
      base = aplicarFiltros(base, estado.filtros);
      if (estado.ordem) {
        base.sort((a, b) => (a[estado.ordem.col] > b[estado.ordem.col] ? 1 : -1) * (estado.ordem.asc ? 1 : -1));
      }
      if (estado._limit != null) base = base.slice(0, estado._limit);
      return base.map(x => ({ ...x }));
    }

    return builder;
  }

  function rpc(fn, args) {
    if (fn === 'sincronizar_obrigatorios') {
      let inseridos = 0;
      for (const item of (args.p_registros || [])) {
        if (!analises.has(item.uid)) {
          analises.set(item.uid, {
            uid: item.uid, status: 'PENDENTE', processo: item.processo || null,
            snapshot: item.snapshot || {}, analista_id: null, data_validacao: null, relatorio_id: null,
          });
          inseridos++;
        }
      }
      return Promise.resolve({ data: inseridos, error: null });
    }

    if (fn === 'transicionar_analise') {
      const a = analises.get(args.p_uid);
      if (!a) return Promise.resolve({ data: null, error: { code: 'P0002', message: `analise_inexistente: ${args.p_uid}` } });
      if (a.status === 'FINALIZADO') return Promise.resolve({ data: null, error: { code: 'P0001', message: 'finalizado_imutavel' } });
      if (!['PENDENTE', 'EM_ANALISE', 'VALIDADO'].includes(args.p_novo)) {
        return Promise.resolve({ data: null, error: { code: 'P0001', message: 'status_invalido' } });
      }
      a.status = args.p_novo;
      if (args.p_analista) a.analista_id = args.p_analista;
      if (args.p_novo === 'VALIDADO') a.data_validacao = new Date().toISOString();
      if (args.p_novo === 'EM_ANALISE') a.data_validacao = null;
      return Promise.resolve({ data: { ...a }, error: null });
    }

    if (fn === 'gerar_relatorio') {
      const elegiveis = (args.p_uids || []).filter(u => {
        const a = analises.get(u); return a && a.status === 'VALIDADO';
      });
      if (elegiveis.length === 0) {
        return Promise.resolve({ data: null, error: { code: 'P0001', message: 'sem_registros_validados' } });
      }
      const numero = relatorios.reduce((m, r) => Math.max(m, r.numero), 0) + 1;
      const rel = {
        id: ++_relId, numero, gerado_por: args.p_gerado_por || null,
        gerado_em: new Date().toISOString(), total_registros: elegiveis.length,
        pdf_path: null, pdf_url: null,
      };
      relatorios.push(rel);
      for (const u of elegiveis) {
        const a = analises.get(u);
        vinculos.push({ relatorio_id: rel.id, uid: u, snapshot: a.snapshot });
        a.status = 'FINALIZADO'; a.relatorio_id = rel.id;
      }
      return Promise.resolve({ data: { ...rel }, error: null });
    }

    if (fn === 'atualizar_pdf_relatorio') {
      const rel = relatorios.find(r => r.id === args.p_id);
      if (rel) { rel.pdf_path = args.p_pdf_path; rel.pdf_url = args.p_pdf_url; }
      return Promise.resolve({ data: null, error: null });
    }

    return Promise.resolve({ data: null, error: { message: `rpc desconhecida: ${fn}` } });
  }

  const storageApi = {
    from() {
      return {
        upload(path, buffer) { storage.set(path, buffer); return Promise.resolve({ data: { path }, error: null }); },
        getPublicUrl(path) { return { data: { publicUrl: `https://fake.storage/${path}` } }; },
      };
    },
  };

  return {
    _analises: analises, _relatorios: relatorios, _vinculos: vinculos, _storage: storage,
    from, rpc, storage: storageApi,
  };
}

module.exports = { criarFakeCiclos };
