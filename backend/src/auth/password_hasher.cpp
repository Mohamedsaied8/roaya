#include "password_hasher.hpp"
#include <iomanip>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <sstream>
#include <vector>

namespace roaya {

std::string PasswordHasher::generateSalt(size_t length) {
  std::vector<unsigned char> buffer(length);
  RAND_bytes(buffer.data(), static_cast<int>(length));

  std::stringstream ss;
  for (unsigned char byte : buffer) {
    ss << std::hex << std::setw(2) << std::setfill('0')
       << static_cast<int>(byte);
  }
  return ss.str();
}

std::string PasswordHasher::sha256(const std::string &input) {
  EVP_MD_CTX *context = EVP_MD_CTX_new();
  const EVP_MD *md = EVP_sha256();
  unsigned char hash[EVP_MAX_MD_SIZE];
  unsigned int lengthOfHash = 0;

  EVP_DigestInit_ex(context, md, nullptr);
  EVP_DigestUpdate(context, input.c_str(), input.length());
  EVP_DigestFinal_ex(context, hash, &lengthOfHash);
  EVP_MD_CTX_free(context);

  std::stringstream ss;
  for (unsigned int i = 0; i < lengthOfHash; ++i) {
    ss << std::hex << std::setw(2) << std::setfill('0')
       << static_cast<int>(hash[i]);
  }
  return ss.str();
}

std::string PasswordHasher::hash(const std::string &password) {
  std::string salt = generateSalt(16);
  std::string combined = salt + password;
  std::string hashedPassword = sha256(combined);

  // Format: salt$hash
  return salt + "$" + hashedPassword;
}

bool PasswordHasher::verify(const std::string &password,
                            const std::string &storedHash) {
  // Extract salt from stored hash
  size_t delimPos = storedHash.find('$');
  if (delimPos == std::string::npos) {
    return false;
  }

  std::string salt = storedHash.substr(0, delimPos);
  std::string expectedHash = storedHash.substr(delimPos + 1);

  // Hash the provided password with the same salt
  std::string combined = salt + password;
  std::string computedHash = sha256(combined);

  // Constant-time comparison to prevent timing attacks
  if (computedHash.length() != expectedHash.length()) {
    return false;
  }

  bool result = true;
  for (size_t i = 0; i < computedHash.length(); ++i) {
    result &= (computedHash[i] == expectedHash[i]);
  }
  return result;
}

} // namespace roaya
