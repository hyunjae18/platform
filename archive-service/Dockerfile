FROM node:20-alpine

WORKDIR /app

RUN wget -q https://dl.min.io/client/mc/release/linux-amd64/mc \
    && chmod +x mc \
    && mv mc /usr/local/bin/mc

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3007

CMD ["node", "dist/main"]
