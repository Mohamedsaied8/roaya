#include "room.hpp"
#include "../core/logger.hpp"
#include "../signaling/message_types.hpp"
#include <algorithm>
#include <random>

namespace roaya {

Room::Room(const std::string &id, const std::string &name,
           const std::string &hostId)
    : id_(id), name_(name), hostId_(hostId),
      meetingCode_(generateMeetingCode()), inQueue_(QUEUE_CAPACITY),
      createdTime_(std::chrono::system_clock::now()) {
  LOG_INFO("Room created: {} ({}), host: {}", name_, id_, hostId_);
}

std::string Room::generateMeetingCode() {
  // Generate a random 10-digit meeting code like "123-456-7890"
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_int_distribution<> dis(0, 9);

  std::string code;
  for (int i = 0; i < 10; ++i) {
    if (i == 3 || i == 6)
      code += '-';
    code += std::to_string(dis(gen));
  }
  return code;
}

bool Room::addParticipant(std::shared_ptr<Participant> participant) {
  std::lock_guard<std::mutex> lock(mutex_);

  if (participants_.size() >= MAX_PARTICIPANTS) {
    LOG_WARN("Room {} is full, cannot add participant {}", id_,
             participant->getId());
    return false;
  }

  if (participants_.find(participant->getId()) != participants_.end()) {
    LOG_WARN("Participant {} already in room {}", participant->getId(), id_);
    return false;
  }

  participants_[participant->getId()] = participant;
  LOG_INFO("Participant {} ({}) joined room {}", participant->getName(),
           participant->getId(), id_);

  return true;
}

bool Room::removeParticipant(const std::string &participantId) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = participants_.find(participantId);
  if (it == participants_.end()) {
    return false;
  }

  LOG_INFO("Participant {} left room {}", participantId, id_);
  participants_.erase(it);

  // If host left and there are still participants, transfer host
  if (participantId == hostId_ && !participants_.empty()) {
    auto newHost = participants_.begin()->second;
    hostId_ = newHost->getId();
    newHost->setRole(Participant::Role::HOST);
    LOG_INFO("Host transferred to {} in room {}", hostId_, id_);
  }

  return true;
}

std::shared_ptr<Participant>
Room::getParticipant(const std::string &participantId) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = participants_.find(participantId);
  return it != participants_.end() ? it->second : nullptr;
}

std::vector<std::shared_ptr<Participant>> Room::getParticipants() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<std::shared_ptr<Participant>> result;
  result.reserve(participants_.size());
  for (const auto &[id, participant] : participants_) {
    result.push_back(participant);
  }
  return result;
}

int Room::getParticipantCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<int>(participants_.size());
}

bool Room::isFull() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return participants_.size() >= MAX_PARTICIPANTS;
}

bool Room::isHost(const std::string &participantId) const {
  return participantId == hostId_;
}

void Room::transferHost(const std::string &newHostId) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto oldHost = participants_.find(hostId_);
  auto newHost = participants_.find(newHostId);

  if (newHost == participants_.end()) {
    LOG_WARN("Cannot transfer host to non-existent participant {}", newHostId);
    return;
  }

  if (oldHost != participants_.end()) {
    oldHost->second->setRole(Participant::Role::PARTICIPANT);
  }

  newHost->second->setRole(Participant::Role::HOST);
  hostId_ = newHostId;

  LOG_INFO("Host transferred to {} in room {}", newHostId, id_);
}

bool Room::pushMessage(const SignalingMessage &msg) { return inQueue_.push(msg); }

void Room::processMessages() {
  SignalingMessage msg;
  while (inQueue_.pop(msg)) {
    handleMessage(msg);
  }
}

void Room::handleMessage(const SignalingMessage &msg) {
  // Signal routing logic (WebRTC + custom events)
  switch (msg.type) {
  case MessageType::CHAT_MESSAGE: {
    auto participant = getParticipant(msg.senderId);
    if (participant) {
      SignalingMessage broadcastMsg = msg;
      broadcastMsg.payload["senderName"] = participant->getName();
      broadcastMsg.payload["senderId"] = msg.senderId;
      broadcast(broadcastMsg);
    }
    break;
  }
  case MessageType::SDP_OFFER:
  case MessageType::SDP_ANSWER:
  case MessageType::ICE_CANDIDATE:
    if (!msg.targetId.empty()) {
      sendTo(msg.targetId, msg);
    } else {
      broadcast(msg, msg.senderId);
    }
    break;
  case MessageType::MEDIA_STATE_CHANGE: {
    auto participant = getParticipant(msg.senderId);
    if (participant) {
      if (msg.payload.contains("audioMuted")) {
        participant->setAudioMuted(msg.payload["audioMuted"]);
      }
      if (msg.payload.contains("videoMuted")) {
        participant->setVideoMuted(msg.payload["videoMuted"]);
      }

      SignalingMessage updateMsg;
      updateMsg.type = MessageType::PARTICIPANT_UPDATE;
      updateMsg.roomId = id_;
      updateMsg.senderId = msg.senderId;
      updateMsg.payload = participant->toJson();
      broadcast(updateMsg);
    }
    break;
  }
  case MessageType::START_SCREEN_SHARE:
  case MessageType::STOP_SCREEN_SHARE: {
    auto participant = getParticipant(msg.senderId);
    if (participant) {
      participant->setScreenSharing(msg.type ==
                                    MessageType::START_SCREEN_SHARE);
      broadcast(msg, msg.senderId);
    }
    break;
  }
  default:
    // Lifecycle messages (CREATE/JOIN/LEAVE) are handled in SignalingHandler synchronously
    break;
  }
}

void Room::broadcast(const std::string &message, const std::string &excludeId) {
  if (!broadcastCallback_)
    return;

  std::lock_guard<std::mutex> lock(mutex_);
  for (const auto &[id, participant] : participants_) {
    if (id != excludeId) {
      broadcastCallback_(id, message);
    }
  }
}

void Room::broadcast(const SignalingMessage &msg, const std::string &excludeId) {
  broadcast(msg.toJson().dump(), excludeId);
}

void Room::sendTo(const std::string &participantId,
                  const std::string &message) {
  if (!broadcastCallback_)
    return;
  broadcastCallback_(participantId, message);
}

void Room::sendTo(const std::string &participantId,
                  const SignalingMessage &msg) {
  sendTo(participantId, msg.toJson().dump());
}

nlohmann::json Room::toJson() const {
  return {{"id", id_},
          {"name", name_},
          {"meetingCode", meetingCode_},
          {"hostId", hostId_},
          {"participantCount", getParticipantCount()},
          {"maxParticipants", MAX_PARTICIPANTS},
          {"active", active_.load()}};
}

nlohmann::json Room::toJsonWithParticipants() const {
  std::lock_guard<std::mutex> lock(mutex_);

  nlohmann::json participantsJson = nlohmann::json::array();
  for (const auto &[id, participant] : participants_) {
    participantsJson.push_back(participant->toJson());
  }

  return {{"id", id_},
          {"name", name_},
          {"meetingCode", meetingCode_},
          {"hostId", hostId_},
          {"participants", participantsJson},
          {"maxParticipants", MAX_PARTICIPANTS},
          {"active", active_.load()}};
}

} // namespace roaya
