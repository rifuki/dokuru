# =============================================================================
# Chef — install cargo-chef for dependency layer caching
# =============================================================================
FROM rust:1-bookworm AS chef
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
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Restore deps from cache — only re-runs when Cargo.toml/Cargo.lock changes
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Build the actual binary
COPY . .
RUN cargo build --release --bin dokuru-server

# =============================================================================
# Runtime — minimal image (built from source)
# =============================================================================
FROM debian:bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y ca-certificates libssl3 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/dokuru-server .

EXPOSE 9393

CMD ["./dokuru-server"]

# =============================================================================
# Runtime CI — accepts pre-built binary (used by GitHub Actions)
# =============================================================================
FROM debian:bookworm-slim AS runtime-ci

WORKDIR /app

RUN apt-get update \
    && apt-get install -y ca-certificates libssl3 curl \
    && rm -rf /var/lib/apt/lists/*

ARG BINARY=dokuru-server
COPY $BINARY ./dokuru-server

EXPOSE 9393

CMD ["./dokuru-server"]
