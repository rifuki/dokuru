# =============================================================================
# Chef — install cargo-chef for dependency layer caching
# =============================================================================
ARG RUST_IMAGE=rust:1.95.0-trixie
FROM ${RUST_IMAGE} AS chef
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
# Runtime — minimal image
# =============================================================================
FROM debian:trixie-slim AS runtime

WORKDIR /app

RUN mkdir -p /app/config

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/dokuru-server .

EXPOSE 9393

CMD ["./dokuru-server"]
