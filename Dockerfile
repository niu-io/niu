# Build the browser UI first; the gateway serves these assets from its existing
# HTTP listener so the product ships as one Niu application container.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS dashboard
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY apps/catalog/package.json apps/catalog/package.json
COPY sdks/javascript/package.json sdks/javascript/package.json
RUN pnpm install --frozen-lockfile
COPY scripts/verify-js-licenses.mjs scripts/verify-js-licenses.mjs
RUN node scripts/verify-js-licenses.mjs
COPY apps/dashboard apps/dashboard
COPY apps/docs apps/docs
COPY apps/catalog apps/catalog
COPY sdks/javascript/src sdks/javascript/src
COPY branding branding
RUN pnpm build:dashboard && pnpm build:docs && pnpm build:catalog

FROM rust:1.98-bookworm@sha256:93ce27a88655056a51dbdd8f5f2d7ddc071c7b0070fb288a37b5a285fc83971e AS gateway-build
WORKDIR /workspace
ENV CARGO_BUILD_JOBS=2
COPY Cargo.toml Cargo.lock ./
COPY apps/gateway apps/gateway
COPY crates crates
COPY tests/extensions/reference-extension tests/extensions/reference-extension
COPY vendor/litellm-rust vendor/litellm-rust
COPY config config
COPY branding branding
COPY --from=dashboard /workspace/apps/dashboard/dist apps/dashboard/dist
COPY --from=dashboard /workspace/apps/docs/dist apps/docs/dist
COPY --from=dashboard /workspace/apps/catalog/dist apps/catalog/dist
# Cache compilation inputs between source revisions. Copy the finished binary
# outside the cache so the runtime image never depends on builder cache state.
RUN --mount=type=cache,id=niu-rust-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=niu-rust-target-1-98,target=/workspace/target,sharing=locked \
    cargo build --release --locked -p niu-gateway \
    && cp target/release/niu-gateway /workspace/niu-gateway

FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587 AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app --create-home niu
WORKDIR /app
COPY --from=gateway-build /workspace/niu-gateway /usr/local/bin/niu-gateway
COPY LICENSE /app/licenses/LICENSE
COPY THIRD-PARTY-NOTICES.md /app/licenses/THIRD-PARTY-NOTICES.md
COPY vendor/litellm-rust/LICENSE /app/licenses/litellm-MIT.txt
COPY vendor/litellm-rust/SOURCE-MANIFEST.json /app/licenses/litellm-source-manifest.json
COPY apps/dashboard/licenses/shadcn-ui.txt /app/licenses/shadcn-ui-MIT.txt
COPY --from=gateway-build /workspace/apps/dashboard/dist /app/dashboard
COPY --from=gateway-build /workspace/apps/docs/dist /app/docs
COPY --from=gateway-build /workspace/apps/catalog/dist /app/catalog
ENV NIU_DASHBOARD_DIR=/app/dashboard \
    NIU_DOCS_DIR=/app/docs \
    NIU_CATALOG_DIR=/app/catalog \
    RUST_LOG=info
USER 10001:10001
EXPOSE 2555 10000
ENTRYPOINT ["/usr/local/bin/niu-gateway"]
