FROM node:20-alpine
WORKDIR /app

# Cache dependency layer — only re-runs when package files change
COPY package.json package-lock.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY apps/liff/package*.json ./apps/liff/

RUN npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set fetch-timeout 300000 && \
    npm ci

# Copy source after deps are cached
COPY . .

WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

EXPOSE 8085
CMD ["node", "dist/src/main"]
