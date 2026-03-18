#include "config.hpp"
#include <cstdlib>
#include <fstream>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>
#include <sstream>

namespace roaya {

Config &Config::getInstance() {
  static Config instance;
  return instance;
}

bool Config::loadFromFile(const std::string &filepath) {
  try {
    std::ifstream file(filepath);
    if (!file.is_open()) {
      spdlog::warn("Config file not found: {}, using defaults", filepath);
      return false;
    }

    nlohmann::json config;
    file >> config;

    // Server settings
    if (config.contains("server")) {
      auto &server = config["server"];
      serverHost_ = server.value("host", serverHost_);
      serverPort_ = server.value("port", serverPort_);
      wsPort_ = server.value("websocket_port", wsPort_);
      mediaPort_ = server.value("media_port", mediaPort_);
    }

    // Database settings
    if (config.contains("database")) {
      auto &db = config["database"];
      dbHost_ = db.value("host", dbHost_);
      dbPort_ = db.value("port", dbPort_);
      dbName_ = db.value("name", dbName_);
      dbUser_ = db.value("user", dbUser_);
      dbPassword_ = db.value("password", dbPassword_);
    }

    // Redis settings
    if (config.contains("redis")) {
      auto &redis = config["redis"];
      redisHost_ = redis.value("host", redisHost_);
      redisPort_ = redis.value("port", redisPort_);
    }

    // JWT settings
    if (config.contains("jwt")) {
      auto &jwt = config["jwt"];
      jwtSecret_ = jwt.value("secret", jwtSecret_);
      jwtExpiryHours_ = jwt.value("expiry_hours", jwtExpiryHours_);
    }

    // Media settings
    if (config.contains("media")) {
      auto &media = config["media"];
      maxParticipantsPerRoom_ =
          media.value("max_participants_per_room", maxParticipantsPerRoom_);
      maxRooms_ = media.value("max_rooms", maxRooms_);
    }

    // SSL settings
    if (config.contains("ssl")) {
      auto &ssl = config["ssl"];
      sslEnabled_ = ssl.value("enabled", sslEnabled_);
      sslCertPath_ = ssl.value("cert_path", sslCertPath_);
      sslKeyPath_ = ssl.value("key_path", sslKeyPath_);
    }

    // Override with environment variables if set
    if (const char *env = std::getenv("ZOOM_SERVER_PORT")) {
      serverPort_ = static_cast<uint16_t>(std::stoi(env));
    }
    if (const char *env = std::getenv("ZOOM_DB_HOST")) {
      dbHost_ = env;
    }
    if (const char *env = std::getenv("ZOOM_DB_PASSWORD")) {
      dbPassword_ = env;
    }
    if (const char *env = std::getenv("ZOOM_JWT_SECRET")) {
      jwtSecret_ = env;
    }
    if (const char *env = std::getenv("ZOOM_REDIS_HOST")) {
      redisHost_ = env;
    }

    spdlog::info("Configuration loaded successfully from {}", filepath);
    return true;

  } catch (const std::exception &e) {
    spdlog::error("Failed to load config: {}", e.what());
    return false;
  }
}

} // namespace roaya
