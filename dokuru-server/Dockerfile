# =============================================================================
# Chef — install cargo-chef for dependency layer caching
# =============================================================================
ARG RUST_IMAGE=rust:1.95.0-alpine3.22
FROM ${RUST_IMAGE} AS chef
RUN apk add --no-cache build-base
RUN cargo install cargo-chef --locked
WORKDIR /app

# =============================================================================
# Planner — generate recipe.json from Cargo manifests
# =============================================================================
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# =============================================================================
# Builder — cook deps (cached layer), then build binary
# =============================================================================
FROM chef AS builder

# Restore deps from cache — only re-runs when Cargo.toml/Cargo.lock changes
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Build the actual binary
COPY . .
ENV SQLX_OFFLINE=true
RUN cargo build --release --bin dokuru-server

# =============================================================================
# Runtime — static binary image
# =============================================================================
FROM scratch AS runtime

WORKDIR /app

COPY --from=builder /app/target/release/dokuru-server /app/dokuru-server

EXPOSE 9393

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
    CMD ["/app/dokuru-server", "--healthcheck"]

CMD ["/app/dokuru-server"]
