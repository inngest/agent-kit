FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npx tsc

EXPOSE 3000

# Run node directly: with `npm run start`, npm and its shell sit between
# Docker and node and don't forward SIGTERM, so `docker stop` would bypass
# the session-teardown signal handlers in index.ts.
CMD ["node", "dist/index.js"]
