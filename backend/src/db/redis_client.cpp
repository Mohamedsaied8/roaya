#include "redis_client.hpp"
#include "../core/logger.hpp"

namespace roaya {

bool RedisClient::connect(const std::string &host, int port) {
  // In production, use hiredis:
  // context_ = redisConnect(host.c_str(), port);
  // if (context_ == nullptr || context_->err) { ... }

  LOG_INFO("Redis client connected (in-memory mode) to {}:{}", host, port);
  connected_ = true;
  return true;
}

void RedisClient::disconnect() {
  connected_ = false;
  LOG_INFO("Redis client disconnected");
}

bool RedisClient::set(const std::string &key, const std::string &value,
                      int ttlSeconds) {
  std::lock_guard<std::mutex> lock(mutex_);
  store_[key] = value;
  // TTL would be handled with a background cleanup thread in production
  return true;
}

std::optional<std::string> RedisClient::get(const std::string &key) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = store_.find(key);
  if (it != store_.end()) {
    return it->second;
  }
  return std::nullopt;
}

bool RedisClient::del(const std::string &key) {
  std::lock_guard<std::mutex> lock(mutex_);
  return store_.erase(key) > 0;
}

bool RedisClient::exists(const std::string &key) {
  std::lock_guard<std::mutex> lock(mutex_);
  return store_.find(key) != store_.end();
}

bool RedisClient::expire(const std::string &key, int seconds) {
  // In production, this would set TTL on the key
  return exists(key);
}

bool RedisClient::storeSession(const Session &session) {
  nlohmann::json j = {
      {"sessionId", session.sessionId},
      {"userId", session.userId},
      {"token", session.token},
      {"createdAt", std::chrono::system_clock::to_time_t(session.createdAt)},
      {"expiresAt", std::chrono::system_clock::to_time_t(session.expiresAt)}};

  return set("session:" + session.sessionId, j.dump(),
             std::chrono::duration_cast<std::chrono::seconds>(
                 session.expiresAt - std::chrono::system_clock::now())
                 .count());
}

std::optional<Session> RedisClient::getSession(const std::string &sessionId) {
  auto data = get("session:" + sessionId);
  if (!data) {
    return std::nullopt;
  }

  try {
    auto j = nlohmann::json::parse(*data);
    Session session;
    session.sessionId = j["sessionId"];
    session.userId = j["userId"];
    session.token = j["token"];
    session.createdAt = std::chrono::system_clock::from_time_t(j["createdAt"]);
    session.expiresAt = std::chrono::system_clock::from_time_t(j["expiresAt"]);
    return session;
  } catch (...) {
    return std::nullopt;
  }
}

bool RedisClient::deleteSession(const std::string &sessionId) {
  return del("session:" + sessionId);
}

bool RedisClient::setRoomState(const std::string &roomId,
                               const std::string &stateJson) {
  return set("room:" + roomId, stateJson);
}

std::optional<std::string>
RedisClient::getRoomState(const std::string &roomId) {
  return get("room:" + roomId);
}

bool RedisClient::publish(const std::string &channel,
                          const std::string &message) {
  // In production, use Redis PUBLISH command
  LOG_DEBUG("Redis PUBLISH {}: {}", channel, message);
  return true;
}

} // namespace roaya
