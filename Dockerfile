# Debian slim, não Alpine: o `better-sqlite3` tem prebuilds para linux-arm64
# com glibc. Em Alpine (musl) teria de compilar do código, o que obrigava a
# meter python3/make/g++ na imagem e a esperar minutos no Pi.
ARG NODE=node:24-bookworm-slim

# --- painel do cuidador -------------------------------------------------------
# Em dev usa-se o alvo `dashboard-deps` (vite dev server, código do bind mount);
# em produção o `dashboard`, cujo build sai para ../server/public, ou seja
# /app/server/public — ver vite.config.ts.
FROM ${NODE} AS dashboard-deps
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci

FROM dashboard-deps AS dashboard
COPY dashboard/ ./
RUN npm run build

# --- servidor: compilar TypeScript -------------------------------------------
FROM ${NODE} AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# --- desenvolvimento: tsx watch, código vem do bind mount --------------------
# `dev:poll` e não `dev`: o tsx watch usa fs.watch, e os eventos de inotify não
# atravessam a partilha do Docker Desktop entre Windows e o container — o
# ficheiro chega actualizado, mas nada avisa o watcher. O nodemon em
# --legacy-watch faz polling, que funciona sobre qualquer mount.
FROM ${NODE} AS dev
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
CMD ["npm", "run", "dev:poll"]

# --- produção: o que corre no Raspberry Pi ----------------------------------
FROM ${NODE} AS prod
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
COPY --from=dashboard    /app/server/public ./public
EXPOSE 3000
CMD ["node", "dist/index.js"]
