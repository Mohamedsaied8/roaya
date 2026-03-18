#include "server.hpp"
#include "../api/http_server.hpp"
#include "../db/redis_client.hpp"
#include "../db/user_repository.hpp"
#include "../room/room_manager.hpp"
#include "../signaling/signaling_handler.hpp"
#include "config.hpp"
#include "logger.hpp"
#include <csignal>
#include <thread>
#include <vector>
namespace roaya {

namespace {
std::atomic<bool> g_shutdownRequested{false};

void signalHandler(int signum) {
  LOG_INFO("Received signal {}, initiating shutdown...", signum);
  g_shutdownRequested.store(true);
}

class Executor {
public:
  template <typename F> void execute(F &&f) {
    threads_.emplace_back(std::forward<F>(f));
  }

private:
  std::vector<std::jthread> threads_;
};
} // namespace

Server::Server() = default;
Server::~Server() = default;

bool Server::initialize(const std::string &configPath) {
  // Initialize logger first
  Logger::init("info");

  LOG_INFO("===========================================");
  LOG_INFO("  Roaya Video Conferencing Server");
  LOG_INFO("  Version 1.0.0");
  LOG_INFO("===========================================");

  // Load configuration
  if (!Config::getInstance().loadFromFile(configPath)) {
    LOG_WARN("Using default configuration");
  }

  auto &config = Config::getInstance();
  LOG_INFO("Server configured for {}:{}", config.getServerHost(),
           config.getServerPort());
  LOG_INFO("WebSocket port: {}", config.getWebSocketPort());
  LOG_INFO("Media port: {}", config.getMediaPort());
  LOG_INFO("Max participants per room: {}", config.getMaxParticipantsPerRoom());

  // Setup signal handlers
  setupSignalHandlers();

  // Initialize database connection
  UserRepository::getInstance();
  LOG_INFO("Database (PostgreSQL) repository initialized");

  // Initialize Redis client
  if (!RedisClient::getInstance().connect(config.getRedisHost(),
                                          config.getRedisPort())) {
    LOG_WARN("Failed to connect to Redis server. Using in-memory fallback.");
  }

  wsServer_ = std::make_unique<WebSocketServer>(config.getWebSocketPort());
  httpServer_ = std::make_unique<HttpServer>(config.getServerPort());

  // TODO: Initialize SFU media server

  LOG_INFO("Server initialization complete");
  return true;
}

void Server::setupSignalHandlers() {
  std::signal(SIGINT, signalHandler);
  std::signal(SIGTERM, signalHandler);
  LOG_DEBUG("Signal handlers registered");
}

void Server::run() {
  if (!running_.exchange(true)) {
    LOG_INFO("Server starting...");

    Executor executor;

    // Start RoomManager processing loop
    RoomManager::getInstance().start();

    // Start WebSocket server thread
    executor.execute([this]() { startWebSocketServer(); });

    // Start HTTP server thread
    executor.execute([this]() { startHttpServer(); });

    // TODO: Start Media server thread (Implementation planned for Phase G)
    // executor.execute([this]() { startMediaServer(); });

    LOG_INFO("All services started. Waiting for connections...");

    // Main loop - wait for shutdown signal
    while (running_.load() && !g_shutdownRequested.load()) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    // Cleanup
    shutdown();

    // Threads in executor will be automatically joined upon destruction of
    // Executor
    LOG_INFO("Server stopped");
  }
}

void Server::shutdown() {
  if (running_.exchange(false)) {
    LOG_INFO("Shutting down server...");

    // Stop all services gracefully
    if (wsServer_)
      wsServer_->stop();
    if (httpServer_)
      httpServer_->stop();
    
    // Stop RoomManager loop
    RoomManager::getInstance().stop();
    // if (sfuServer_) sfuServer_->stop(); // TODO: Uncomment when SFU is
    // implemented

    LOG_INFO("All services stopped");
  }
}

void Server::startWebSocketServer() {
  LOG_INFO("WebSocket server starting on port {}",
           Config::getInstance().getWebSocketPort());
  if (wsServer_) {
    // Provide a reference to the WebSocket server in the signaling handler
    SignalingHandler::getInstance().setWebSocketServer(wsServer_.get());
    wsServer_->start();
  }
}

void Server::startHttpServer() {
  LOG_INFO("HTTP server starting on port {}",
           Config::getInstance().getServerPort());
  if (httpServer_) {
    httpServer_->start();
  }
}

void Server::startMediaServer() {
  LOG_INFO("Media (SFU) server starting on port {}",
           Config::getInstance().getMediaPort());
  // TODO: Implement SFU server loop
}

} // namespace roaya
