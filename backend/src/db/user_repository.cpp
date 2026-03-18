#include "user_repository.hpp"

namespace roaya {

std::optional<User> UserRepository::create(const User &user) {
  std::lock_guard<std::mutex> lock(mutex_);

  // Check if email already exists
  for (const auto &[id, existingUser] : users_) {
    if (existingUser.email == user.email) {
      return std::nullopt;
    }
  }

  users_[user.id] = user;
  return user;
}

std::optional<User> UserRepository::findById(const std::string &id) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = users_.find(id);
  if (it != users_.end()) {
    return it->second;
  }
  return std::nullopt;
}

std::optional<User> UserRepository::findByEmail(const std::string &email) {
  std::lock_guard<std::mutex> lock(mutex_);

  for (const auto &[id, user] : users_) {
    if (user.email == email) {
      return user;
    }
  }
  return std::nullopt;
}

bool UserRepository::update(const User &user) {
  std::lock_guard<std::mutex> lock(mutex_);

  auto it = users_.find(user.id);
  if (it == users_.end()) {
    return false;
  }

  it->second = user;
  return true;
}

bool UserRepository::remove(const std::string &id) {
  std::lock_guard<std::mutex> lock(mutex_);
  return users_.erase(id) > 0;
}

std::vector<User> UserRepository::findAll(int limit, int offset) {
  std::lock_guard<std::mutex> lock(mutex_);

  std::vector<User> result;
  int current = 0;

  for (const auto &[id, user] : users_) {
    if (current >= offset && static_cast<int>(result.size()) < limit) {
      result.push_back(user);
    }
    current++;
  }

  return result;
}

size_t UserRepository::count() {
  std::lock_guard<std::mutex> lock(mutex_);
  return users_.size();
}

} // namespace roaya
