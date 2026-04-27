# =============================================================================
# Multi-stage build for React + Vite frontend
# =============================================================================

# Stage 1: Build
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .

# Build-time environment variables
ARG VITE_API_BASE_URL
ARG VITE_ENABLE_HOST_SHELL=false
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ENABLE_HOST_SHELL=${VITE_ENABLE_HOST_SHELL}

RUN bun run build

# Stage 2: Production (Nginx)
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
