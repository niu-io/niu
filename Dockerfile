# Build the browser console first; the gateway serves these assets from its
# existing HTTP listener so the deployment has one Niu application container.
FROM node:24-bookworm-slim AS console
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/console/package.json apps/console/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY sdks/javascript/package.json sdks/javascript/package.json
RUN pnpm install --frozen-lockfile
COPY apps/console apps/console
COPY branding branding
RUN pnpm build:console

FROM rust:1.98-bookworm AS gateway-build
WORKDIR /workspace
COPY Cargo.toml Cargo.lock ./
COPY apps/gateway apps/gateway
COPY crates crates
COPY vendor/litellm-rust vendor/litellm-rust
COPY config config
COPY --from=console /workspace/apps/console/dist apps/console/dist
RUN cargo build --release --locked -p niu-gateway

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app --create-home niu
WORKDIR /app
COPY --from=gateway-build /workspace/target/release/niu-gateway /usr/local/bin/niu-gateway
COPY --from=gateway-build /workspace/apps/console/dist /app/console
ENV NIU_BIND=0.0.0.0:2555 \
    NIU_CONSOLE_DIR=/app/console \
    RUST_LOG=info
USER 10001:10001
EXPOSE 2555
ENTRYPOINT ["/usr/local/bin/niu-gateway"]
