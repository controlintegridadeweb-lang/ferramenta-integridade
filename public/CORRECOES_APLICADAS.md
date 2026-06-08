# Correções de Lógica — Ferramenta de Integridade (Decreto 34.196/2024)

Todas as correções foram validadas contra o **código real de produção** (não stubs),
via as suítes em `Testes/` (59 asserts, todos verdes).

## P1 — Alta prioridade (mudam comportamento)

### 1. Testes passam a exercitar o código real
- **Antes:** `test_logica.js` reimplementava as regras num *stub* paralelo, já
  divergente do `classifier.js` real. Os testes "passavam" validando código que
  não roda em produção.
- **Correção:** novo `Testes/_load_real_modules.js` avalia os módulos IIFE reais
  (`classifier.js`, `normalizer.js`) sem alterá-los. `test_logica.js` e
  `test_cenarios_5.js` agora rodam o pipeline real `normalizeAll → classifyAll`.

### 2. Matching de keywords sobre o campo ORIGINAL (pré-normalização)
- **Antes:** o `Normalizer` reescrevia `tipo_objeto`/`modalidade`/`criterio` para
  exibição ANTES da classificação, podendo apagar o termo-gatilho (ex.:
  "insumo farmaceutico" → "Medicamentos", perdendo a keyword de §1º).
- **Correção:** `textOf()` no `classifier.js` lê o valor original
  (`_tipo_objeto_original` etc.) preservado pelo Normalizer. A exibição continua
  normalizada; a classificação usa o texto bruto.

## P2 — Média prioridade (lógica/orientação)

### 3. Aditivo com valor sigiloso
- **Antes:** aditivo sem valor caía em `verificacao-humana` pela via genérica de
  sigiloso, sem a orientação específica de informar o valor TOTAL acumulado
  (Art. 2º, §3º).
- **Correção:** nova flag `_aditivoSigiloso`; mensagem específica em
  `_campoFaltante` e em `_motivoAditivoValorBaixo` (ambos exibidos na UI e no PDF).

### 4. Trava de sanidade no Art. 8º (conflito de data)
- **Antes:** dispensa confirmada pelo analista era aceita sem checar se a data
  conhecida do processo a contradizia.
- **Correção:** `detectArt8Conflito()` sinaliza `_art8Conflito` quando a única data
  conhecida é >= 10/03/2025 mas o analista afirmou evento anterior. NÃO sobrescreve
  a decisão humana — apenas alerta (exibido no bloco Art. 8º da UI).

## P3 — Robustez e cobertura

### 5. Parsing defensivo de valor
- Helper `_toNumber()` no classifier: número passa direto; string BR/US é parseada
  pela regra do último separador. Evita `parseFloat("40.000.000,00") === 40`.

### 6. Eliminação de lógica duplicada (fonte única de verdade)
- **Antes:** `handlers.js::_reclassifyRow` reimplementava todo o ciclo
  Art.1→2→8→status — já defasado das correções acima. Era a raiz da divergência
  do item 1.
- **Correção:** corpo do ciclo extraído para `Classifier.classifyRowFull(row)`,
  usado tanto por `classifyAll` (carga) quanto por `_reclassifyRow` (input manual).
  Verificado idempotente e consistente entre os dois caminhos.

### 7. Novos testes (test_logica.js, blocos 7–10)
- Zona cinzenta de obras R$25M–R$35M (comportamento intencional protegido).
- Matching sobre campo original.
- Aditivo sigiloso.
- Conflito de data no Art. 8º.
