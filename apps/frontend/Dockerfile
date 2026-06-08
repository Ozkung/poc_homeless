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

WORKDIR /app/apps/frontend
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
