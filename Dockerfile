FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY webapp/package*.json ./
RUN npm install --no-save --package-lock=false
COPY webapp/ ./
RUN npm run typecheck && npx vite build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/scripts/migration-plan.mjs ./scripts/migration-plan.mjs
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
