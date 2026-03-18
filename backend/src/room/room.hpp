#pragma once

#include "../core/spsc_queue.hpp"
#include "../signaling/message_types.hpp"
#include "participant.hpp"
#include <atomic>
#include <chrono>
#include <functional>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <string>
#include <unordered_map>
#include <vector>

namespace roaya {

/**
 * @brief Represents a meeting room with up to 50 participants.
 * Each room runs its own message loop (thread-pinned via RoomManager).
 */
class Room {
public:
  static constexpr int MAX_PARTICIPANTS = 50;
  static constexpr size_t QUEUE_CAPACITY = 1024;

  Room(const std::string &id, const std::string &name,
       const std::string &hostId);

  // Room info
  const std::string &getId() const { return id_; }
  const std::string &getName() const { return name_; }
  const std::string &getMeetingCode() const { return meetingCode_; }
  const std::string &getHostId() const { return hostId_; }
  bool isActive() const { return active_; }

  // Participant management
  bool addParticipant(std::shared_ptr<Participant> participant);
  bool removeParticipant(const std::string &participantId);
  std::shared_ptr<Participant> getParticipant(const std::string &participantId);
  std::vector<std::shared_ptr<Participant>> getParticipants();
  int getParticipantCount() const;
  bool isFull() const;

  // Check if user is host
  bool isHost(const std::string &participantId) const;

  // Room controls (host only)
  void setName(const std::string &name) { name_ = name; }
  void setActive(bool active) { active_ = active; }
  void transferHost(const std::string &newHostId);

  // Message processing (Lock-Free Entry Point)
  bool pushMessage(const SignalingMessage &msg);
  void processMessages();

  // Broadcast callback type
  using BroadcastCallback = std::function<void(const std::string &participantId,
                                               const std::string &message)>;
  void setBroadcastCallback(BroadcastCallback callback) {
    broadcastCallback_ = callback;
  }

  // Messaging (Outbound)
  void broadcast(const std::string &message, const std::string &excludeId = "");
  void broadcast(const SignalingMessage &msg, const std::string &excludeId = "");
  void sendTo(const std::string &participantId, const std::string &message);
  void sendTo(const std::string &participantId, const SignalingMessage &msg);

  // Serialized room info
  nlohmann::json toJson() const;
  nlohmann::json toJsonWithParticipants() const;

  // Room timing
  auto getCreatedTime() const { return createdTime_; }

private:
  void handleMessage(const SignalingMessage &msg);
  std::string generateMeetingCode();

  std::string id_;
  std::string name_;
  std::string meetingCode_;
  std::string hostId_;
  std::atomic<bool> active_{true};

  std::unordered_map<std::string, std::shared_ptr<Participant>> participants_;
  // Mutex still needed for public getters called by RoomManager/Web API, 
  // but message processing loop will be single-threaded per room.
  mutable std::mutex mutex_;

  // Lock-Free Input Queue
  SPSCQueue<SignalingMessage> inQueue_;

  BroadcastCallback broadcastCallback_;
  std::chrono::system_clock::time_point createdTime_;
};

} // namespace roaya
