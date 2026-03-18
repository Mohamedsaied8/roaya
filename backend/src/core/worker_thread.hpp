#pragma once

#include "task_queue.hpp"
#include <atomic>
#include <thread>

namespace roaya {

/**
 * @brief A worker thread that processes tasks from a TaskQueue
 */
class WorkerThread {
public:
  WorkerThread(TaskQueue &queue);
  ~WorkerThread();

  // Delete copy/move
  WorkerThread(const WorkerThread &) = delete;
  WorkerThread &operator=(const WorkerThread &) = delete;

  /**
   * @brief Start the worker thread
   */
  void start();

  /**
   * @brief Stop the worker thread (waits for the current task to finish)
   */
  void stop();

  /**
   * @brief Join the thread
   */
  void join();

  /**
   * @brief Check if the worker is running
   */
  bool isRunning() const { return running_; }

private:
  void run();

  TaskQueue &queue_;
  std::thread thread_;
  std::atomic<bool> running_{false};
  std::atomic<bool> stop_requested_{false};
};

} // namespace roaya
