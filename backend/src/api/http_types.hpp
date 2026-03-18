#pragma once

#include <functional>
#include <nlohmann/json.hpp>
#include <string>

namespace zoom {

/**
 * HTTP Request structure
 */
struct HttpRequest {
  std::string method;
  std::string path;
  std::string body;
  std::unordered_map<std::string, std::string> headers;
  std::unordered_map<std::string, std::string> params;
  std::unordered_map<std::string, std::string> query;

  // Get Authorization header token
  std::string getAuthToken() const {
    auto it = headers.find("Authorization");
    if (it != headers.end() && it->second.substr(0, 7) == "Bearer ") {
      return it->second.substr(7);
    }
    return "";
  }

  // Parse JSON body
  nlohmann::json json() const {
    try {
      return nlohmann::json::parse(body);
    } catch (...) {
      return nlohmann::json::object();
    }
  }
};

/**
 * HTTP Response structure
 */
struct HttpResponse {
  int statusCode = 200;
  std::string body;
  std::unordered_map<std::string, std::string> headers;

  // Set JSON response
  void json(const nlohmann::json &data, int status = 200) {
    statusCode = status;
    body = data.dump();
    headers["Content-Type"] = "application/json";
  }

  // Set error response
  void error(const std::string &message, int status = 400) {
    json({{"success", false}, {"message", message}}, status);
  }

  // Set success response
  void success(const nlohmann::json &data = nullptr) {
    if (data.is_null()) {
      json({{"success", true}});
    } else {
      nlohmann::json response = data;
      response["success"] = true;
      json(response);
    }
  }
};

} // namespace zoom
