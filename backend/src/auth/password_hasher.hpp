#pragma once

#include <cstdint>
#include <string>

namespace roaya {

/**
 * @brief High-security password hasher using Argon2id
 */
class PasswordHasher {
public:
  /**
   * @brief Hash a password with random salt using Argon2id
   */
  static std::string hash(const std::string &password);

  /**
   * @brief Verify a password against an Argon2id hash
   */
  static bool verify(const std::string &password, const std::string &hash);

private:
  static constexpr uint32_t T_COST = 2;       // Iterations
  static constexpr uint32_t M_COST = 65536;   // Memory (64MB)
  static constexpr uint32_t PARALLELISM = 1;  // Threads
  static constexpr uint32_t SALT_LEN = 16;
  static constexpr uint32_t HASH_LEN = 32;

  static std::string generateSalt(size_t length = SALT_LEN);
};

} // namespace roaya
