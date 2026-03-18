#pragma once

#include <memory>
#include <spdlog/sinks/rotating_file_sink.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>
#include <string>

namespace roaya {

/**
 * Logger wrapper using spdlog for high-performance logging
 */
class Logger {
public:
  static void init(const std::string &logLevel = "info",
                   const std::string &logFile = "logs/roaya.log");

  static std::shared_ptr<spdlog::logger> get() {
    return spdlog::get("roaya");
  }

  // Convenience macros
  template <typename... Args>
  static void trace(fmt::format_string<Args...> fmt, Args &&...args) {
    get()->trace(fmt, std::forward<Args>(args)...);
  }

  template <typename... Args>
  static void debug(fmt::format_string<Args...> fmt, Args &&...args) {
    get()->debug(fmt, std::forward<Args>(args)...);
  }

  template <typename... Args>
  static void info(fmt::format_string<Args...> fmt, Args &&...args) {
    get()->info(fmt, std::forward<Args>(args)...);
  }

  template <typename... Args>
  static void warn(fmt::format_string<Args...> fmt, Args &&...args) {
    get()->warn(fmt, std::forward<Args>(args)...);
  }

  template <typename... Args>
  static void error(fmt::format_string<Args...> fmt, Args &&...args) {
    get()->error(fmt, std::forward<Args>(args)...);
  }

  template <typename... Args>
  static void critical(fmt::format_string<Args...> fmt, Args &&...args) {
    get()->critical(fmt, std::forward<Args>(args)...);
  }
};

} // namespace roaya

// Convenience macros
#define LOG_TRACE(...) roaya::Logger::trace(__VA_ARGS__)
#define LOG_DEBUG(...) roaya::Logger::debug(__VA_ARGS__)
#define LOG_INFO(...) roaya::Logger::info(__VA_ARGS__)
#define LOG_WARN(...) roaya::Logger::warn(__VA_ARGS__)
#define LOG_ERROR(...) roaya::Logger::error(__VA_ARGS__)
#define LOG_CRITICAL(...) roaya::Logger::critical(__VA_ARGS__)
