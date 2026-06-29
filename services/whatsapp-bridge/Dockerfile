FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache git python3 make g++
COPY services/whatsapp-bridge/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/whatsapp-bridge/src ./src
EXPOSE 8500
VOLUME ["/app/auth_state"]
CMD ["node", "src/index.js"]
