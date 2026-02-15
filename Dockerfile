FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules (better-sqlite3) and docker-cli
RUN apk add --no-cache python3 make g++ docker-cli

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --production

ENV DOCKER_API_VERSION=1.43

EXPOSE 3002

CMD ["npm", "run", "start"]
