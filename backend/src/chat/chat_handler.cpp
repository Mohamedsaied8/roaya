#include "chat_handler.hpp"
#include <random>
#include <sstream>

namespace zoom {

ChatHandler &ChatHandler::getInstance() {
  static ChatHandler instance;
  return instance;
}

std::string ChatHandler::generateMessageId() {
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_int_distribution<uint64_t> dis;

  std::stringstream ss;
  ss << "msg_" << std::hex << dis(gen);
  return ss.str();
}

void ChatHandler::addMessage(const std::string &roomId,
                             const std::string &senderId,
                             const std::string &senderName,
                             const std::string &content) {
  std::lock_guard<std::mutex> lock(mutex_);

  ChatMessage msg;
  msg.id = generateMessageId();
  msg.roomId = roomId;
  msg.senderId = senderId;
  msg.senderName = senderName;
  msg.content = content;
  msg.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                      std::chrono::system_clock::now().time_since_epoch())
                      .count();

  roomMessages_[roomId].push_back(msg);

  // Limit history to last 1000 messages per room
  if (roomMessages_[roomId].size() > 1000) {
    roomMessages_[roomId].erase(roomMessages_[roomId].begin());
  }
}

std::vector<ChatMessage> ChatHandler::getHistory(const std::string &roomId,
                                                 int limit) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = roomMessages_.find(roomId);
  if (it == roomMessages_.end()) {
    return {};
  }

  const auto &messages = it->second;
  if (static_cast<int>(messages.size()) <= limit) {
    return messages;
  }

  // Return last 'limit' messages
  return std::vector<ChatMessage>(messages.end() - limit, messages.end());
}

void ChatHandler::clearHistory(const std::string &roomId) {
  std::lock_guard<std::mutex> lock(mutex_);
  roomMessages_.erase(roomId);
}

} // namespace zoom
