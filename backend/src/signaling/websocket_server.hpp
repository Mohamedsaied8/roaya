#pragma once

#include "../signaling/message_types.hpp"
#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>

namespace roaya {

// Forward declarations
class Room;
class Participant;

/**
 * WebSocket connection wrapper
 */
struct WebSocketConnection {
  std::string id;
  std::string participantId;
  std::string roomId;
  bool authenticated = false;
  std::string token;

  // Callback to send message
  std::function<void(const std::string &)> sendCallback;
};

/**
 * High-performance WebSocket server for signaling
 */
class WebSocketServer {
public:
  WebSocketServer(uint16_t port);
  ~WebSocketServer();

  // Lifecycle
  bool start();
  void stop();
  bool isRunning() const { return running_.load(); }

  // Connection management
  void registerConnection(const std::string &connId,
                          std::shared_ptr<WebSocketConnection> conn);
  void unregisterConnection(const std::string &connId);
  std::shared_ptr<WebSocketConnection> getConnection(const std::string &connId);

  // Message sending
  void sendToConnection(const std::string &connId, const std::string &message);
  void sendToParticipant(const std::string &participantId,
                         const std::string &message);
  void broadcastToRoom(const std::string &roomId, const std::string &message,
                       const std::string &excludeId = "");
  void registerParticipantMapping(const std::string &participantId,
                                  const std::string &connId);

  // Stats
  int getConnectionCount() const;

private:
  void runLoop();
  void handleMessage(const std::string &connId, const std::string &message);
  void handleConnect(const std::string &connId);
  void handleDisconnect(const std::string &connId);

  uint16_t port_;
  std::atomic<bool> running_{false};
  std::thread serverThread_;
  void *listenSocket_ = nullptr; // struct us_listen_socket_t *

  std::unordered_map<std::string, std::shared_ptr<WebSocketConnection>>
      connections_;
  std::unordered_map<std::string, std::string> participantToConnection_;
  mutable std::mutex mutex_;
};

} // namespace roaya
