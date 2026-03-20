# Build stage
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libssl-dev \
    zlib1g-dev \
    libpq-dev \
    pkg-config \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source code
COPY . .

# Build
RUN mkdir -p build && cd build && \
    cmake -DCMAKE_BUILD_TYPE=Release .. && \
    make -j$(nproc)

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libssl3 \
    zlib1g \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary and config
COPY --from=builder /app/build/bin/roaya_server .
COPY --from=builder /app/config ./config

# Create logs directory
RUN mkdir -p logs

EXPOSE 8080 8081

CMD ["./roaya_server"]
