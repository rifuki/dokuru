# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM rust:1.95-bookworm AS build

ARG TRUNK_VERSION=0.21.14
ARG BUILDARCH
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl tar gzip binaryen; \
    rm -rf /var/lib/apt/lists/*; \
    rustup target add wasm32-unknown-unknown; \
    case "${BUILDARCH}" in \
        amd64) trunk_arch="x86_64" ;; \
        arm64) trunk_arch="aarch64" ;; \
        *) echo "unsupported build architecture: ${BUILDARCH}" >&2; exit 1 ;; \
    esac; \
    curl --proto '=https' --tlsv1.2 -LsSf "https://github.com/trunk-rs/trunk/releases/download/v${TRUNK_VERSION}/trunk-${trunk_arch}-unknown-linux-gnu.tar.gz" | tar -xz -C /usr/local/bin; \
    curl -fsSL https://bun.sh/install | bash

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY Cargo.toml Cargo.lock Trunk.toml index.html ./
COPY public ./public
COPY src ./src
COPY style ./style

RUN bun run build

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
