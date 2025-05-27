# ---- Build Stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Optional: needed for native modules
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ---- Runtime Stage ----
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules

# 🧹 Prune devDependencies safely
RUN npm prune --omit=dev --ignore-scripts

# Optional port
# EXPOSE 3000

CMD ["node", "dist/index.js"]
