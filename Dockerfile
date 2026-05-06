FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY designer-ui/package.json designer-ui/package-lock.json ./designer-ui/
COPY extensions/tshirt-designer/package.json ./extensions/tshirt-designer/

RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["npm", "run", "start"]
