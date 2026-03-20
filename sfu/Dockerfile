FROM node:20-bullseye-slim

# Install mediasoup dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    pip \
    pkg-config \
    build-essential \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Mediasoup RTP ports
EXPOSE 40000-49999/udp
EXPOSE 40000-49999/tcp

CMD ["npm", "start"]
