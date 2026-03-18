#pragma once

#include <chrono>
#include <memory>
#include <nlohmann/json.hpp>
#include <string>

namespace zoom {

/**
 * Represents a participant in a room
 */
class Participant {
public:
  enum class Role { HOST, CO_HOST, PARTICIPANT };

  Participant(const std::string &id, const std::string &name);

  // Getters
  const std::string &getId() const { return id_; }
  const std::string &getName() const { return name_; }
  const std::string &getUserId() const { return userId_; }
  Role getRole() const { return role_; }

  bool isAudioMuted() const { return audioMuted_; }
  bool isVideoMuted() const { return videoMuted_; }
  bool isScreenSharing() const { return screenSharing_; }
  bool isHandRaised() const { return handRaised_; }

  // Setters
  void setName(const std::string &name) { name_ = name; }
  void setUserId(const std::string &userId) { userId_ = userId; }
  void setRole(Role role) { role_ = role; }

  void setAudioMuted(bool muted) { audioMuted_ = muted; }
  void setVideoMuted(bool muted) { videoMuted_ = muted; }
  void setScreenSharing(bool sharing) { screenSharing_ = sharing; }
  void setHandRaised(bool raised) { handRaised_ = raised; }

  // Connection
  void setConnectionId(const std::string &connId) { connectionId_ = connId; }
  const std::string &getConnectionId() const { return connectionId_; }

  // Timestamp
  auto getJoinTime() const { return joinTime_; }

  // Serialize to JSON
  nlohmann::json toJson() const;

private:
  std::string id_;           // Unique participant ID (session-based)
  std::string userId_;       // User ID from database (for registered users)
  std::string name_;         // Display name
  std::string connectionId_; // WebSocket connection ID
  Role role_ = Role::PARTICIPANT;

  // Media state
  bool audioMuted_ = true;
  bool videoMuted_ = true;
  bool screenSharing_ = false;
  bool handRaised_ = false;

  std::chrono::system_clock::time_point joinTime_;
};

} // namespace zoom
