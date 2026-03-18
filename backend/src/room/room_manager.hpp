#pragma once

#include "room.hpp"
#include <memory>
#include <mutex>
#include <optional>
#include <unordered_map>

namespace roaya {

/**
 * Manages all active rooms in the system
 */
class RoomManager {
public:
  static RoomManager &getInstance();

  // Room lifecycle
  std::shared_ptr<Room> createRoom(const std::string &name,
                                   const std::string &hostId);
  bool deleteRoom(const std::string &roomId);

  // Room lookup
  std::shared_ptr<Room> getRoom(const std::string &roomId);
  std::shared_ptr<Room> getRoomByCode(const std::string &meetingCode);
  std::vector<std::shared_ptr<Room>> getAllRooms();

  // Participant management
  bool joinRoom(const std::string &roomId,
                std::shared_ptr<Participant> participant);
  bool leaveRoom(const std::string &roomId, const std::string &participantId);
  std::shared_ptr<Room> findRoomByParticipant(const std::string &participantId);

  // Stats
  int getActiveRoomCount() const;
  int getTotalParticipantCount() const;

  // Cleanup inactive rooms
  void cleanupInactiveRooms(int maxInactiveMinutes = 60);

private:
  RoomManager() = default;
  RoomManager(const RoomManager &) = delete;
  RoomManager &operator=(const RoomManager &) = delete;

  std::string generateRoomId();

  std::unordered_map<std::string, std::shared_ptr<Room>> rooms_;
  std::unordered_map<std::string, std::string> meetingCodeToRoomId_;
  std::unordered_map<std::string, std::string> participantToRoomId_;
  mutable std::mutex mutex_;
};

} // namespace roaya
