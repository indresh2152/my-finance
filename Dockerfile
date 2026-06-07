# Stage 1: deps
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/api/package*.json apps/api/
RUN npm ci

# Stage 2: builder
FROM deps AS builder
COPY . .
RUN npm run build -w apps/web
RUN npm run build -w apps/api

# Copy Vite build into Express public dir
RUN cp -r apps/web/dist apps/api/public

# Stage 3: runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/public ./public
COPY --from=builder /app/apps/api/src/locales ./src/locales

COPY apps/api/package*.json ./
RUN npm ci --omit=dev

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 4000
CMD ["node", "dist/server.js"]
