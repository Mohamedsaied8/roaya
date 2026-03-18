#pragma once

#include <string>
#include <map>
#include <memory>
#include <optional>

namespace zoom {

/**
 * Configuration manager for the application
 * Loads settings from YAML config file and environment variables
 */
class Config {
public:
    static Config& getInstance();
    
    // Load configuration from file
    bool loadFromFile(const std::string& filepath);
    
    // Server settings
    std::string getServerHost() const { return serverHost_; }
    uint16_t getServerPort() const { return serverPort_; }
    uint16_t getWebSocketPort() const { return wsPort_; }
    uint16_t getMediaPort() const { return mediaPort_; }
    
    // Database settings
    std::string getDbHost() const { return dbHost_; }
    uint16_t getDbPort() const { return dbPort_; }
    std::string getDbName() const { return dbName_; }
    std::string getDbUser() const { return dbUser_; }
    std::string getDbPassword() const { return dbPassword_; }
    
    // Redis settings
    std::string getRedisHost() const { return redisHost_; }
    uint16_t getRedisPort() const { return redisPort_; }
    
    // JWT settings
    std::string getJwtSecret() const { return jwtSecret_; }
    int getJwtExpiryHours() const { return jwtExpiryHours_; }
    
    // Media settings
    int getMaxParticipantsPerRoom() const { return maxParticipantsPerRoom_; }
    int getMaxRooms() const { return maxRooms_; }
    
    // SSL settings
    bool isSslEnabled() const { return sslEnabled_; }
    std::string getSslCertPath() const { return sslCertPath_; }
    std::string getSslKeyPath() const { return sslKeyPath_; }
    
private:
    Config() = default;
    Config(const Config&) = delete;
    Config& operator=(const Config&) = delete;
    
    // Server
    std::string serverHost_ = "0.0.0.0";
    uint16_t serverPort_ = 8080;
    uint16_t wsPort_ = 8081;
    uint16_t mediaPort_ = 10000;
    
    // Database
    std::string dbHost_ = "localhost";
    uint16_t dbPort_ = 5432;
    std::string dbName_ = "zoom_app";
    std::string dbUser_ = "postgres";
    std::string dbPassword_ = "";
    
    // Redis
    std::string redisHost_ = "localhost";
    uint16_t redisPort_ = 6379;
    
    // JWT
    std::string jwtSecret_ = "change-this-secret-in-production";
    int jwtExpiryHours_ = 24;
    
    // Media
    int maxParticipantsPerRoom_ = 50;
    int maxRooms_ = 100;
    
    // SSL
    bool sslEnabled_ = false;
    std::string sslCertPath_;
    std::string sslKeyPath_;
};

} // namespace zoom
