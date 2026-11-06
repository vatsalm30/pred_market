FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .
COPY src/ src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 8080
# Cap the heap well under the 256MB machine so GC runs before the VM runs out of memory
CMD ["node", "--max-old-space-size=128", "--max-semi-space-size=4", "dist/index.js"]
