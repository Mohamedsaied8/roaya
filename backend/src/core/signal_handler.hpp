#pragma once

#include <functional>
#include <mutex>
#include <vector>

namespace roaya {

/**
 * @brief Singleton for handling system signals (SIGINT, SIGTERM)
 */
class SignalHandler {
public:
  using HandlerFunc = std::function<void(int)>;

  static SignalHandler &getInstance();

  /**
   * @brief Setup the signal handlers
   */
  void setup();

  /**
   * @brief Add a callback to be executed when a signal is received
   */
  void addHandler(HandlerFunc handler);

private:
  SignalHandler() = default;
  ~SignalHandler() = default;

  static void handleSignal(int signal);

  std::mutex mutex_;
  std::vector<HandlerFunc> handlers_;
};

} // namespace roaya
