FROM node:20.19.6-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build



FROM node:20.19.6-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY staff.cfg .
COPY --from=builder /app/dist ./dist
CMD ["sh", "-c", "node dist/deploy.js && exec node dist/index.js"]
