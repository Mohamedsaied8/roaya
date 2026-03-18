#include "logger.hpp"
#include <filesystem>
#include <iostream>


namespace zoom {

void Logger::init(const std::string &logLevel, const std::string &logFile) {
  try {
    // Create logs directory if needed
    std::filesystem::path logPath(logFile);
    if (logPath.has_parent_path()) {
      std::filesystem::create_directories(logPath.parent_path());
    }

    // Create sinks
    auto consoleSink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
    consoleSink->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] [%t] %v");

    auto fileSink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
        logFile, 10 * 1024 * 1024, 5); // 10MB, 5 files
    fileSink->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%l] [%t] %v");

    // Create multi-sink logger
    std::vector<spdlog::sink_ptr> sinks{consoleSink, fileSink};
    auto logger = std::make_shared<spdlog::logger>("zoom_app", sinks.begin(),
                                                   sinks.end());

    // Set log level
    if (logLevel == "trace")
      logger->set_level(spdlog::level::trace);
    else if (logLevel == "debug")
      logger->set_level(spdlog::level::debug);
    else if (logLevel == "info")
      logger->set_level(spdlog::level::info);
    else if (logLevel == "warn")
      logger->set_level(spdlog::level::warn);
    else if (logLevel == "error")
      logger->set_level(spdlog::level::err);
    else if (logLevel == "critical")
      logger->set_level(spdlog::level::critical);
    else
      logger->set_level(spdlog::level::info);

    // Flush on warn and above
    logger->flush_on(spdlog::level::warn);

    // Register as default logger
    spdlog::register_logger(logger);
    spdlog::set_default_logger(logger);

    logger->info("Logger initialized - level: {}", logLevel);

  } catch (const spdlog::spdlog_ex &ex) {
    std::cerr << "Logger initialization failed: " << ex.what() << std::endl;
  }
}

} // namespace zoom
