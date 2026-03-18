#include "room_manager.hpp"
#include "../core/logger.hpp"
#include <random>
#include <sstream>
#include <thread>
#include <vector>

namespace roaya {

RoomManager &RoomManager::getInstance() {
  static RoomManager instance;
  return instance;
}

void RoomManager::start() {
  if (running_.exchange(true)) {
    return;
  }
  LOG_INFO("Starting RoomManager loop");
  roomThread_ = std::thread(&RoomManager::runRoomLoop, this);
}

void RoomManager::stop() {
  if (!running_.exchange(false)) {
    return;
  }
  LOG_INFO("Stopping RoomManager loop");
  if (roomThread_.joinable()) {
    roomThread_.join();
  }
}

std::string RoomManager::generateRoomId() {
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_int_distribution<uint64_t> dis;

  std::stringstream ss;
  ss << std::hex << dis(gen);
  return ss.str();
}

std::shared_ptr<Room> RoomManager::createRoom(const std::string &name,
                                              const std::string &hostId) {
  std::lock_guard<std::mutex> lock(mutex_);

  std::string roomId = generateRoomId();
  auto room = std::make_shared<Room>(roomId, name, hostId);

  rooms_[roomId] = room;
  meetingCodeToRoomId_[room->getMeetingCode()] = roomId;

  LOG_INFO("Room created: {} ({}), code: {}", name, roomId,
           room->getMeetingCode());
  return room;
}

bool RoomManager::deleteRoom(const std::string &roomId) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = rooms_.find(roomId);
  if (it == rooms_.end()) {
    return false;
  }

  // Remove meeting code mapping
  meetingCodeToRoomId_.erase(it->second->getMeetingCode());

  // Remove all participant mappings
  for (const auto &participant : it->second->getParticipants()) {
    participantToRoomId_.erase(participant->getId());
  }

  rooms_.erase(it);
  LOG_INFO("Room deleted: {}", roomId);
  return true;
}

std::shared_ptr<Room> RoomManager::getRoom(const std::string &roomId) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = rooms_.find(roomId);
  return it != rooms_.end() ? it->second : nullptr;
}

std::shared_ptr<Room>
RoomManager::getRoomByCode(const std::string &meetingCode) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = meetingCodeToRoomId_.find(meetingCode);
  if (it == meetingCodeToRoomId_.end()) {
    return nullptr;
  }
  return rooms_[it->second];
}

std::vector<std::shared_ptr<Room>> RoomManager::getAllRooms() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<std::shared_ptr<Room>> result;
  result.reserve(rooms_.size());
  for (const auto &[id, room] : rooms_) {
    result.push_back(room);
  }
  return result;
}

bool RoomManager::joinRoom(const std::string &roomId,
                           std::shared_ptr<Participant> participant) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = rooms_.find(roomId);
  if (it == rooms_.end()) {
    LOG_WARN("Cannot join non-existent room: {}", roomId);
    return false;
  }

  if (it->second->addParticipant(participant)) {
    participantToRoomId_[participant->getId()] = roomId;
    return true;
  }
  return false;
}

bool RoomManager::leaveRoom(const std::string &roomId,
                            const std::string &participantId) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = rooms_.find(roomId);
  if (it == rooms_.end()) {
    return false;
  }

  if (it->second->removeParticipant(participantId)) {
    participantToRoomId_.erase(participantId);

    // Delete room if empty
    if (it->second->getParticipantCount() == 0) {
      meetingCodeToRoomId_.erase(it->second->getMeetingCode());
      rooms_.erase(it);
      LOG_INFO("Room {} deleted (empty)", roomId);
    }
    return true;
  }
  return false;
}

std::shared_ptr<Room>
RoomManager::findRoomByParticipant(const std::string &participantId) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = participantToRoomId_.find(participantId);
  if (it == participantToRoomId_.end()) {
    return nullptr;
  }
  return rooms_[it->second];
}

int RoomManager::getActiveRoomCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<int>(rooms_.size());
}

int RoomManager::getTotalParticipantCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  int count = 0;
  for (const auto &[id, room] : rooms_) {
    count += room->getParticipantCount();
  }
  return count;
}

void RoomManager::cleanupInactiveRooms(int maxInactiveMinutes) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto now = std::chrono::system_clock::now();
  std::vector<std::string> toDelete;

  for (const auto &[id, room] : rooms_) {
    if (room->getParticipantCount() == 0) {
      auto age = std::chrono::duration_cast<std::chrono::minutes>(
                     now - room->getCreatedTime())
                     .count();
      if (age > maxInactiveMinutes) {
        toDelete.push_back(id);
      }
    }
  }

  for (const auto &id : toDelete) {
    auto it = rooms_.find(id);
    if (it != rooms_.end()) {
      meetingCodeToRoomId_.erase(it->second->getMeetingCode());
      rooms_.erase(it);
      LOG_INFO("Cleaned up inactive room: {}", id);
    }
  }
}

void RoomManager::runRoomLoop() {
  while (running_) {
    // Snapshot rooms to minimize lock duration
    std::vector<std::shared_ptr<Room>> roomSnapshot;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      roomSnapshot.reserve(rooms_.size());
      for (auto const &[id, room] : rooms_) {
        roomSnapshot.push_back(room);
      }
    }

    // Process messages for each room (Single-threaded per room logic)
    for (auto const &room : roomSnapshot) {
      room->processMessages();
    }

    // Yield to avoid 100% CPU usage on idle
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  LOG_INFO("RoomManager loop exited");
}

} // namespace roaya
