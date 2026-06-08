# ════════════════════════════════════════════════════════════════════════════
# Imagem de produção — Ferramenta de Avaliação de Integridade
# Node + Chromium do sistema (para o Puppeteer gerar os PDFs com segurança).
# Compatível com Render e Railway (deploy via Docker).
# ════════════════════════════════════════════════════════════════════════════
FROM node:20-slim

# Chromium e bibliotecas necessárias para o Puppeteer rodar em headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Não baixar o Chromium do pacote puppeteer: usamos o do sistema (acima).
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Instala as dependências do servidor primeiro (melhor cache de build).
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copia o código do servidor e o front-end estático.
COPY server ./server
COPY public ./public

WORKDIR /app/server

# A hospedagem injeta a variável PORT; o app lê process.env.PORT.
EXPOSE 3000

CMD ["node", "server.js"]
