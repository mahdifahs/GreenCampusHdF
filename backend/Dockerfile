# Image de production de l'API (multi-stage, Node 22 Alpine).
# Image de base épinglée par empreinte (Node 22.23.5, Alpine 3.24.4 au 12/11/2026) : un tag peut être
# republié avec un autre contenu, pas une empreinte (OWASP A03/A08). Dependabot (écosystème docker)
# propose chaque semaine la nouvelle empreinte de node:22-alpine, avec les correctifs de sécurité.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.seed.json ./
COPY src ./src
COPY admin ./admin
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/admin ./admin
COPY package.json ./
USER node
EXPOSE 4000
# Applique les migrations, puis le seed (idempotent : filières et défis mis à jour, valeurs des
# vêtements remplies seulement si vides, premier super-admin créé seulement si aucun compte
# n'existe), puis démarre l'API. Relancer le conteneur ne modifie donc pas les données saisies.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed/seed.js && node dist/server.js"]
