FROM node:20-alpine
WORKDIR /app
# Copy entire monorepo so npm workspaces and shared packages are available
COPY . .
RUN npm install
WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/main"]
