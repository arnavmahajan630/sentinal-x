# syntax=docker/dockerfile:1
# Sandbox: the seeded vulnerable MERN app, run live for the Verification Engine to exploit.
# Deliberately NOT the main server image — this app's bugs are the point, never patch them
# here (only ops/boot wiring, per the C7 plan's explicit scope boundary).
FROM node:22-alpine
WORKDIR /app
COPY packages/engine/test/fixtures/vuln-mern/server ./
COPY sandbox/seed.ts sandbox/seed-users.json ./
# the fixture's committed package-lock.json is stale and produces a broken tree
# (missing mongoose transitive deps) — drop it and let npm resolve fresh.
# plugins/.gitkeep is tracked so the empty dir survives in git, but dynamic.js requires
# every file it finds in plugins/ as Express middleware — it must be truly empty here.
RUN rm -f package-lock.json plugins/.gitkeep \
  && npm install --no-audit --no-fund \
  ts-node@10 tsconfig-paths@4 typescript@5 mongodb@5
EXPOSE 3000
# the `sandbox-seed` compose service overrides this with `npx ts-node seed.ts`
CMD ["npx", "ts-node", "--transpile-only", "-r", "tsconfig-paths/register", "server.js"]
