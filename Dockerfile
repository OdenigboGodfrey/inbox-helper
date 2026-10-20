FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
# Compiled NestJS application
COPY --from=build /app/dist ./dist
# Static frontend served by NestJS
COPY ./public ./public
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]