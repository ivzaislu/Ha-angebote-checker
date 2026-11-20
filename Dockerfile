FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY webapp/package*.json ./
RUN npm install --no-save --package-lock=false
COPY webapp/ ./
ENV NITRO_PRESET=node-server
RUN npm run typecheck && npx vite build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/scripts/migration-plan.mjs ./scripts/migration-plan.mjs
# Operator commands for collection/export, using the same code as the web app.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/archive-marktguru.ts /app/scripts/register-alias.mjs /app/scripts/alias-loader.mjs ./scripts/
COPY --from=build /app/src/lib/offer-archive.ts /app/src/lib/product-knowledge.ts /app/src/lib/product-variants.ts /app/src/lib/unit-price.ts /app/src/lib/exact.ts /app/src/lib/corpus.server.ts ./src/lib/
COPY --from=build /app/scripts/product-model.ts ./scripts/product-model.ts
COPY --from=build /app/scripts/product-training-worker.ts ./scripts/product-training-worker.ts
COPY --from=build /app/src/lib/product-training-jobs.ts ./src/lib/product-training-jobs.ts
COPY --from=build /app/src/lib/product-category.ts ./src/lib/product-category.ts
COPY --from=build /app/src/lib/product-net.ts /app/src/lib/product-policy.ts /app/src/lib/product-metrics.ts /app/src/lib/product-evaluation.ts /app/src/lib/product-data.ts /app/src/lib/product-training.ts /app/src/lib/product-review.ts /app/src/lib/product-model-store.ts /app/src/lib/product-curriculum.json /app/src/lib/product-benchmark.json /app/src/lib/product-seed.json ./src/lib/
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
