#pragma once

#include <nlohmann/json.hpp>
#include <string>

namespace zoom {

/**
 * Signaling message types for WebSocket communication
 */
enum class MessageType {
  // Connection
  CONNECT,
  DISCONNECT,
  PING,
  PONG,

  // Room management
  CREATE_ROOM,
  JOIN_ROOM,
  LEAVE_ROOM,
  ROOM_CREATED,
  ROOM_JOINED,
  ROOM_LEFT,
  ROOM_ERROR,

  // Participant events
  PARTICIPANT_JOINED,
  PARTICIPANT_LEFT,
  PARTICIPANT_LIST,
  PARTICIPANT_UPDATE,

  // Media signaling (WebRTC)
  SDP_OFFER,
  SDP_ANSWER,
  ICE_CANDIDATE,
  MEDIA_STATE_CHANGE,

  // Media controls
  MUTE_AUDIO,
  UNMUTE_AUDIO,
  MUTE_VIDEO,
  UNMUTE_VIDEO,
  START_SCREEN_SHARE,
  STOP_SCREEN_SHARE,

  // Chat
  CHAT_MESSAGE,
  CHAT_HISTORY,

  // Host controls
  KICK_PARTICIPANT,
  MUTE_ALL,
  END_MEETING,

  // Errors
  ERROR,

  // Unknown
  UNKNOWN
};

// Convert MessageType to string
inline std::string messageTypeToString(MessageType type) {
  switch (type) {
  case MessageType::CONNECT:
    return "connect";
  case MessageType::DISCONNECT:
    return "disconnect";
  case MessageType::PING:
    return "ping";
  case MessageType::PONG:
    return "pong";
  case MessageType::CREATE_ROOM:
    return "create_room";
  case MessageType::JOIN_ROOM:
    return "join_room";
  case MessageType::LEAVE_ROOM:
    return "leave_room";
  case MessageType::ROOM_CREATED:
    return "room_created";
  case MessageType::ROOM_JOINED:
    return "room_joined";
  case MessageType::ROOM_LEFT:
    return "room_left";
  case MessageType::ROOM_ERROR:
    return "room_error";
  case MessageType::PARTICIPANT_JOINED:
    return "participant_joined";
  case MessageType::PARTICIPANT_LEFT:
    return "participant_left";
  case MessageType::PARTICIPANT_LIST:
    return "participant_list";
  case MessageType::PARTICIPANT_UPDATE:
    return "participant_update";
  case MessageType::SDP_OFFER:
    return "sdp_offer";
  case MessageType::SDP_ANSWER:
    return "sdp_answer";
  case MessageType::ICE_CANDIDATE:
    return "ice_candidate";
  case MessageType::MEDIA_STATE_CHANGE:
    return "media_state_change";
  case MessageType::MUTE_AUDIO:
    return "mute_audio";
  case MessageType::UNMUTE_AUDIO:
    return "unmute_audio";
  case MessageType::MUTE_VIDEO:
    return "mute_video";
  case MessageType::UNMUTE_VIDEO:
    return "unmute_video";
  case MessageType::START_SCREEN_SHARE:
    return "start_screen_share";
  case MessageType::STOP_SCREEN_SHARE:
    return "stop_screen_share";
  case MessageType::CHAT_MESSAGE:
    return "chat_message";
  case MessageType::CHAT_HISTORY:
    return "chat_history";
  case MessageType::KICK_PARTICIPANT:
    return "kick_participant";
  case MessageType::MUTE_ALL:
    return "mute_all";
  case MessageType::END_MEETING:
    return "end_meeting";
  case MessageType::ERROR:
    return "error";
  default:
    return "unknown";
  }
}

// Convert string to MessageType
inline MessageType stringToMessageType(const std::string &str) {
  if (str == "connect")
    return MessageType::CONNECT;
  if (str == "disconnect")
    return MessageType::DISCONNECT;
  if (str == "ping")
    return MessageType::PING;
  if (str == "pong")
    return MessageType::PONG;
  if (str == "create_room")
    return MessageType::CREATE_ROOM;
  if (str == "join_room")
    return MessageType::JOIN_ROOM;
  if (str == "leave_room")
    return MessageType::LEAVE_ROOM;
  if (str == "room_created")
    return MessageType::ROOM_CREATED;
  if (str == "room_joined")
    return MessageType::ROOM_JOINED;
  if (str == "room_left")
    return MessageType::ROOM_LEFT;
  if (str == "room_error")
    return MessageType::ROOM_ERROR;
  if (str == "participant_joined")
    return MessageType::PARTICIPANT_JOINED;
  if (str == "participant_left")
    return MessageType::PARTICIPANT_LEFT;
  if (str == "participant_list")
    return MessageType::PARTICIPANT_LIST;
  if (str == "participant_update")
    return MessageType::PARTICIPANT_UPDATE;
  if (str == "sdp_offer")
    return MessageType::SDP_OFFER;
  if (str == "sdp_answer")
    return MessageType::SDP_ANSWER;
  if (str == "ice_candidate")
    return MessageType::ICE_CANDIDATE;
  if (str == "media_state_change")
    return MessageType::MEDIA_STATE_CHANGE;
  if (str == "mute_audio")
    return MessageType::MUTE_AUDIO;
  if (str == "unmute_audio")
    return MessageType::UNMUTE_AUDIO;
  if (str == "mute_video")
    return MessageType::MUTE_VIDEO;
  if (str == "unmute_video")
    return MessageType::UNMUTE_VIDEO;
  if (str == "start_screen_share")
    return MessageType::START_SCREEN_SHARE;
  if (str == "stop_screen_share")
    return MessageType::STOP_SCREEN_SHARE;
  if (str == "chat_message")
    return MessageType::CHAT_MESSAGE;
  if (str == "chat_history")
    return MessageType::CHAT_HISTORY;
  if (str == "kick_participant")
    return MessageType::KICK_PARTICIPANT;
  if (str == "mute_all")
    return MessageType::MUTE_ALL;
  if (str == "end_meeting")
    return MessageType::END_MEETING;
  if (str == "error")
    return MessageType::ERROR;
  return MessageType::UNKNOWN;
}

/**
 * Base signaling message structure
 */
struct SignalingMessage {
  MessageType type;
  std::string roomId;
  std::string senderId;
  std::string targetId; // Optional: for direct messages
  nlohmann::json payload;
  int64_t timestamp;

  // Serialize to JSON
  nlohmann::json toJson() const {
    return {{"type", messageTypeToString(type)},
            {"roomId", roomId},
            {"senderId", senderId},
            {"targetId", targetId},
            {"payload", payload},
            {"timestamp", timestamp}};
  }

  // Deserialize from JSON
  static SignalingMessage fromJson(const nlohmann::json &j) {
    SignalingMessage msg;
    msg.type = stringToMessageType(j.value("type", "unknown"));
    msg.roomId = j.value("roomId", "");
    msg.senderId = j.value("senderId", "");
    msg.targetId = j.value("targetId", "");
    msg.payload = j.value("payload", nlohmann::json::object());
    msg.timestamp = j.value("timestamp", 0);
    return msg;
  }

  std::string toString() const { return toJson().dump(); }
};

} // namespace zoom
