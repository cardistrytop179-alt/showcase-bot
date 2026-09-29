FROM node:18-alpine

WORKDIR /app

# Копируем package.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем Prisma schema
COPY prisma ./prisma/

# Генерируем Prisma клиент
RUN npx prisma generate

# Копируем исходный код
COPY src ./src/

# Выполняем миграции и запускаем бота
CMD npx prisma migrate deploy && node src/index.js
