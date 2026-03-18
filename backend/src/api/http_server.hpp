#pragma once

#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <thread>

// Forward declaration for httplib
namespace httplib {
class Server;
}

namespace zoom {

/**
 * HTTP server for REST API endpoints
 * Uses cpp-httplib for HTTP handling
 */
class HttpServer {
public:
  HttpServer(uint16_t port);
  ~HttpServer();

  // Lifecycle
  bool start();
  void stop();
  bool isRunning() const { return running_.load(); }

private:
  void setupRoutes();
  void setupAuthRoutes();
  void setupRoomRoutes();
  void setupUserRoutes();

  uint16_t port_;
  std::atomic<bool> running_{false};
  std::thread serverThread_;
  std::unique_ptr<httplib::Server> server_;
};

} // namespace zoom
