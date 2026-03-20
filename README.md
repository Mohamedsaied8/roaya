# Roaya (Vision) - Video Conferencing System

Roaya is a high-performance, production-grade video conferencing application built with a C++ backend and a React/TypeScript frontend. It utilizes a Hybrid Actor-Model for signaling and a dedicated SFU (Selective Forwarding Unit) for media routing.

## Prerequisites

- **Docker** and **Docker Compose**
- **Sudo** privileges (if your user is not in the `docker` group)
- **Linux** (primary supported OS)

## Quick Start

To build and start all services (Backend, Frontend, SFU, PostgreSQL, Redis), run the following command from the root directory:

```bash
sudo docker compose up --build -d
```

Once the containers are running, you can access the application at:
- **Frontend**: [http://localhost:8082](http://localhost:8082)
- **Backend API**: [http://localhost:9090](http://localhost:9090)
- **Health Check**: [http://localhost:9090/health](http://localhost:9090/health)

## Project Structure

- `/backend`: C++ Signaling and API server.
- `/frontend`: React/TypeScript client using Vite.
- `/sfu`: Node.js/mediasoup media server.
- `/docs`: Architecture design, system diagrams, and implementation roadmap.

## Troubleshooting

### Port Conflicts
The SFU uses a range of TCP/UDP ports for WebRTC media. If you encounter a "port already in use" error (e.g., port 40031), you may need to adjust the range in `docker-compose.yml` and `sfu/src/mediasoup_manager.ts`. The default range is currently set to `41000-41100`.

### Docker Permissions
If you see `permission denied` when running Docker commands, ensure you use `sudo` or add your user to the `docker` group:
```bash
sudo usermod -aG docker $USER
# Then log out and log back in
```

### Backend Build Issues
The backend is compiled during the Docker build process. If compilation fails, check the build logs:
```bash
sudo docker compose logs backend
```
Common issues include CMake target conflicts or missing shared libraries (like `libpq5`), which have been addressed in the current configuration.

## Manual Testing

1. Open the [frontend](http://localhost:8082).
2. Register a new account or log in.
3. Create or join a meeting using a room code.
4. Verify audio/video streaming (requires camera/mic permissions).
