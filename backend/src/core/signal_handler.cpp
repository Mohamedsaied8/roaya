#include "signal_handler.hpp"
#include "logger.hpp"
#include <csignal>

namespace roaya {

SignalHandler &SignalHandler::getInstance() {
  static SignalHandler instance;
  return instance;
}

void SignalHandler::setup() {
  std::signal(SIGINT, SignalHandler::handleSignal);
  std::signal(SIGTERM, SignalHandler::handleSignal);
}

void SignalHandler::addHandler(HandlerFunc handler) {
  std::lock_guard<std::mutex> lock(mutex_);
  handlers_.push_back(std::move(handler));
}

void SignalHandler::handleSignal(int signal) {
  LOG_INFO("Received signal: {}", signal);

  auto &instance = getInstance();
  std::lock_guard<std::mutex> lock(instance.mutex_);
  for (const auto &handler : instance.handlers_) {
    try {
      handler(signal);
    } catch (const std::exception &e) {
      LOG_ERROR("Error in signal handler: {}", e.what());
    }
  }
}

} // namespace roaya
