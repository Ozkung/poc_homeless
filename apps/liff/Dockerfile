FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY apps/liff/package*.json ./apps/liff/
COPY packages/ ./packages/

RUN npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set fetch-timeout 300000 && \
    npm ci

COPY apps/liff/ ./apps/liff/

ARG VITE_API_URL
ARG VITE_LIFF_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIFF_ID=$VITE_LIFF_ID

WORKDIR /app/apps/liff
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/apps/liff/dist /usr/share/nginx/html/liff
COPY apps/liff/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
