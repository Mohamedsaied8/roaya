#pragma once

#include <chrono>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace zoom {

/**
 * Chat message structure
 */
struct ChatMessage {
  std::string id;
  std::string roomId;
  std::string senderId;
  std::string senderName;
  std::string content;
  int64_t timestamp;

  nlohmann::json toJson() const {
    return {{"id", id},
            {"roomId", roomId},
            {"senderId", senderId},
            {"senderName", senderName},
            {"content", content},
            {"timestamp", timestamp}};
  }
};

/**
 * Chat handler for managing in-room messages
 */
class ChatHandler {
public:
  static ChatHandler &getInstance();

  // Add message to room history
  void addMessage(const std::string &roomId, const std::string &senderId,
                  const std::string &senderName, const std::string &content);

  // Get room chat history
  std::vector<ChatMessage> getHistory(const std::string &roomId,
                                      int limit = 100);

  // Clear room history (when room is deleted)
  void clearHistory(const std::string &roomId);

private:
  ChatHandler() = default;

  std::string generateMessageId();

  // In-memory storage (replace with database for persistence)
  std::unordered_map<std::string, std::vector<ChatMessage>> roomMessages_;
  std::mutex mutex_;
};

} // namespace zoom
