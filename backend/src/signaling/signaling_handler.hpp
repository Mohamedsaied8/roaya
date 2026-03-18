#pragma once

#include "message_types.hpp"
#include "websocket_server.hpp"
#include <memory>

namespace roaya {

/**
 * Handles signaling messages and routes them appropriately
 */
class SignalingHandler {
public:
  static SignalingHandler &getInstance();

  // Set WebSocket server reference
  void setWebSocketServer(WebSocketServer *server) { wsServer_ = server; }

  // Main message handler
  void handleMessage(std::shared_ptr<WebSocketConnection> conn,
                     const std::string &rawMessage);

private:
  SignalingHandler() = default;

  // Message type handlers
  void handleCreateRoom(std::shared_ptr<WebSocketConnection> conn,
                        const SignalingMessage &msg);
  void handleJoinRoom(std::shared_ptr<WebSocketConnection> conn,
                      const SignalingMessage &msg);
  void handleLeaveRoom(std::shared_ptr<WebSocketConnection> conn,
                       const SignalingMessage &msg);

  // WebRTC signaling
  void handleSdpOffer(std::shared_ptr<WebSocketConnection> conn,
                      const SignalingMessage &msg);
  void handleSdpAnswer(std::shared_ptr<WebSocketConnection> conn,
                       const SignalingMessage &msg);
  void handleIceCandidate(std::shared_ptr<WebSocketConnection> conn,
                          const SignalingMessage &msg);

  // Media controls
  void handleMediaStateChange(std::shared_ptr<WebSocketConnection> conn,
                              const SignalingMessage &msg);
  void handleScreenShare(std::shared_ptr<WebSocketConnection> conn,
                         const SignalingMessage &msg);

  // Chat
  void handleChatMessage(std::shared_ptr<WebSocketConnection> conn,
                         const SignalingMessage &msg);

  // Host controls
  void handleKickParticipant(std::shared_ptr<WebSocketConnection> conn,
                             const SignalingMessage &msg);
  void handleMuteAll(std::shared_ptr<WebSocketConnection> conn,
                     const SignalingMessage &msg);
  void handleEndMeeting(std::shared_ptr<WebSocketConnection> conn,
                        const SignalingMessage &msg);

  // Utility
  void sendError(std::shared_ptr<WebSocketConnection> conn,
                 const std::string &error);
  void broadcastToRoom(const std::string &roomId, const SignalingMessage &msg,
                       const std::string &excludeId = "");

  WebSocketServer *wsServer_ = nullptr;
};

} // namespace roaya
