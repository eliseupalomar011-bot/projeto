FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY backend/package.json backend/package.json
COPY client/package.json client/package.json
RUN npm install --workspace backend --omit=dev

COPY backend backend
COPY admin admin

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
