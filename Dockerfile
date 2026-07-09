FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY lib ./lib
COPY config.json ./
COPY sound ./sound
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]
