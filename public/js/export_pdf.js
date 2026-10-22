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

function _pdf_contratoAssinado(row) {
  const v = row._contrato_assinado;
  if (v === 'sim') return 'Sim — Contrato já assinado';
  if (v === 'nao') return 'Não — Contrato ainda não assinado';
  return 'Não informado';
}

const _PDF_AVAL_OBRIG_CATEGORIAS = {
  licitacao_andamento:    'Licitação em andamento',
  adjudicado_fornecedor:  'Processo adjudicado com seleção de fornecedor',
  contrato_firmado:       'Contrato firmado (com assinatura)',
  contrato_execucao:      'Contrato em execução',
};

function _pdf_avalObrigLabel(row) {
  const d = row._avaliacao_obrig_dados;
  if (!d) return null;
  return {
    categoria:    _PDF_AVAL_OBRIG_CATEGORIAS[d.categoria] || d.categoria || '—',
    adjudicacao:  d.valor_adjudicacao === 'sim'
      ? (Number(d.valor_adjudicado) > 0
          ? 'Sim — R$ ' + Number(d.valor_adjudicado).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : 'Sim')
      : (d.valor_adjudicacao === 'nao' ? 'Não' : '—'),
    interrompido: d.contrato_interrompido === 'sim' ? 'Sim' : (d.contrato_interrompido === 'nao' ? 'Não' : '—'),
    motivo:       d.motivo_interrupcao || '',
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
  function row(label, value, highlight) {
    const bgMap = { danger: '#fff0f0', success: '#f0fdf4', warning: '#fffbeb' };
    const bdMap = { danger: '#fca5a5', success: '#86efac', warning: '#fde68a' };
    const bg = highlight ? (bgMap[highlight] || '#ffffff') : '#ffffff';
    const bd = highlight ? `border-left: 3px solid ${bdMap[highlight] || '#e2e8f0'}` : '';
    return `
      <tr>
        <td class="lv-label">${_pdf_esc(label)}</td>
        <td class="lv-value" style="background:${bg};${bd}">${_pdf_esc(value)}</td>
      </tr>`;
  }

  /* ── título de seção dentro de tabela (sem ícone) ── */
  function secTitle(text) {
    return `<tr class="sec-title-row">
      <td colspan="2" class="sec-title">${_pdf_esc(text)}</td>
    </tr>`;
  }

  /* ── fichas de processos ── */
  // ── Mapa de status para label legível ────────────────────────────────────
  const STATUS_PDF_LABEL = {
    'avaliacao-obrigatoria': 'AVALIAÇÃO OBRIGATÓRIA',
    'verificacao-humana':    'VERIFICAÇÃO PENDENTE',
    'dispensada':            'DISPENSADA (Art. 8º)',
    'nao-enquadrado':        'NÃO ENQUADRADO',
    'nao-enquadrado-art1':   'EXCLUÍDO (Art. 1º)',
  };

  // ── Mapa de cor do badge por status ──────────────────────────────────────
  const STATUS_PDF_BADGE_BG = {
    'avaliacao-obrigatoria': '#ffffff',
    'verificacao-humana':    '#ffffff',
    'dispensada':            '#ffffff',
    'nao-enquadrado':        '#ffffff',
    'nao-enquadrado-art1':   '#ffffff',
  };
  const STATUS_PDF_BADGE_COLOR = {
    'avaliacao-obrigatoria': '#9f1239',
    'verificacao-humana':    '#9a3412',
    'dispensada':            '#065f46',
    'nao-enquadrado':        '#334155',
    'nao-enquadrado-art1':   '#1e3a8a',
  };

  let fichas = '';
  data.forEach((r, idx) => {
    const valorEfetivo = r._valor_manual > 0 ? r._valor_manual : (r.valor_estimado || 0);
    const statusLabel  = STATUS_PDF_LABEL[r._statusFinal] || (r._statusFinal || '').toUpperCase();
    const badgeBg      = STATUS_PDF_BADGE_BG[r._statusFinal] || '#ffffff';
    const badgeColor   = STATUS_PDF_BADGE_COLOR[r._statusFinal] || '#334155';

    fichas += `
    <div class="process-card">

      <!-- Cabeçalho da ficha -->
      <div class="process-header">
        <div class="proc-num-wrap">
          <span class="proc-index">${idx + 1}</span>
          <span class="proc-badge" style="background:${badgeBg};color:${badgeColor};border-color:${badgeBg}">${statusLabel}</span>
        </div>
        <span class="proc-edital">${_pdf_esc(r.numero_ano_edital || r.processo || 'Nº não informado')}</span>
      </div>

      <!-- Tabela de dados -->
      <table class="lv-table">

        ${secTitle('1. Identificação')}
        ${row('Número do Processo', r.processo || r.numero_ano_edital || '—')}
        ${row('Nº do Edital', r.numero_ano_edital || '—')}
        ${row('Órgão (UASG)', r.nome_Uasg || '—')}
        ${row('Código UASG', r.codigoUasg || '—')}
        ${row('Data Publicação Edital', _pdf_fmtDate(r.dt_public_edital))}
        ${r.dt_sessao ? row('Data da Sessão', _pdf_fmtDate(r.dt_sessao)) : ''}

        ${secTitle('2. Dados da Licitação')}
        ${row('Tipo de Contratação', r.tipo_objeto || '—')}
        ${row('Modalidade', r.modalidade || '—')}

        ${secTitle('3. Dados Financeiros')}
        ${row('Valor Estimado (planilha)',
              r._isSigiloso && !r._valor_manual ? 'Sigiloso / Não informado' : _pdf_fmtBRL(r.valor_estimado),
              r._isSigiloso && !r._valor_manual ? 'warning' : null)}
        ${r._valor_manual > 0 ? row('Valor Informado Manualmente', _pdf_fmtBRL(r._valor_manual), 'success') : ''}
        ${row('Valor Considerado na Análise',
              r._isSigiloso && !r._valor_manual ? 'Sigiloso / Não informado' : _pdf_fmtBRL(valorEfetivo))}

        ${secTitle('4. Objeto da Contratação')}
        ${row('Descrição do Objeto', r.objeto || '—')}
        ${r.nat_despesa ? row('Natureza de Despesa', r.nat_despesa) : ''}
        ${r.observacoes ? row('Observações (planilha)', r.observacoes) : ''}
        ${r._observacao_manual ? row('Observações do Analista', r._observacao_manual, 'success') : ''}

        ${secTitle('5. Análise Normativa — Decreto 34.196/2024')}
        ${row('Art. 1º — Âmbito de aplicação', _pdf_art1Label(r),
              r._excluido_art1 ? 'warning' : null)}
        ${r._motivoArt1 ? row('Motivo (Art. 1º)', r._motivoArt1) : ''}
        ${row('Art. 2º — Obrigatoriedade (Decreto 34.196/2024)?',
              _pdf_art2Label(r),
              r._requerAlice ? 'danger' : (r._isSigiloso ? 'warning' : null))}
        ${r._motivoArt2 ? row('Motivo (Art. 2º)', r._motivoArt2) : ''}
        ${row('Art. 8º — Dispensa por Anterioridade?',
              _pdf_art8Label(r),
              r._art8 === 'dispensado' ? 'success' :
              r._art8 === 'pendente-validacao' ? 'warning' : null)}
        ${r._motivoArt8 ? row('Motivo (Art. 8º)', r._motivoArt8) : ''}

        ${secTitle('6. Situação Contratual')}
        ${row('Status Final', statusLabel)}
        ${row('Contrato assinado?', _pdf_contratoAssinado(r))}
        ${r._campoFaltante && r._campoFaltante.length > 0
            ? row('Campos pendentes', r._campoFaltante.join(', '), 'warning')
            : ''}

        ${(() => {
          const ao = _pdf_avalObrigLabel(r);
          if (!ao) return '';
          return `
            ${secTitle('7. Detalhamento — Avaliação Obrigatória')}
            ${row('Categoria do processo', ao.categoria)}
            ${row('Existe valor de adjudicação?', ao.adjudicacao)}
            ${row('Contrato interrompido?', ao.interrompido,
                  ao.interrompido === 'Sim' ? 'warning' : null)}
            ${ao.interrompido === 'Sim' && ao.motivo
                ? row('Motivo da interrupção', ao.motivo, 'warning')
                : ''}
          `;
        })()}

      </table>
    </div>`;
  });

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
      background: #0f9387;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .proc-num-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
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
    .proc-badge {
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #9f1239;
      background: #ffffff;
      border: 1px solid #ffffff;
      border-radius: 4px;
      padding: 2px 8px;
    }
    .proc-edital {
      font-size: 9pt;
      color: #ffffff;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 320px;
    }

    /* ══ Tabela label/valor ══════════════════════════════════════════════════ */
    .lv-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    .lv-table td {
      padding: 5px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      line-height: 1.4;
    }
    .lv-label {
      width: 32%;
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      border-right: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    .lv-value {
      color: #1e293b;
      word-break: break-word;
    }

    /* Títulos de seção dentro da tabela (outline SVG) */
    .sec-title-row td { border-bottom: none !important; }
    .sec-title {
      background: #f1f5f9 !important;
      color: #334155;
      font-weight: 700;
      font-size: 8pt;
      padding: 6px 14px !important;
      border-top: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 7px;
      text-transform: uppercase;
      letter-spacing: .4px;
    }
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

  <!-- Sumário executivo -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;display:flex;gap:20px;flex-wrap:wrap;">
    <div style="font-size:8pt;color:#64748b;">
      <strong style="display:block;font-size:9pt;color:#0f9387;margin-bottom:4px;">Total de processos no relatório</strong>
      <span style="font-size:18pt;font-weight:900;color:#0f9387;">${data.length}</span>
    </div>
    <div style="font-size:8pt;color:#64748b;border-left:2px solid #e2e8f0;padding-left:20px;">
      <strong style="display:block;font-size:9pt;color:#dc2626;margin-bottom:4px;">Avaliação Obrigatória</strong>
      <span style="font-size:18pt;font-weight:900;color:#dc2626;">${data.filter(r => r._statusFinal === 'avaliacao-obrigatoria').length}</span>
    </div>
    <div style="font-size:8pt;color:#64748b;border-left:2px solid #e2e8f0;padding-left:20px;flex:1;min-width:160px;">
      <strong style="display:block;font-size:9pt;color:#334155;margin-bottom:4px;">Gerado em</strong>
      <span style="font-size:10pt;font-weight:700;color:#334155;">${dataHoje}</span>
    </div>
  </div>

  <!-- Título da seção de análise -->
  <h2 class="section-heading">
    Fichas individuais — Processos com Avaliação de Integridade Obrigatória
  </h2>

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
