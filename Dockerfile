FROM node:22-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-server build

EXPOSE 3000
CMD ["node", "--enable-source-maps", "/app/artifacts/api-server/dist/index.mjs"]
