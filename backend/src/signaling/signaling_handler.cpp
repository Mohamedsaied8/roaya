#include "signaling_handler.hpp"
#include "media/sfu/sfu_manager.hpp" // Added include
#include "../core/logger.hpp"
#include "../room/participant.hpp"
#include "../room/room.hpp"
#include "../room/room_manager.hpp"
#include <chrono>
#include <nlohmann/json.hpp>

namespace roaya {

SignalingHandler &SignalingHandler::getInstance() {
  static SignalingHandler instance;
  return instance;
}

void SignalingHandler::handleMessage(std::shared_ptr<WebSocketConnection> conn,
                                     const std::string &rawMessage) {
  try {
    auto json = nlohmann::json::parse(rawMessage);
    SignalingMessage msg = SignalingMessage::fromJson(json);

    LOG_DEBUG("Received message type: {} from {}",
              messageTypeToString(msg.type), conn->id);

    switch (msg.type) {
    case MessageType::CREATE_ROOM:
      handleCreateRoom(conn, msg);
      break;
    case MessageType::SFU_CREATE_WEBRTC_TRANSPORT:
    case MessageType::SFU_CONNECT_WEBRTC_TRANSPORT:
    case MessageType::SFU_PRODUCE:
    case MessageType::SFU_CONSUME:
    case MessageType::SFU_GET_ROUTER_RTP_CAPABILITIES:
    case MessageType::SFU_GET_ACTIVE_PRODUCERS:
    case MessageType::SFU_CLOSE_PRODUCER:
      SFUManager::getInstance().handleSFUMessage(msg, [conn](const SignalingMessage& res) {
        conn->sendCallback(res.toString());
      });
      break;
    case MessageType::JOIN_ROOM:
      handleJoinRoom(conn, msg);
      break;
    case MessageType::LEAVE_ROOM:
      handleLeaveRoom(conn, msg);
      break;
    case MessageType::KICK_PARTICIPANT:
      handleKickParticipant(conn, msg);
      break;
    case MessageType::END_MEETING:
      handleEndMeeting(conn, msg);
      break;
    case MessageType::PING: {
      SignalingMessage pong;
      pong.type = MessageType::PONG;
      pong.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                           std::chrono::system_clock::now().time_since_epoch())
                           .count();
      conn->sendCallback(pong.toString());
    } break;
    default: {
      // Offload all other messages to Room thread
      if (conn->roomId.empty()) {
        sendError(conn, "Not in a room");
        break;
      }
      auto room = RoomManager::getInstance().getRoom(conn->roomId);
      if (room) {
        msg.senderId = conn->participantId; // Ensure senderId is correct
        if (!room->pushMessage(msg)) {
          LOG_WARN("Room {} queue is full, dropping message", conn->roomId);
        }
      } else {
        sendError(conn, "Room not found");
      }
      break;
    }
    }
  } catch (const nlohmann::json::exception &e) {
    LOG_ERROR("Failed to parse message: {}", e.what());
    sendError(conn, "Invalid JSON format");
  }
}

void SignalingHandler::handleCreateRoom(
    std::shared_ptr<WebSocketConnection> conn, const SignalingMessage &msg) {
  std::string roomName = msg.payload.value("name", "Untitled Meeting");
  std::string hostName = msg.payload.value("hostName", "Host");

  // Create participant for host
  auto participantId = conn->id + "_p";
  auto participant = std::make_shared<Participant>(participantId, hostName);
  participant->setRole(Participant::Role::HOST);
  participant->setConnectionId(conn->id);

  // Create room
  auto room = RoomManager::getInstance().createRoom(roomName, participantId);
  if (!room) {
    sendError(conn, "Failed to create room");
    return;
  }

  // Set broadcast callback for the room
  room->setBroadcastCallback(
      [this](const std::string &pId, const std::string &msgStr) {
        if (this->wsServer_) {
          this->wsServer_->sendToParticipant(pId, msgStr);
        }
      });

  // Add host to room
  if (!RoomManager::getInstance().joinRoom(room->getId(), participant)) {
    sendError(conn, "Failed to join room as host");
    return;
  }

  // Update connection state
  conn->participantId = participantId;
  conn->roomId = room->getId();
  if (wsServer_) {
    wsServer_->registerParticipantMapping(participantId, conn->id);
  }

  // Send success response
  SignalingMessage response;
  response.type = MessageType::ROOM_CREATED;
  response.roomId = room->getId();
  response.senderId = participantId;
  response.payload = room->toJsonWithParticipants();
  response.payload["meetingCode"] = room->getMeetingCode();
  response.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                           std::chrono::system_clock::now().time_since_epoch())
                           .count();

  conn->sendCallback(response.toString());

  LOG_INFO("Room created: {} by {}", room->getId(), hostName);
}

void SignalingHandler::handleJoinRoom(std::shared_ptr<WebSocketConnection> conn,
                                      const SignalingMessage &msg) {
  std::string roomId = msg.roomId;
  std::string meetingCode = msg.payload.value("meetingCode", "");
  std::string participantName = msg.payload.value("name", "Participant");

  // Find room by ID or meeting code
  std::shared_ptr<Room> room;
  if (!roomId.empty()) {
    room = RoomManager::getInstance().getRoom(roomId);
  } else if (!meetingCode.empty()) {
    room = RoomManager::getInstance().getRoomByCode(meetingCode);
  }

  if (!room) {
    sendError(conn, "Room not found");
    return;
  }

  // Ensure broadcast callback is set (if not already)
  room->setBroadcastCallback(
      [this](const std::string &pId, const std::string &msgStr) {
        if (this->wsServer_) {
          this->wsServer_->sendToParticipant(pId, msgStr);
        }
      });

  if (room->isFull()) {
    sendError(conn, "Room is full (50 participants max)");
    return;
  }

  // Create participant
  auto participantId = conn->id + "_p";
  auto participant =
      std::make_shared<Participant>(participantId, participantName);
  participant->setConnectionId(conn->id);

  if (!RoomManager::getInstance().joinRoom(room->getId(), participant)) {
    sendError(conn, "Failed to join room");
    return;
  }

  // Update connection state
  conn->participantId = participantId;
  conn->roomId = room->getId();
  if (wsServer_) {
    wsServer_->registerParticipantMapping(participantId, conn->id);
  }

  // Send join success to new participant
  SignalingMessage response;
  response.type = MessageType::ROOM_JOINED;
  response.roomId = room->getId();
  response.senderId = participantId;
  response.payload = room->toJsonWithParticipants();
  response.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                           std::chrono::system_clock::now().time_since_epoch())
                           .count();

  conn->sendCallback(response.toString());

  // Broadcast to other participants
  SignalingMessage broadcast;
  broadcast.type = MessageType::PARTICIPANT_JOINED;
  broadcast.roomId = room->getId();
  broadcast.senderId = participantId;
  broadcast.payload = participant->toJson();
  broadcast.timestamp = response.timestamp;

  broadcastToRoom(room->getId(), broadcast, participantId);

  LOG_INFO("Participant {} joined room {}", participantName, room->getId());
}

void SignalingHandler::handleLeaveRoom(
    std::shared_ptr<WebSocketConnection> conn, const SignalingMessage &msg) {
  if (conn->roomId.empty() || conn->participantId.empty()) {
    return;
  }

  auto room = RoomManager::getInstance().getRoom(conn->roomId);
  std::string roomId = conn->roomId;
  std::string participantId = conn->participantId;

  // Leave room
  RoomManager::getInstance().leaveRoom(roomId, participantId);

  // Clear connection state
  conn->roomId = "";
  conn->participantId = "";

  // Send confirmation
  SignalingMessage response;
  response.type = MessageType::ROOM_LEFT;
  response.roomId = roomId;
  response.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                           std::chrono::system_clock::now().time_since_epoch())
                           .count();

  conn->sendCallback(response.toString());

  // Broadcast to others if room still exists
  if (room && room->getParticipantCount() > 0) {
    SignalingMessage broadcast;
    broadcast.type = MessageType::PARTICIPANT_LEFT;
    broadcast.roomId = roomId;
    broadcast.senderId = participantId;
    broadcast.payload = {{"participantId", participantId}};
    broadcast.timestamp = response.timestamp;

    broadcastToRoom(roomId, broadcast);
  }

  LOG_INFO("Participant {} left room {}", participantId, roomId);
}

void SignalingHandler::handleKickParticipant(
    std::shared_ptr<WebSocketConnection> conn, const SignalingMessage &msg) {
  if (conn->roomId.empty() || conn->participantId.empty())
    return;

  auto room = RoomManager::getInstance().getRoom(conn->roomId);
  if (!room || room->getHostId() != conn->participantId) {
    sendError(conn, "Only host can kick participants");
    return;
  }

  std::string targetId = msg.payload.value("participantId", "");
  if (targetId.empty()) {
    sendError(conn, "Missing participantId to kick");
    return;
  }

  // Notify the kicked participant
  SignalingMessage kickMsg;
  kickMsg.type = MessageType::KICK_PARTICIPANT;
  kickMsg.roomId = conn->roomId;
  kickMsg.payload = {{"reason", "Kicked by host"}};
  if (wsServer_) {
    wsServer_->sendToParticipant(targetId, kickMsg.toString());
  }

  // Remove from room
  RoomManager::getInstance().leaveRoom(conn->roomId, targetId);

  // Notify others
  SignalingMessage update;
  update.type = MessageType::PARTICIPANT_LEFT;
  update.roomId = conn->roomId;
  update.payload = {{"participantId", targetId}};
  broadcastToRoom(conn->roomId, update);

  LOG_INFO("Participant {} kicked from room {} by host", targetId,
           conn->roomId);
}

void SignalingHandler::handleEndMeeting(
    std::shared_ptr<WebSocketConnection> conn, const SignalingMessage &msg) {
  if (conn->roomId.empty() || conn->participantId.empty())
    return;

  auto room = RoomManager::getInstance().getRoom(conn->roomId);
  if (!room || room->getHostId() != conn->participantId) {
    sendError(conn, "Only host can end meeting");
    return;
  }

  std::string roomId = conn->roomId;

  // Notify all participants
  SignalingMessage endMsg;
  endMsg.type = MessageType::END_MEETING;
  endMsg.roomId = roomId;
  broadcastToRoom(roomId, endMsg);

  // Delete room
  RoomManager::getInstance().deleteRoom(roomId);

  LOG_INFO("Meeting ended in room {} by host", roomId);
}


void SignalingHandler::sendError(std::shared_ptr<WebSocketConnection> conn,
                                 const std::string &error) {
  SignalingMessage msg;
  msg.type = MessageType::ERROR;
  msg.payload = {{"error", error}};
  msg.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                      std::chrono::system_clock::now().time_since_epoch())
                      .count();

  if (conn->sendCallback) {
    conn->sendCallback(msg.toString());
  }

  LOG_WARN("Error sent to {}: {}", conn->id, error);
}

void SignalingHandler::broadcastToRoom(const std::string &roomId,
                                       const SignalingMessage &msg,
                                       const std::string &excludeId) {
  if (wsServer_) {
    wsServer_->broadcastToRoom(roomId, msg.toString(), excludeId);
  }
}

} // namespace roaya
