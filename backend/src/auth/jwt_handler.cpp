#include "jwt_handler.hpp"
#include "../core/logger.hpp"
#include <chrono>
#include <jwt-cpp/jwt.h>

namespace zoom {

std::string JwtHandler::secret_ = "change-this-secret-in-production";

void JwtHandler::setSecret(const std::string &secret) { secret_ = secret; }

std::string JwtHandler::createToken(const std::string &userId,
                                    const std::string &email,
                                    const std::string &name, int expiryHours) {
  auto now = std::chrono::system_clock::now();
  auto expiry = now + std::chrono::hours(expiryHours);

  auto token = jwt::create()
                   .set_issuer("zoom-app")
                   .set_type("JWT")
                   .set_issued_at(now)
                   .set_expires_at(expiry)
                   .set_payload_claim("userId", jwt::claim(userId))
                   .set_payload_claim("email", jwt::claim(email))
                   .set_payload_claim("name", jwt::claim(name))
                   .sign(jwt::algorithm::hs256{secret_});

  LOG_DEBUG("Created JWT for user: {}", userId);
  return token;
}

std::optional<JwtHandler::TokenPayload>
JwtHandler::verifyToken(const std::string &token) {
  try {
    auto verifier = jwt::verify()
                        .allow_algorithm(jwt::algorithm::hs256{secret_})
                        .with_issuer("zoom-app");

    auto decoded = jwt::decode(token);
    verifier.verify(decoded);

    TokenPayload payload;
    payload.userId = decoded.get_payload_claim("userId").as_string();
    payload.email = decoded.get_payload_claim("email").as_string();
    payload.name = decoded.get_payload_claim("name").as_string();
    payload.issuedAt = std::chrono::duration_cast<std::chrono::seconds>(
                           decoded.get_issued_at().time_since_epoch())
                           .count();
    payload.expiresAt = std::chrono::duration_cast<std::chrono::seconds>(
                            decoded.get_expires_at().time_since_epoch())
                            .count();

    return payload;

  } catch (const jwt::error::token_verification_exception &e) {
    LOG_WARN("Token verification failed: {}", e.what());
    return std::nullopt;
  } catch (const std::exception &e) {
    LOG_ERROR("Token decode error: {}", e.what());
    return std::nullopt;
  }
}

std::optional<std::string> JwtHandler::refreshToken(const std::string &token) {
  auto payload = verifyToken(token);
  if (!payload) {
    return std::nullopt;
  }

  // Create a new token with extended expiry
  return createToken(payload->userId, payload->email, payload->name);
}

} // namespace zoom
