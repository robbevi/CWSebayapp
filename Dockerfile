FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start"]
