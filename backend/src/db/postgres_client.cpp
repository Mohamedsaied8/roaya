#include "postgres_client.hpp"
#include "../core/logger.hpp"

namespace roaya {

PostgresClient &PostgresClient::getInstance() {
  static PostgresClient instance;
  return instance;
}

bool PostgresClient::initialize(const Config &config) {
  try {
    connectionString_ = "host=" + config.host + " port=" + std::to_string(config.port) +
                      " dbname=" + config.dbname + " user=" + config.user;
    if (!config.password.empty()) {
      connectionString_ += " password=" + config.password;
    }

    conn_ = std::make_unique<pqxx::connection>(connectionString_);
    if (conn_->is_open()) {
      LOG_INFO("Connected to PostgreSQL: {}:{}/{}", config.host, config.port, config.dbname);
      return true;
    } else {
      LOG_ERROR("Failed to open PostgreSQL connection");
      return false;
    }
  } catch (const std::exception &e) {
    LOG_ERROR("PostgreSQL error: {}", e.what());
    return false;
  }
}

void PostgresClient::execute(const std::string &sql) {
  try {
    pqxx::work W(*conn_);
    W.exec(sql);
    W.commit();
  } catch (const std::exception &e) {
    LOG_ERROR("PostgreSQL execution error: {}", e.what());
    throw;
  }
}

pqxx::result PostgresClient::executeQuery(const std::string &sql,
                                          const std::vector<std::string> &params) {
  try {
    pqxx::work W(*conn_);
    if (params.empty()) {
      return W.exec(sql);
    } else {
      pqxx::params p;
      for (const auto &param : params) {
        p.append(param);
      }
      return W.exec_params(sql, p);
    }
  } catch (const std::exception &e) {
    LOG_ERROR("PostgreSQL query error: {}", e.what());
    throw;
  }
}

std::unique_ptr<pqxx::work> PostgresClient::getTransaction() {
  return std::make_unique<pqxx::work>(*conn_);
}

} // namespace roaya
