#pragma once

#include <memory>
#include <pqxx/pqxx>
#include <string>
#include <vector>

namespace roaya {

/**
 * @brief Thread-safe client for PostgreSQL connectivity using libpqxx
 */
class PostgresClient {
public:
  struct Config {
    std::string host = "localhost";
    int port = 5432;
    std::string dbname = "roaya";
    std::string user = "postgres";
    std::string password = "";
  };

  static PostgresClient &getInstance();

  /**
   * @brief Initialize with the given configuration
   */
  bool initialize(const Config &config);

  /**
   * @brief Execute a non-query SQL command
   */
  void execute(const std::string &sql);

  /**
   * @brief Execute a parameterized query
   */
  pqxx::result executeQuery(const std::string &sql,
                             const std::vector<std::string> &params = {});

  /**
   * @brief Start a transaction
   */
  std::unique_ptr<pqxx::work> getTransaction();

private:
  PostgresClient() = default;
  ~PostgresClient() = default;

  std::unique_ptr<pqxx::connection> conn_;
  std::string connectionString_;
};

} // namespace roaya
