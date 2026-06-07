FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
WORKDIR /app/apps/frontend
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
