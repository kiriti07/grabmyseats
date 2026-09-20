FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared ./shared
COPY backend ./backend
RUN npm install
RUN npm run build --workspace=backend

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend ./backend
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
