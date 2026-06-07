FROM node:20-alpine
WORKDIR /app
# Copy entire monorepo so npm workspaces and shared packages are available
COPY . .
RUN npm install
WORKDIR /app/apps/frontend
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
