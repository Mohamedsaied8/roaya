#include "password_hasher.hpp"
#include "../core/logger.hpp"
#include <argon2.h>
#include <openssl/rand.h>
#include <sstream>
#include <vector>
#include <iomanip>

namespace roaya {

std::string PasswordHasher::generateSalt(size_t length) {
  std::vector<unsigned char> buffer(length);
  if (RAND_bytes(buffer.data(), static_cast<int>(length)) != 1) {
    throw std::runtime_error("Failed to generate random salt");
  }

  std::stringstream ss;
  for (unsigned char byte : buffer) {
    ss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(byte);
  }
  return ss.str();
}

std::string PasswordHasher::hash(const std::string &password) {
  std::string salt = generateSalt(SALT_LEN);
  
  std::vector<uint8_t> hashResult(HASH_LEN);
  char encoded[256];

  int result = argon2id_hash_encoded(
      T_COST, M_COST, PARALLELISM,
      password.c_str(), password.length(),
      salt.c_str(), salt.length(),
      HASH_LEN,
      encoded, sizeof(encoded)
  );

  if (result != ARGON2_OK) {
    LOG_ERROR("Argon2 hashing failed: {}", argon2_error_message(result));
    throw std::runtime_error("Argon2 hashing failed");
  }

  return std::string(encoded);
}

bool PasswordHasher::verify(const std::string &password, const std::string &hash) {
  int result = argon2id_verify(
      hash.c_str(),
      password.c_str(), password.length()
  );

  return result == ARGON2_OK;
}

} // namespace roaya
