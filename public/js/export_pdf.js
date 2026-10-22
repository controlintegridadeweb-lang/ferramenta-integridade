'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS INTERNOS
   ═══════════════════════════════════════════════════════════════════════════ */

function _pdf_fmtBRL(v) {
  if (!v || v <= 0) return 'Não informado / Orçamento sigiloso';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _pdf_fmtDate(s) {
  if (!s) return '—';
  // Tenta usar Classifier se disponível; caso contrário usa lógica interna
  let iso = null;
  try { iso = Classifier.normalizeDateToISO(s); } catch(e) {}
  if (!iso) {
    // Fallback: detecta formatos DD/MM/AAAA ou AAAA-MM-DD
    const str = String(s).trim();
    const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) return str.slice(0, 10); // já está no formato correto
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) iso = str.slice(0, 10);
  }
  if (!iso) return String(s);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function _pdf_art1Label(row) {
  if (row._excluido_art1) {
    try {
      const info = Classifier.getOrgaoExcluidoInfo(row);
      return info ? `Excluído — ${info.nome || info.sigla} (empresa pública/economia mista)` : 'Excluído pelo Art. 1º';
    } catch(e) { return 'Excluído pelo Art. 1º'; }
  }
  return 'Enquadrado no âmbito do Decreto (admin. direta / autarquia / fundação)';
}

function _pdf_art2Label(row) {
  if (row._excluido_art1) return 'Não verificado — órgão excluído pelo Art. 1º';
  if (row._isSigiloso)   return 'Indeterminado — valor estimado não disponível';
  if (!row._requerAlice) return 'Não';
  const incisos = (row._reasons || []).join(', ').toUpperCase();
  return `Sim — ${incisos}`;
}

function _pdf_art8Label(row) {
  if (row._excluido_art1) return 'Não aplicável — órgão excluído pelo Art. 1º';
  const m = {
    'dispensado':         'Sim — Dispensado (analista confirmou evento anterior a 10/03/2025)',
    'excecao-aditivo':    'Não — Exceção ao Art. 8º (aditivo contratual)',
    'vigente':            'Não — Decreto em vigência (data igual/posterior a 10/03/2025)',
    'pendente-validacao': 'Pendente — Aguarda confirmação manual do analista',
    'sem-data':           'Indeterminado — Informação sobre data não disponível',
    'nao-aplicavel':      'Não aplicável — Processo não enquadrado no Art. 2º',
  };
  return m[row._art8] || '—';
}

const _PDF_AVAL_OBRIG_CATEGORIAS = {
  licitacao_andamento:    'Licitação em andamento',
  adjudicado_fornecedor:  'Fornecedor já escolhido',
  contrato_firmado:       'Contrato assinado, sem execução',
  contrato_execucao:      'Contrato em execução',
};

function _pdf_avalObrigLabel(row) {
  const d = row._avaliacao_obrig_dados;
  if (!d) return null;
  const contrato = d.contrato_assinado || row._contrato_assinado;
  const valorNum = Number(d.valor_adjudicado);
  return {
    categoria:    _PDF_AVAL_OBRIG_CATEGORIAS[d.categoria] || d.categoria || '—',
    adjudicacao:  d.valor_adjudicacao === 'sim'
      ? (valorNum > 0 ? _pdf_fmtBRL(valorNum) : 'Sim, valor não informado')
      : (d.valor_adjudicacao === 'nao' ? 'Não há' : '—'),
    interrompido: d.contrato_interrompido === 'sim' ? 'Sim' : (d.contrato_interrompido === 'nao' ? 'Não' : '—'),
    motivo:       d.motivo_interrupcao || '',
    contrato:     contrato === 'sim' ? 'Sim' : (contrato === 'nao' ? 'Não' : '—'),
  };
}

function _pdf_esc(str) {
  if (!str && str !== 0) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUILDER DE HTML
   ═══════════════════════════════════════════════════════════════════════════ */

function _buildPdfHtml(data, dataHoje) {

  /* ── linha label/valor ── */
  function row(label, value) {
    return `
      <tr>
        <td class="lv-label">${_pdf_esc(label)}</td>
        <td class="lv-value">${_pdf_esc(value)}</td>
      </tr>`;
  }

  /* ── título de seção dentro de tabela (sem ícone) ── */
  function secTitle(text) {
    return `<tr class="sec-title-row">
      <td colspan="2" class="sec-title">${_pdf_esc(text)}</td>
    </tr>`;
  }

  /* ── fichas de processos ── */
  let fichas = '';
  data.forEach((r, idx) => {
    const valorEfetivo = r._valor_manual > 0 ? r._valor_manual : (r.valor_estimado || 0);
    const ao = _pdf_avalObrigLabel(r);
    const interrompido = ao && ao.interrompido === 'Sim';

    fichas += `
    <div class="process-card">

      <div class="process-header">
        <span class="proc-index">${idx + 1}</span>
        <div class="proc-id">
          <span class="proc-nup">${_pdf_esc(r.processo || r.numero_ano_edital || 'Processo sem número')}</span>
          <span class="proc-org">${_pdf_esc(r.nome_Uasg || 'Órgão não informado')}</span>
        </div>
      </div>

      <table class="lv-table">

        ${secTitle('1. Qual é o processo')}
        ${row('Número do processo', r.processo || '—')}
        ${row('Órgão', r.nome_Uasg || '—')}
        ${row('Código UASG', r.codigoUasg || '—')}
        ${row('Edital', r.numero_ano_edital || '—')}
        ${row('Publicação do edital', _pdf_fmtDate(r.dt_public_edital))}
        ${r.dt_sessao ? row('Data da sessão', _pdf_fmtDate(r.dt_sessao)) : ''}
        ${row('Modalidade', r.modalidade || '—')}
        ${row('Tipo de contratação', r.tipo_objeto || '—')}
        ${r.criterio ? row('Critério', r.criterio) : ''}

        ${secTitle('2. O que se contrata')}
        ${row('Objeto', r.objeto || '—')}
        ${row('Natureza da despesa', r.nat_despesa || '—')}
        ${r.fonte_recursos ? row('Fonte de recursos', r.fonte_recursos) : ''}
        ${r.observacoes ? row('Observações da planilha', r.observacoes) : ''}
        ${r._observacao_manual ? row('Observação do analista', r._observacao_manual) : ''}

        ${secTitle('3. Valores')}
        ${row('Valor estimado',
              r._isSigiloso && !r._valor_manual ? 'Sigiloso / não informado' : _pdf_fmtBRL(r.valor_estimado))}
        ${r._valor_manual > 0 ? row('Valor informado pelo analista', _pdf_fmtBRL(r._valor_manual)) : ''}
        ${row('Valor usado na análise',
              r._isSigiloso && !r._valor_manual ? 'Sigiloso / não informado' : _pdf_fmtBRL(valorEfetivo))}
        ${ao && !interrompido ? row('Valor adjudicado', ao.adjudicacao) : ''}

        ${secTitle('4. Em que ponto está')}
        ${row('Contrato interrompido?', ao ? ao.interrompido : '—')}
        ${interrompido && ao.motivo ? row('Motivo da interrupção', ao.motivo) : ''}
        ${!interrompido ? row('Etapa', ao ? ao.categoria : '—') : ''}
        ${!interrompido ? row('Contrato assinado?', ao ? ao.contrato : (r._contrato_assinado === 'sim' ? 'Sim' : (r._contrato_assinado === 'nao' ? 'Não' : 'Não informado'))) : ''}

        ${secTitle('5. Por que entra neste relatório')}
        ${r._motivoArt2 ? row('Motivo', r._motivoArt2) : ''}
        ${r._motivoArt1 && !r._motivoArt2 ? row('Motivo', r._motivoArt1) : ''}
        ${row('Art. 1º — âmbito', _pdf_art1Label(r))}
        ${row('Art. 2º — obrigatoriedade', _pdf_art2Label(r))}
        ${row('Art. 8º — dispensa por data anterior', _pdf_art8Label(r))}
        ${r._motivoArt8 ? row('Motivo do Art. 8º', r._motivoArt8) : ''}
        ${r._campoFaltante && r._campoFaltante.length > 0
            ? row('Campos pendentes', r._campoFaltante.join(', '))
            : ''}

      </table>
    </div>`;
  });

  const linhasResumo = data.map((r, idx) => {
    const ao = _pdf_avalObrigLabel(r);
    const interrompido = ao && ao.interrompido === 'Sim';
    const etapa = interrompido ? 'Contrato interrompido' : (ao ? ao.categoria : '—');
    const valor = (r._isSigiloso && !(r._valor_manual > 0))
      ? 'Sigiloso'
      : _pdf_fmtBRL(r._valor_manual > 0 ? r._valor_manual : (r.valor_estimado || 0));
    const contrato = interrompido ? '—' : (ao ? ao.contrato : (
      r._contrato_assinado === 'sim' ? 'Sim' : (r._contrato_assinado === 'nao' ? 'Não' : '—')
    ));
    return `
      <tr>
        <td class="sum-n">${idx + 1}</td>
        <td>${_pdf_esc(r.processo || '—')}</td>
        <td>${_pdf_esc(r.nome_Uasg || '—')}</td>
        <td>${_pdf_esc(etapa)}</td>
        <td>${_pdf_esc(valor)}</td>
        <td>${_pdf_esc(contrato)}</td>
      </tr>`;
  }).join('');

  /* ── DOCUMENTO COMPLETO ── */
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório — Avaliação de Integridade Obrigatória — ${dataHoje}</title>
  <style>
    /* ══ Reset ══════════════════════════════════════════════════════════════ */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: 'Segoe UI', Calibri, Arial, sans-serif;
      font-size: 10pt;
      color: #1e293b;
      background: #fff;
      line-height: 1.55;
    }

    /* ══ CAPA ════════════════════════════════════════════════════════════════ */
    .cover-page {
      width: 100%;
      height: 100vh;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      margin: 0;
      padding: 0;
      background: #ffffff;
      display: flex;
      flex-direction: column;
    }
    .cover-band {
      height: 18px;
      background: #0a6b63;
      flex-shrink: 0;
    }
    .cover-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 56px 72px 40px;
    }
    .cover-org {
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0a6b63;
      margin-bottom: 6px;
    }
    .cover-org-name {
      font-size: 13pt;
      color: #1f2937;
      margin-bottom: 40px;
    }
    .cover-title {
      font-size: 28pt;
      font-weight: 700;
      color: #111827;
      line-height: 1.2;
      max-width: 14em;
      margin-bottom: 18px;
    }
    .cover-rule {
      width: 64px;
      height: 4px;
      background: #0a6b63;
      margin-bottom: 22px;
    }
    .cover-subtitle {
      font-size: 12pt;
      color: #374151;
      line-height: 1.5;
    }
    .cover-meta {
      margin-top: 36px;
      font-size: 11pt;
      color: #111827;
    }
    .cover-decree {
      margin-top: 4px;
      font-size: 10pt;
      color: #374151;
    }
    .cover-footer-bar {
      background: #0a6b63;
      color: #ffffff;
      font-size: 9pt;
      text-align: left;
      padding: 14px 72px;
    }

    /* ══ Wrapper de página de conteúdo ══════════════════════════════════════ */
    .page-wrap {
      max-width: 860px;
      margin: 0 auto;
      padding: 32px 40px 48px;
    }

    /* ══ Cabeçalho interno (após capa) ══════════════════════════════════════ */
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      margin-bottom: 32px;
      border-bottom: 3px solid #0f9387;
    }
    .ph-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ph-brand-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .ph-brand-title {
      font-size: 11pt;
      font-weight: 700;
      color: #0f9387;
      line-height: 1.2;
    }
    .ph-brand-sub {
      font-size: 7.5pt;
      color: #64748b;
    }
    .ph-meta {
      text-align: right;
      font-size: 8pt;
      color: #64748b;
      line-height: 1.6;
    }

    /* ══ Seção título ════════════════════════════════════════════════════════ */
    .section-heading {
      font-size: 12pt;
      font-weight: 800;
      color: #0f9387;
      margin-bottom: 6px;
      padding-bottom: 8px;
      border-bottom: 2px solid #8cc6b3;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-intro {
      font-size: 8.5pt;
      color: #64748b;
      margin-bottom: 20px;
      line-height: 1.6;
    }

    /* ══ Ficha de processo ═══════════════════════════════════════════════════ */
    .process-card {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      margin-bottom: 20px;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Cabeçalho da ficha */
    .process-header {
      background: #0a6b63;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .proc-index {
      width: 28px; height: 28px;
      background: #ffffff;
      border: 1px solid #ffffff;
      border-radius: 4px;
      font-size: 10pt;
      font-weight: 800;
      color: #0a6b63;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .proc-id {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .proc-nup {
      font-size: 11pt;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
    }
    .proc-org {
      font-size: 8.5pt;
      color: #ffffff;
      line-height: 1.3;
    }

    /* ══ Tabela label/valor ══════════════════════════════════════════════════ */
    .lv-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    .lv-table td {
      padding: 6px 14px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
      line-height: 1.45;
    }
    .lv-label {
      width: 34%;
      background: #f3f4f6;
      color: #111827;
      font-weight: 700;
      border-right: 1px solid #e5e7eb;
    }
    .lv-value {
      color: #1e293b;
      word-break: break-word;
    }

    /* Títulos de seção dentro da tabela (outline SVG) */
    .sec-title-row td { border-bottom: none !important; }
    .sec-title {
      background: #e7f3f1 !important;
      color: #0a6b63;
      font-weight: 700;
      font-size: 8.5pt;
      padding: 8px 14px !important;
      border-top: 1px solid #0a6b63;
    }

    .sumario {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 28px;
      font-size: 8pt;
    }
    .sumario th {
      background: #0a6b63;
      color: #ffffff;
      text-align: left;
      font-weight: 700;
      padding: 8px 8px;
    }
    .sumario td {
      padding: 7px 8px;
      border-bottom: 1px solid #d1d5db;
      vertical-align: top;
      color: #111827;
    }
    .sumario tbody tr:nth-child(even) td { background: #f3f4f6; }
    .sumario .sum-n { width: 28px; font-weight: 700; color: #0a6b63; }
    /* ══ Rodapé de página ═══════════════════════════════════════════════════ */
    .page-footer {
      margin-top: 40px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94a3b8;
    }

    /* ══ Print ══════════════════════════════════════════════════════════════ */
    @media print {
      @page {
        size: A4;
        margin: 18mm 20mm 22mm 20mm;
      }
      @page :first {
        margin: 0;
      }
      body { font-size: 9pt; }
      .cover-page { height: 100vh; margin: 0; padding: 0; break-after: page; }
      .page-wrap { padding: 0; max-width: 100%; }
      .process-card { page-break-inside: avoid; break-inside: avoid; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>

<!-- ══════════════════════════════════════════════════════════════════════════
     CAPA DO RELATÓRIO
     ══════════════════════════════════════════════════════════════════════════ -->
<div class="cover-page">
  <div class="cover-band"></div>
  <div class="cover-content">
    <p class="cover-org">CGE/RN</p>
    <p class="cover-org-name">Controladoria-Geral do Estado</p>
    <h1 class="cover-title">Relatório de Avaliação de Integridade</h1>
    <div class="cover-rule"></div>
    <p class="cover-subtitle">Processos com Avaliação de Integridade Obrigatória</p>
    <p class="cover-subtitle">Art. 2º da IN-SEI N° 21/2024</p>
    <p class="cover-meta">Gerado em ${dataHoje}</p>
    <p class="cover-decree">Decreto N° 34.196/2024</p>
    <p class="cover-decree">IN-SEI N° 21/2024</p>
  </div>
  <div class="cover-footer-bar">Filtro de Conformidade — Ferramenta de Avaliação de Integridade</div>
</div>
<!-- /CAPA -->

<!-- ══════════════════════════════════════════════════════════════════════════
     CONTEÚDO DO RELATÓRIO
     ══════════════════════════════════════════════════════════════════════════ -->
<div class="page-wrap">

  <!-- Cabeçalho interno -->
  <div class="page-header">
    <div class="ph-brand">
      <div class="ph-brand-text">
        <span class="ph-brand-title">Filtro de Conformidade</span>
        <span class="ph-brand-sub">Avaliação de Integridade — CGE/RN</span>
      </div>
    </div>
    <div class="ph-meta">
      Gerado em: <strong>${dataHoje}</strong><br>
      Decreto N° 34.196/2024 &nbsp;|&nbsp; IN-SEI N° 21/2024
    </div>
  </div>

  <h2 class="section-heading">Resumo</h2>
  <p class="section-intro">${data.length} processos. A ordem desta lista é a mesma das fichas.</p>
  <table class="sumario">
    <thead>
      <tr>
        <th>Nº</th>
        <th>Processo</th>
        <th>Órgão</th>
        <th>Etapa</th>
        <th>Valor estimado</th>
        <th>Assinado</th>
      </tr>
    </thead>
    <tbody>
      ${linhasResumo}
    </tbody>
  </table>

  <h2 class="section-heading">Fichas</h2>
  <p class="section-intro">Em cada ficha: o processo, o objeto, os valores, a situação e o motivo do enquadramento.</p>

  <!-- Fichas individuais -->
  ${fichas}

  <!-- Rodapé -->
  <div class="page-footer">
    <span>Filtro de Conformidade — Avaliação de Integridade | CGE/RN</span>
    <span>Gerado em ${dataHoje} &nbsp;|&nbsp; IN-SEI N° 21/2024 · Decreto N° 34.196/2024</span>
  </div>

</div><!-- /page-wrap -->
</body>
</html>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FUNÇÃO PÚBLICA — exportPDF()
   Chamada por window.App.exportPDF() via onclick no HTML.
   ═══════════════════════════════════════════════════════════════════════════ */

function exportPDF() {
  try {
    if (!State || !State.allData || State.allData.length === 0) {
      showToast('Nenhuma planilha carregada. Importe os dados primeiro.', 'error', 4000);
      return;
    }

    /* Filtra processos relevantes para o relatório:
       - avaliacao-obrigatoria: APENAS avaliação obrigatória
       Se o painel tiver um filtro ativo, respeita o filtro */
    const sourceData = (State.filteredData && State.filteredData.length > 0 && State.activeFilter)
      ? State.filteredData
      : State.allData;
    const data = sourceData.filter(r =>
      r._statusFinal === 'avaliacao-obrigatoria'
    );

    if (data.length === 0) {
      showToast('Nenhum processo com Avaliação Obrigatória encontrado.', 'info', 5000);
      return;
    }

    showLoading('Gerando relatório PDF…');

    /* Data de hoje */
    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    const html = _buildPdfHtml(data, dataHoje);

    const win = window.open('', '_blank');
    if (!win) {
      hideLoading();
      showToast('Pop-up bloqueado. Permita pop-ups para este site e tente novamente.', 'error', 6000);
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    win.onload = function () {
      hideLoading();
      setTimeout(function () {
        win.focus();
        win.print();
      }, 500);
    };

    /* Fallback caso onload não dispare */
    setTimeout(function () { hideLoading(); }, 4000);

    showToast(
      `Relatório pronto! ${data.length} processo(s) de Avaliação Obrigatória. Salve como PDF na janela de impressão.`,
      'success',
      7000
    );

  } catch (err) {
    hideLoading();
    console.error('[exportPDF]', err);
    showToast('Erro ao gerar PDF: ' + err.message, 'error', 6000);
  }
}
