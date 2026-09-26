# Build the browser UI first; the gateway serves these assets from its existing
# HTTP listener so the product ships as one Niu application container.
FROM node:24-bookworm-slim AS console
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/console/package.json apps/console/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY apps/site/package.json apps/site/package.json
COPY sdks/javascript/package.json sdks/javascript/package.json
RUN pnpm install --frozen-lockfile
COPY scripts/verify-js-licenses.mjs scripts/verify-js-licenses.mjs
RUN node scripts/verify-js-licenses.mjs
COPY apps/console apps/console
COPY apps/docs apps/docs
COPY apps/site apps/site
COPY branding branding
RUN pnpm build:console && pnpm build:docs && pnpm build:site

FROM rust:1.98-bookworm AS gateway-build
WORKDIR /workspace
ENV CARGO_BUILD_JOBS=2
COPY Cargo.toml Cargo.lock ./
COPY apps/gateway apps/gateway
COPY crates crates
COPY tests/extensions/reference-extension tests/extensions/reference-extension
COPY vendor/litellm-rust vendor/litellm-rust
COPY config config
COPY --from=console /workspace/apps/console/dist apps/console/dist
COPY --from=console /workspace/apps/docs/dist apps/docs/dist
COPY --from=console /workspace/apps/site/dist apps/site/dist
RUN cargo build --release --locked -p niu-gateway

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app --create-home niu
WORKDIR /app
COPY --from=gateway-build /workspace/target/release/niu-gateway /usr/local/bin/niu-gateway
COPY --from=gateway-build /workspace/apps/console/dist /app/console
COPY --from=gateway-build /workspace/apps/docs/dist /app/docs
COPY --from=gateway-build /workspace/apps/site/dist /app/site
ENV NIU_CONSOLE_DIR=/app/console \
    NIU_DOCS_DIR=/app/docs \
    NIU_SITE_DIR=/app/site \
    RUST_LOG=info
USER 10001:10001
EXPOSE 2555 10000
ENTRYPOINT ["/usr/local/bin/niu-gateway"]
