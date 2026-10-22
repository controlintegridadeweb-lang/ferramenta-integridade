'use strict';

const config = require('../config');
const repo = require('../repositories/ciclos.repository');
const pdf = require('./pdf.service');

function erro(msg, status) {
  const e = new Error(msg); e.status = status; e.expose = true; return e;
}
function exigirPersistencia() {
  if (!config.supabase.ativo) throw erro('Persistência indisponível.', 503);
}

/* Regra de negócio do fluxo operacional por ciclos. */
const ciclosService = {
  ativo() { return config.supabase.ativo; },

  /* Painel: contagens por status + último relatório. */
  async dashboard() {
    if (!config.supabase.ativo) {
      return { pendentes: 0, emAnalise: 0, validados: 0, finalizados: 0, ultimoRelatorio: null, ativo: false };
    }
    const mapa = await repo.listarAnalises();
    const cont = { PENDENTE: 0, EM_ANALISE: 0, VALIDADO: 0, FINALIZADO: 0 };
    Object.values(mapa).forEach(a => { cont[a.status] = (cont[a.status] || 0) + 1; });
    const ultimo = await repo.ultimoRelatorio();
    return {
      ativo: true,
      pendentes: cont.PENDENTE, emAnalise: cont.EM_ANALISE,
      validados: cont.VALIDADO, finalizados: cont.FINALIZADO,
      ultimoRelatorio: ultimo,
    };
  },

  /* Fila de trabalho do ciclo atual: tudo que NÃO está FINALIZADO. */
  async fila() {
    if (!config.supabase.ativo) return {};
    const mapa = await repo.listarAnalises();
    const fila = {};
    for (const [uid, a] of Object.entries(mapa)) {
      if (a.status !== 'FINALIZADO') fila[uid] = a;
    }
    return fila;
  },

  /* Mapa completo de status por uid (para o front cruzar com a planilha). */
  async statusPorUid() {
    if (!config.supabase.ativo) return {};
    return repo.listarAnalises();
  },

  /* Sincroniza os obrigatórios vindos da planilha. Espera array de
     { uid, processo, snapshot }. Só insere novos; nunca reabre finalizados. */
  async sincronizar(registros) {
    exigirPersistencia();
    if (!Array.isArray(registros)) throw erro('Payload deve ser uma lista de registros.', 400);
    const limpos = registros
      .filter(r => r && typeof r.uid === 'string' && r.uid.trim())
      .map(r => ({ uid: r.uid, processo: r.processo || null, snapshot: r.snapshot || {} }));
    const inseridos = await repo.sincronizar(limpos);
    return { inseridos, recebidos: limpos.length };
  },

  async transicionar({ uid, novo, analista }) {
    exigirPersistencia();
    if (!uid) throw erro('uid ausente.', 400);
    try {
      return await repo.transicionar({ uid, novo, analista });
    } catch (e) {
      const msg = e.pgMessage || e.message || '';
      if (/finalizado_imutavel/.test(msg)) throw erro('Registro já finalizado: não pode mudar de status.', 409);
      if (/analise_inexistente/.test(msg)) throw erro('Registro não encontrado na fila de análise.', 404);
      if (/status_invalido/.test(msg))     throw erro('Status de destino inválido.', 400);
      throw e;
    }
  },

  /* Gera o relatório (lote fechado). O PDF é renderizado no SERVIDOR a partir do
     HTML enviado pelo front (Chrome headless → PDF vetorial), com upload ao
     Storage. Retorna o relatório completo.
     incluirFinalizados: o analista pediu o PDF dos já concluídos. Eles entram
     no relatório sem reabrir o ciclo (FINALIZADO continua terminal). */
  async gerarRelatorio({ uids, geradoPor, html, incluirFinalizados }) {
    exigirPersistencia();
    if (!Array.isArray(uids) || uids.length === 0) throw erro('Informe os registros do relatório.', 400);

    const mapa = await repo.listarAnalises();
    const validado = [];
    const finalizado = [];
    for (const uid of uids) {
      const a = mapa[uid];
      if (!a) continue;
      if (a.status === 'VALIDADO') validado.push(uid);
      else if (a.status === 'FINALIZADO' && incluirFinalizados) finalizado.push(uid);
    }

    if (validado.length === 0 && finalizado.length === 0) {
      throw erro(
        incluirFinalizados
          ? 'Nenhum processo concluído para incluir no relatório.'
          : 'Nenhum dos registros está VALIDADO. Valide antes de gerar o relatório.',
        409
      );
    }

    let rel = null;
    if (validado.length) {
      try {
        rel = await repo.gerarRelatorio({ uids: validado, geradoPor });
      } catch (e) {
        const msg = e.pgMessage || e.message || '';
        if (/sem_registros_validados/.test(msg)) {
          throw erro('Nenhum dos registros está VALIDADO. Valide antes de gerar o relatório.', 409);
        }
        throw e;
      }
    }

    if (finalizado.length) {
      const snaps = await repo.snapshotsDe(finalizado);
      const itens = finalizado.map(uid => ({ uid, snapshot: snaps[uid] || {} }));
      if (!rel) {
        rel = await repo.criarRelatorioAvulso({ geradoPor, total: finalizado.length });
        await repo.vincularRegistros(rel.id, itens);
      } else {
        await repo.vincularRegistros(rel.id, itens);
        rel.total_registros = validado.length + finalizado.length;
        await repo.atualizarTotal(rel.id, rel.total_registros);
      }
    }

    await this._renderizarEAnexarPdf(rel, html);
    return rel;
  },

  /* Renderiza o HTML em PDF (servidor) e anexa ao relatório. Tolerante a falha:
     o relatório já está fechado de forma consistente — só o PDF pode faltar. */
  async _renderizarEAnexarPdf(rel, html) {
    if (!html) {
      rel._avisoPdf = 'Relatório gerado, mas sem HTML para produzir o PDF.';
      return rel;
    }
    try {
      const buffer = await pdf.htmlParaPdf(html);
      const path = `relatorio-${String(rel.numero).padStart(3, '0')}-${rel.id}.pdf`;
      const url = await repo.uploadPdf({ path, buffer });
      await repo.anexarPdf({ id: rel.id, pdfPath: path, pdfUrl: url });
      rel.pdf_url = url; rel.pdf_path = path;
    } catch (e) {
      const detalhe = e.message || String(e);
      console.error('[ciclos] Relatório criado, mas a geração/upload do PDF falhou:', detalhe);
      rel._avisoPdf = /bucket not found/i.test(detalhe)
        ? 'Relatório gerado, mas o bucket "relatorios" não existe no Supabase Storage.'
        : `Relatório gerado, mas o PDF não pôde ser produzido: ${detalhe}`;
    }
    return rel;
  },

  /* Regenera o PDF de um relatório JÁ existente (sem reabrir o ciclo). Usado
     para corrigir relatórios antigos cujo PDF ficou ausente/inválido. */
  async regerarPdf({ id, html }) {
    exigirPersistencia();
    const n = Number(id);
    if (!Number.isInteger(n)) throw erro('id de relatório inválido.', 400);
    const { relatorio } = await repo.obterRelatorio(n);
    if (!relatorio) throw erro('Relatório não encontrado.', 404);
    await this._renderizarEAnexarPdf(relatorio, html);
    return relatorio;
  },

  async listarRelatorios() {
    if (!config.supabase.ativo) return [];
    return repo.listarRelatorios();
  },

  async obterRelatorio(id) {
    exigirPersistencia();
    const n = Number(id);
    if (!Number.isInteger(n)) throw erro('id de relatório inválido.', 400);
    return repo.obterRelatorio(n);
  },
};

module.exports = ciclosService;
