FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY *.mjs ./
COPY public ./public
COPY browser-extension ./browser-extension
USER node
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
