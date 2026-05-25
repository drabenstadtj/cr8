FROM node:22-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js; node src/index.js"]
