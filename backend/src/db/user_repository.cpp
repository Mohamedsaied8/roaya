#include "user_repository.hpp"
#include "postgres_client.hpp"
#include "../auth/auth_service.hpp"
#include "../core/logger.hpp"

namespace roaya {

UserRepository &UserRepository::getInstance() {
  static UserRepository instance;
  return instance;
}

std::optional<User> UserRepository::create(const User &user) {
  try {
    auto &db = PostgresClient::getInstance();
    db.executeQuery(
        "INSERT INTO users (id, email, password_hash, name, avatar_url, created_at, last_login) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7)",
        {user.id, user.email, user.passwordHash, user.name, user.avatarUrl,
         std::to_string(user.createdAt), std::to_string(user.lastLogin)});
    return user;
  } catch (const std::exception &e) {
    LOG_ERROR("Failed to create user: {}", e.what());
    return std::nullopt;
  }
}

std::optional<User> UserRepository::findById(const std::string &id) {
  try {
    auto &db = PostgresClient::getInstance();
    auto result = db.executeQuery("SELECT * FROM users WHERE id = $1", {id});

    if (result.empty()) {
      return std::nullopt;
    }

    auto row = result[0];
    User user;
    user.id = row["id"].as<std::string>();
    user.email = row["email"].as<std::string>();
    user.passwordHash = row["password_hash"].as<std::string>();
    user.name = row["name"].as<std::string>();
    user.avatarUrl = row["avatar_url"].as<std::string>();
    user.createdAt = row["created_at"].as<int64_t>();
    user.lastLogin = row["last_login"].as<int64_t>();
    return user;
  } catch (const std::exception &e) {
    LOG_ERROR("Failed to find user by ID: {}", e.what());
    return std::nullopt;
  }
}

std::optional<User> UserRepository::findByEmail(const std::string &email) {
  try {
    auto &db = PostgresClient::getInstance();
    auto result = db.executeQuery("SELECT * FROM users WHERE email = $1", {email});

    if (result.empty()) {
      return std::nullopt;
    }

    auto row = result[0];
    User user;
    user.id = row["id"].as<std::string>();
    user.email = row["email"].as<std::string>();
    user.passwordHash = row["password_hash"].as<std::string>();
    user.name = row["name"].as<std::string>();
    user.avatarUrl = row["avatar_url"].as<std::string>();
    user.createdAt = row["created_at"].as<int64_t>();
    user.lastLogin = row["last_login"].as<int64_t>();
    return user;
  } catch (const std::exception &e) {
    LOG_ERROR("Failed to find user by email: {}", e.what());
    return std::nullopt;
  }
}

bool UserRepository::update(const User &user) {
  try {
    auto &db = PostgresClient::getInstance();
    db.executeQuery(
        "UPDATE users SET email=$2, password_hash=$3, name=$4, avatar_url=$5, "
        "created_at=$6, last_login=$7 WHERE id=$1",
        {user.id, user.email, user.passwordHash, user.name, user.avatarUrl,
         std::to_string(user.createdAt), std::to_string(user.lastLogin)});
    return true;
  } catch (const std::exception &e) {
    LOG_ERROR("Failed to update user: {}", e.what());
    return false;
  }
}

bool UserRepository::remove(const std::string &id) {
  try {
    auto &db = PostgresClient::getInstance();
    db.executeQuery("DELETE FROM users WHERE id = $1", {id});
    return true;
  } catch (const std::exception &e) {
    LOG_ERROR("Failed to delete user: {}", e.what());
    return false;
  }
}

std::vector<User> UserRepository::findAll(int limit, int offset) {
  std::vector<User> users;
  try {
    auto &db = PostgresClient::getInstance();
    auto result = db.executeQuery(
        "SELECT * FROM users LIMIT $1 OFFSET $2",
        {std::to_string(limit), std::to_string(offset)});

    for (const auto &row : result) {
      User user;
      user.id = row["id"].as<std::string>();
      user.email = row["email"].as<std::string>();
      user.passwordHash = row["password_hash"].as<std::string>();
      user.name = row["name"].as<std::string>();
      user.avatarUrl = row["avatar_url"].as<std::string>();
      user.createdAt = row["created_at"].as<int64_t>();
      user.lastLogin = row["last_login"].as<int64_t>();
      users.push_back(user);
    }
  } catch (const std::exception &e) {
    LOG_ERROR("Failed to find all users: {}", e.what());
  }
  return users;
}

size_t UserRepository::count() {
  try {
    auto &db = PostgresClient::getInstance();
    auto result = db.executeQuery("SELECT COUNT(*) FROM users");
    return result[0][0].as<size_t>();
  } catch (const std::exception &e) {
    LOG_ERROR("Failed to count users: {}", e.what());
    return 0;
  }
}

} // namespace roaya
