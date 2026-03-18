#pragma once

#include <cstdint>
#include <string>

namespace roaya {

/**
 * Password hasher using Argon2 or bcrypt-style hashing
 * For simplicity, using SHA-256 with salt (in production, use Argon2)
 */
class PasswordHasher {
public:
  // Hash a password with a random salt
  static std::string hash(const std::string &password);

  // Verify a password against a hash
  static bool verify(const std::string &password, const std::string &hash);

private:
  static std::string generateSalt(size_t length = 16);
  static std::string sha256(const std::string &input);
};

} // namespace roaya
