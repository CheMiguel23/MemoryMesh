FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist

# Keep your graph outside the container, e.g.:
#   docker run -i -v memorymesh-data:/data memorymesh
ENV MEMORYMESH_MEMORY_FILE=/data/memory.json
VOLUME /data

CMD ["node", "dist/index.js"]
