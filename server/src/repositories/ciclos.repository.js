'use strict';

const supabase = require('../config/supabase');
const config = require('../config');

const PAGE = 1000;

/* Acesso a dados do fluxo de ciclos. Escritas passam pelas funções RPC
   (sincronizar_obrigatorios, transicionar_analise, gerar_relatorio,
   atualizar_pdf_relatorio), que garantem atomicidade e regras no banco. */
const ciclosRepository = {
  /* ── Análises ──────────────────────────────────────────────────────────── */
  async listarAnalises(filtroStatus) {
    const mapa = {};
    let from = 0;
    while (true) {
      let q = supabase
        .from('analises')
        .select('uid, status, processo, analista_id, data_validacao, relatorio_id')
        .range(from, from + PAGE - 1);
      if (filtroStatus) q = q.eq('status', filtroStatus);
      const { data, error } = await q;
      if (error) throw error;
      (data || []).forEach(r => { mapa[r.uid] = r; });
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return mapa;
  },

  async sincronizar(registros) {
    const { data, error } = await supabase.rpc('sincronizar_obrigatorios', { p_registros: registros });
    if (error) throw error;
    return data;   // nº de inseridos
  },

  async transicionar({ uid, novo, analista }) {
    const { data, error } = await supabase.rpc('transicionar_analise', {
      p_uid: uid, p_novo: novo, p_analista: analista || null,
    });
    if (error) {
      const e = new Error(error.message || 'Erro na transição.');
      e.code = error.code; e.pgMessage = error.message;
      throw e;
    }
    return data;
  },

  /* ── Relatórios ────────────────────────────────────────────────────────── */
  async gerarRelatorio({ uids, geradoPor }) {
    const { data, error } = await supabase.rpc('gerar_relatorio', {
      p_uids: uids, p_gerado_por: geradoPor || null,
    });
    if (error) {
      const e = new Error(error.message || 'Erro ao gerar relatório.');
      e.code = error.code; e.pgMessage = error.message;
      throw e;
    }
    return data;
  },

  /* Snapshots dos uids pedidos — usado ao incluir concluídos já finalizados. */
  async snapshotsDe(uids) {
    if (!uids || !uids.length) return {};
    const { data, error } = await supabase.from('analises').select('uid, snapshot').in('uid', uids);
    if (error) throw error;
    const mapa = {};
    (data || []).forEach(r => { mapa[r.uid] = r.snapshot || {}; });
    return mapa;
  },

  /* Relatório só com processos já concluídos (não há VALIDADO para o RPC). */
  async criarRelatorioAvulso({ geradoPor, total }) {
    const ultimo = await this.ultimoRelatorio();
    const numero = ((ultimo && ultimo.numero) || 0) + 1;
    const { data, error } = await supabase.from('relatorios').insert({
      numero,
      gerado_por: geradoPor || null,
      total_registros: total,
    }).select('*').single();
    if (error) throw error;
    return data;
  },

  async vincularRegistros(relatorioId, itens) {
    if (!itens || !itens.length) return;
    const rows = itens.map(i => ({
      relatorio_id: relatorioId,
      uid: i.uid,
      snapshot: i.snapshot || {},
    }));
    const { error } = await supabase.from('relatorio_registros').insert(rows);
    if (error) throw error;
  },

  async atualizarTotal(id, total) {
    const { error } = await supabase.from('relatorios').update({ total_registros: total }).eq('id', id);
    if (error) throw error;
  },

  async anexarPdf({ id, pdfPath, pdfUrl }) {
    const { error } = await supabase.rpc('atualizar_pdf_relatorio', {
      p_id: id, p_pdf_path: pdfPath, p_pdf_url: pdfUrl,
    });
    if (error) throw error;
  },

  async listarRelatorios() {
    const { data, error } = await supabase
      .from('relatorios')
      .select('id, numero, gerado_por, gerado_em, total_registros, pdf_url')
      .order('numero', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async obterRelatorio(id) {
    const { data: rel, error: e1 } = await supabase
      .from('relatorios').select('*').eq('id', id).single();
    if (e1) throw e1;
    const { data: regs, error: e2 } = await supabase
      .from('relatorio_registros').select('uid, snapshot').eq('relatorio_id', id);
    if (e2) throw e2;
    return { relatorio: rel, registros: regs || [] };
  },

  async ultimoRelatorio() {
    const { data, error } = await supabase
      .from('relatorios')
      .select('id, numero, gerado_por, gerado_em, total_registros, pdf_url')
      .order('numero', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  },

  /* ── Storage do PDF ────────────────────────────────────────────────────── */
  async garantirBucketRelatorios() {
    const bucket = config.relatorios.bucket;
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) throw listErr;
    if ((buckets || []).some(b => b.name === bucket)) return false;

    const { error } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 25 * 1024 * 1024,
    });
    if (error) throw error;
    return true;
  },

  async uploadPdf({ path, buffer }) {
    const { error } = await supabase.storage
      .from(config.relatorios.bucket)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(config.relatorios.bucket).getPublicUrl(path);
    return data ? data.publicUrl : null;
  },
};

module.exports = ciclosRepository;
