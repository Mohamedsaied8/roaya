#include "websocket_server.hpp"
#include "../core/logger.hpp"
#include "../room/room_manager.hpp"
#include "signaling_handler.hpp"
#include <App.h>
#include <random>

// Note: This is a simplified implementation
// In production, use uWebSockets or libwebsockets for actual WebSocket handling

namespace roaya {

WebSocketServer::WebSocketServer(uint16_t port) : port_(port) {}

WebSocketServer::~WebSocketServer() { stop(); }

bool WebSocketServer::start() {
  if (running_.exchange(true)) {
    LOG_WARN("WebSocket server already running");
    return false;
  }

  LOG_INFO("Starting WebSocket server on port {}", port_);

  // Start server thread
  serverThread_ = std::thread([this]() { runLoop(); });

  return true;
}

void WebSocketServer::stop() {
  if (!running_.exchange(false)) {
    return;
  }

  LOG_INFO("Stopping WebSocket server...");

  // Close all connections
  {
    std::lock_guard<std::mutex> lock(mutex_);
    connections_.clear();
    participantToConnection_.clear();
  }

  if (serverThread_.joinable()) {
    // We need to tell the uWS event loop to stop. 
    // Usually this is done by closing the listen socket.
    if (listenSocket_) {
      // Logic to close listen socket from another thread
      // For now, let's keep it simple as uWS::App::run is blocking
    }
    serverThread_.join();
  }

  LOG_INFO("WebSocket server stopped");
}

struct PerSocketData {
  std::string id;
};

std::string generateConnId() {
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_int_distribution<> dis(0, 15);
  static const char *hex_chars = "0123456789abcdef";
  std::string uuid = "";
  for (int i = 0; i < 16; ++i)
    uuid += hex_chars[dis(gen)];
  return uuid;
}

void WebSocketServer::runLoop() {
  LOG_INFO("WebSocket server starting on port {}", port_);

  uWS::App()
      .ws<PerSocketData>(
          "/*",
          {.compression = uWS::DISABLED,
           .maxPayloadLength = 16 * 1024 * 1024,
           .idleTimeout = 60,
           .maxBackpressure = 1 * 1024 * 1024,
           .closeOnBackpressureLimit = false,
           .resetIdleTimeoutOnSend = false,
           .sendPingsAutomatically = true,
           .open =
               [this](auto *ws) {
                 std::string id = generateConnId();
                 ws->getUserData()->id = id;

                 auto conn = std::make_shared<WebSocketConnection>();
                 conn->id = id;
                 conn->sendCallback = [ws](const std::string &msg) {
                   ws->send(msg, uWS::OpCode::TEXT);
                 };

                 this->registerConnection(id, conn);
                 this->handleConnect(id);
               },
           .message =
               [this](auto *ws, std::string_view message, uWS::OpCode opCode) {
                 std::string id = ws->getUserData()->id;
                 this->handleMessage(id, std::string(message));
               },
           .close =
               [this](auto *ws, int code, std::string_view message) {
                 std::string id = ws->getUserData()->id;
                 this->handleDisconnect(id);

                 // clear callback to prevent use after free
                 auto conn = this->getConnection(id);
                 if (conn)
                   conn->sendCallback = nullptr;
               }})
      .listen(port_,
              [this](auto *listen_socket) {
                if (listen_socket) {
                  LOG_INFO("WebSocket server listening on port {}", port_);
                  this->listenSocket_ = listen_socket;
                } else {
                  LOG_ERROR("WebSocket server failed to listen on port {}",
                            port_);
                  running_ = false;
                }
              })
      .run();

  LOG_INFO("WebSocket server event loop exited");
}

void WebSocketServer::registerConnection(
    const std::string &connId, std::shared_ptr<WebSocketConnection> conn) {
  std::lock_guard<std::mutex> lock(mutex_);
  connections_[connId] = conn;
  LOG_DEBUG("Connection registered: {}", connId);
}

void WebSocketServer::unregisterConnection(const std::string &connId) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = connections_.find(connId);
  if (it != connections_.end()) {
    // Remove participant mapping
    if (!it->second->participantId.empty()) {
      participantToConnection_.erase(it->second->participantId);

      // Leave room if in one
      if (!it->second->roomId.empty()) {
        RoomManager::getInstance().leaveRoom(it->second->roomId,
                                             it->second->participantId);
      }
    }
    connections_.erase(it);
    LOG_DEBUG("Connection unregistered: {}", connId);
  }
}

std::shared_ptr<WebSocketConnection>
WebSocketServer::getConnection(const std::string &connId) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = connections_.find(connId);
  return it != connections_.end() ? it->second : nullptr;
}

void WebSocketServer::sendToConnection(const std::string &connId,
                                       const std::string &message) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = connections_.find(connId);
  if (it != connections_.end() && it->second->sendCallback) {
    it->second->sendCallback(message);
  }
}

void WebSocketServer::registerParticipantMapping(
    const std::string &participantId, const std::string &connId) {
  std::lock_guard<std::mutex> lock(mutex_);
  participantToConnection_[participantId] = connId;
}

void WebSocketServer::sendToParticipant(const std::string &participantId,
                                        const std::string &message) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = participantToConnection_.find(participantId);
  if (it != participantToConnection_.end()) {
    auto connIt = connections_.find(it->second);
    if (connIt != connections_.end() && connIt->second->sendCallback) {
      connIt->second->sendCallback(message);
    }
  }
}

void WebSocketServer::broadcastToRoom(const std::string &roomId,
                                      const std::string &message,
                                      const std::string &excludeId) {
  std::lock_guard<std::mutex> lock(mutex_);

  for (const auto &[connId, conn] : connections_) {
    if (conn->roomId == roomId && conn->participantId != excludeId &&
        conn->sendCallback) {
      conn->sendCallback(message);
    }
  }
}

int WebSocketServer::getConnectionCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<int>(connections_.size());
}

void WebSocketServer::handleConnect(const std::string &connId) {
  LOG_INFO("New WebSocket connection: {}", connId);
}

void WebSocketServer::handleDisconnect(const std::string &connId) {
  LOG_INFO("WebSocket disconnected: {}", connId);
  unregisterConnection(connId);
}

void WebSocketServer::handleMessage(const std::string &connId,
                                    const std::string &message) {
  auto conn = getConnection(connId);
  if (!conn) {
    LOG_WARN("Message from unknown connection: {}", connId);
    return;
  }

  // Delegate to signaling handler
  SignalingHandler::getInstance().handleMessage(conn, message);
}

} // namespace roaya
