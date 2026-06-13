FROM node:20-bullseye
WORKDIR /usr/src/app

# Copy package manifests
COPY package*.json ./

# Install deps (including dev for ts-node)
RUN npm ci --only=production || true
RUN npm install --no-audit --no-fund

# Copy source
COPY . .

ENV NODE_ENV=production

EXPOSE 5000

CMD ["npm", "run", "start"]
