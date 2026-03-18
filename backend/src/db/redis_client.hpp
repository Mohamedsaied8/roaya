#pragma once

#include <chrono>
#include <mutex>
#include <nlohmann/json.hpp>
#include <optional>
#include <string>
#include <unordered_map>

namespace zoom {

/**
 * Session data stored in Redis
 */
struct Session {
  std::string sessionId;
  std::string userId;
  std::string token;
  std::chrono::system_clock::time_point createdAt;
  std::chrono::system_clock::time_point expiresAt;
};

/**
 * Redis client wrapper for session and cache management
 * Current implementation: In-memory (ready for Redis integration)
 */
class RedisClient {
public:
  static RedisClient &getInstance() {
    static RedisClient instance;
    return instance;
  }

  // Connect to Redis server
  bool connect(const std::string &host = "localhost", int port = 6379);

  // Disconnect
  void disconnect();

  // Check connection
  bool isConnected() const { return connected_; }

  // Key-value operations
  bool set(const std::string &key, const std::string &value,
           int ttlSeconds = 0);
  std::optional<std::string> get(const std::string &key);
  bool del(const std::string &key);
  bool exists(const std::string &key);
  bool expire(const std::string &key, int seconds);

  // Session management
  bool storeSession(const Session &session);
  std::optional<Session> getSession(const std::string &sessionId);
  bool deleteSession(const std::string &sessionId);

  // Room state (for distributed deployment)
  bool setRoomState(const std::string &roomId, const std::string &stateJson);
  std::optional<std::string> getRoomState(const std::string &roomId);

  // Pub/Sub for multi-instance communication
  bool publish(const std::string &channel, const std::string &message);

private:
  RedisClient() = default;

  bool connected_ = false;

  // In-memory storage (replace with hiredis client)
  std::unordered_map<std::string, std::string> store_;
  std::mutex mutex_;
};

} // namespace zoom
