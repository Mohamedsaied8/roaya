#pragma once

#include "../signaling/websocket_server.hpp"
#include <atomic>
#include <memory>

namespace roaya {

// Forward declarations
class Config;
class HttpServer;

/**
 * Main server coordinator that manages all services
 */
class Server {
public:
  Server();
  ~Server();

  // Initialize all services
  bool initialize(const std::string &configPath = "config/config.json");

  // Start the server (blocking)
  void run();

  // Graceful shutdown
  void shutdown();

  // Check if server is running
  bool isRunning() const { return running_.load(); }

private:
  void setupSignalHandlers();
  void startWebSocketServer();
  void startHttpServer();
  void startMediaServer();

  std::atomic<bool> running_{false};

  // Service instances (to be implemented)
  std::unique_ptr<WebSocketServer> wsServer_;
  std::unique_ptr<HttpServer> httpServer_;
  // std::unique_ptr<SfuServer> sfuServer_;
};

} // namespace roaya
