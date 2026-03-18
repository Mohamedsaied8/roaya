#pragma once

#include <nlohmann/json.hpp>
#include <optional>
#include <string>

namespace zoom {

/**
 * JWT token handler for authentication
 */
class JwtHandler {
public:
  struct TokenPayload {
    std::string userId;
    std::string email;
    std::string name;
    int64_t expiresAt;
    int64_t issuedAt;
  };

  // Create a JWT token
  static std::string createToken(const std::string &userId,
                                 const std::string &email,
                                 const std::string &name, int expiryHours = 24);

  // Verify and decode a JWT token
  static std::optional<TokenPayload> verifyToken(const std::string &token);

  // Refresh a token (returns new token if valid)
  static std::optional<std::string> refreshToken(const std::string &token);

  // Set the secret key (loaded from config)
  static void setSecret(const std::string &secret);

private:
  static std::string secret_;
};

} // namespace zoom
