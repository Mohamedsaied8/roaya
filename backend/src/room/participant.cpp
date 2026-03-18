#include "participant.hpp"
#include <nlohmann/json.hpp>

namespace roaya {

Participant::Participant(const std::string &id, const std::string &name)
    : id_(id), name_(name), joinTime_(std::chrono::system_clock::now()) {}

nlohmann::json Participant::toJson() const {
  std::string roleStr;
  switch (role_) {
  case Role::HOST:
    roleStr = "host";
    break;
  case Role::CO_HOST:
    roleStr = "co_host";
    break;
  case Role::PARTICIPANT:
    roleStr = "participant";
    break;
  }

  return {{"id", id_},
          {"userId", userId_},
          {"name", name_},
          {"role", roleStr},
          {"audioMuted", audioMuted_},
          {"videoMuted", videoMuted_},
          {"screenSharing", screenSharing_},
          {"handRaised", handRaised_},
          {"joinTime", std::chrono::duration_cast<std::chrono::milliseconds>(
                           joinTime_.time_since_epoch())
                           .count()}};
}

} // namespace roaya
