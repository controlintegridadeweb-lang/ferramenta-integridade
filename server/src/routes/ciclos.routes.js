'use strict';

const { Router } = require('express');
const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const { exigirAuth } = require('../middlewares/auth');
const service = require('../services/ciclos.service');

const router = Router();

// O HTML do relatório pode passar de 1MB; este router aceita corpos maiores.
const jsonGrande = express.json({ limit: '25mb' });

/* ── Dashboard: contagens + último relatório ─────────────────────────────── */
router.get('/dashboard', asyncHandler(async (_req, res) => {
  res.json(await service.dashboard());
}));

/* ── Fila do ciclo atual (não-finalizados) ───────────────────────────────── */
router.get('/fila', asyncHandler(async (_req, res) => {
  res.json(await service.fila());
}));

/* ── Status por uid (front cruza com a planilha) ─────────────────────────── */
router.get('/status', asyncHandler(async (_req, res) => {
  res.json(await service.statusPorUid());
}));

/* ── Sincronizar obrigatórios (só insere novos) ──────────────────────────── */
router.post('/sincronizar', exigirAuth, asyncHandler(async (req, res) => {
  const registros = (req.body && req.body.registros) || [];
  res.json(await service.sincronizar(registros));
}));

/* ── Transição de status de uma análise ──────────────────────────────────── */
router.post('/analises/:uid/transicao', exigirAuth, asyncHandler(async (req, res) => {
  const novo = req.body && req.body.status;
  const r = await service.transicionar({ uid: req.params.uid, novo, analista: req.ator });
  res.json({ ok: true, uid: r.uid, status: r.status });
}));

/* ── Gerar relatório (encerra ciclo) — recebe o HTML p/ renderizar o PDF ──── */
router.post('/relatorios', exigirAuth, jsonGrande, asyncHandler(async (req, res) => {
  const { uids, html } = req.body || {};
  const rel = await service.gerarRelatorio({
    uids, geradoPor: req.ator, html,
  });
  res.json({ ok: true, relatorio: rel });
}));

/* ── Regerar o PDF de um relatório existente (sem reabrir o ciclo) ────────── */
router.post('/relatorios/:id/pdf', exigirAuth, jsonGrande, asyncHandler(async (req, res) => {
  const { html } = req.body || {};
  const rel = await service.regerarPdf({ id: req.params.id, html });
  res.json({ ok: true, relatorio: rel });
}));

/* ── Histórico: lista de relatórios ──────────────────────────────────────── */
router.get('/relatorios', asyncHandler(async (_req, res) => {
  res.json(await service.listarRelatorios());
}));

/* ── Histórico: um relatório com seus registros ──────────────────────────── */
router.get('/relatorios/:id', asyncHandler(async (req, res) => {
  res.json(await service.obterRelatorio(req.params.id));
}));

module.exports = router;
