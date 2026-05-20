#include "redis_client.hpp"
#include "../core/logger.hpp"

#include <hiredis/hiredis.h>

#include <cstring>

namespace roaya {

namespace {

// RAII wrapper around redisReply* — frees the reply when it goes out of scope.
struct ReplyGuard {
  redisReply *r = nullptr;
  explicit ReplyGuard(void *raw) : r(static_cast<redisReply *>(raw)) {}
  ~ReplyGuard() {
    if (r) freeReplyObject(r);
  }
  redisReply *operator->() const { return r; }
  explicit operator bool() const { return r != nullptr; }
};

} // namespace

RedisClient::~RedisClient() {
  disconnect();
}

bool RedisClient::connect(const std::string &host, int port) {
  std::lock_guard<std::mutex> lock(mutex_);

  if (context_) {
    redisFree(context_);
    context_ = nullptr;
  }

  // 500ms connection timeout — fail fast if Redis is down so the backend can
  // either start in fallback mode (tests) or surface a clear error (prod).
  struct timeval timeout = {0, 500 * 1000};
  context_ = redisConnectWithTimeout(host.c_str(), port, timeout);
  if (context_ == nullptr || context_->err) {
    const char *reason = context_ ? context_->errstr : "allocation failed";
    LOG_WARN("Redis connect to {}:{} failed ({}); using in-memory fallback",
             host, port, reason);
    if (context_) {
      redisFree(context_);
      context_ = nullptr;
    }
    fallbackMode_ = true;
    connected_ = true; // Fallback still satisfies isConnected() for callers.
    return false;
  }

  fallbackMode_ = false;
  connected_ = true;
  LOG_INFO("Redis client connected to {}:{}", host, port);
  return true;
}

void RedisClient::disconnect() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (context_) {
    redisFree(context_);
    context_ = nullptr;
  }
  connected_ = false;
  fallbackMode_ = false;
  fallbackStore_.clear();
}

bool RedisClient::set(const std::string &key, const std::string &value,
                      int ttlSeconds) {
  std::lock_guard<std::mutex> lock(mutex_);

  if (fallbackMode_ || !context_) {
    fallbackStore_[key] = value;
    return true;
  }

  // Use binary-safe %b formatters so values containing NULs / JSON survive intact.
  ReplyGuard reply(
      ttlSeconds > 0
          ? redisCommand(context_, "SET %b %b EX %d", key.data(), key.size(),
                         value.data(), value.size(), ttlSeconds)
          : redisCommand(context_, "SET %b %b", key.data(), key.size(),
                         value.data(), value.size()));

  if (!reply) {
    LOG_ERROR("Redis SET failed: {}", context_->errstr);
    return false;
  }
  return reply->type == REDIS_REPLY_STATUS &&
         std::strcmp(reply->str, "OK") == 0;
}

std::optional<std::string> RedisClient::get(const std::string &key) {
  std::lock_guard<std::mutex> lock(mutex_);

  if (fallbackMode_ || !context_) {
    auto it = fallbackStore_.find(key);
    if (it != fallbackStore_.end()) return it->second;
    return std::nullopt;
  }

  ReplyGuard reply(redisCommand(context_, "GET %b", key.data(), key.size()));
  if (!reply) {
    LOG_ERROR("Redis GET failed: {}", context_->errstr);
    return std::nullopt;
  }
  if (reply->type == REDIS_REPLY_NIL) return std::nullopt;
  if (reply->type != REDIS_REPLY_STRING) return std::nullopt;
  return std::string(reply->str, reply->len);
}

bool RedisClient::del(const std::string &key) {
  std::lock_guard<std::mutex> lock(mutex_);

  if (fallbackMode_ || !context_) {
    return fallbackStore_.erase(key) > 0;
  }

  ReplyGuard reply(redisCommand(context_, "DEL %b", key.data(), key.size()));
  if (!reply) return false;
  return reply->type == REDIS_REPLY_INTEGER && reply->integer > 0;
}

bool RedisClient::exists(const std::string &key) {
  std::lock_guard<std::mutex> lock(mutex_);

  if (fallbackMode_ || !context_) {
    return fallbackStore_.find(key) != fallbackStore_.end();
  }

  ReplyGuard reply(redisCommand(context_, "EXISTS %b", key.data(), key.size()));
  if (!reply) return false;
  return reply->type == REDIS_REPLY_INTEGER && reply->integer > 0;
}

bool RedisClient::expire(const std::string &key, int seconds) {
  std::lock_guard<std::mutex> lock(mutex_);

  if (fallbackMode_ || !context_) {
    // Fallback ignores TTL — we just confirm the key exists.
    return fallbackStore_.find(key) != fallbackStore_.end();
  }

  ReplyGuard reply(redisCommand(context_, "EXPIRE %b %d", key.data(),
                                key.size(), seconds));
  if (!reply) return false;
  return reply->type == REDIS_REPLY_INTEGER && reply->integer == 1;
}

bool RedisClient::storeSession(const Session &session) {
  nlohmann::json j = {
      {"sessionId", session.sessionId},
      {"userId", session.userId},
      {"token", session.token},
      {"createdAt", std::chrono::system_clock::to_time_t(session.createdAt)},
      {"expiresAt", std::chrono::system_clock::to_time_t(session.expiresAt)}};

  auto ttl = std::chrono::duration_cast<std::chrono::seconds>(
                 session.expiresAt - std::chrono::system_clock::now())
                 .count();
  if (ttl <= 0) ttl = 0; // Never-expires for already-stale sessions; caller decides.

  return set("session:" + session.sessionId, j.dump(), static_cast<int>(ttl));
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
  std::lock_guard<std::mutex> lock(mutex_);

  if (fallbackMode_ || !context_) {
    // No subscribers in fallback mode — log and treat as no-op success so the
    // signaling layer doesn't have to special-case test environments.
    LOG_DEBUG("Redis PUBLISH (fallback) {}: {}", channel, message);
    return true;
  }

  ReplyGuard reply(redisCommand(context_, "PUBLISH %b %b", channel.data(),
                                channel.size(), message.data(),
                                message.size()));
  if (!reply) {
    LOG_ERROR("Redis PUBLISH failed: {}", context_->errstr);
    return false;
  }
  return reply->type == REDIS_REPLY_INTEGER;
}

} // namespace roaya
