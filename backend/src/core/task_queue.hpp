#pragma once

#include <condition_variable>
#include <functional>
#include <mutex>
#include <queue>

namespace roaya {

/**
 * @brief A thread-safe queue for storing tasks (std::function<void()>)
 */
class TaskQueue {
public:
  TaskQueue() = default;
  ~TaskQueue() = default;

  // Delete copy/move
  TaskQueue(const TaskQueue &) = delete;
  TaskQueue &operator=(const TaskQueue &) = delete;

  /**
   * @brief Push a new task into the queue
   */
  void push(std::function<void()> task) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      tasks_.push(std::move(task));
    }
    condition_.notify_one();
  }

  /**
   * @brief Pop a task from the queue. Blocks if the queue is empty.
   * @return The task to be executed
   */
  std::function<void()> pop() {
    std::unique_lock<std::mutex> lock(mutex_);
    condition_.wait(lock, [this] { return !tasks_.empty() || stop_; });

    if (stop_ && tasks_.empty()) {
      return nullptr;
    }

    auto task = std::move(tasks_.front());
    tasks_.pop();
    return task;
  }

  /**
   * @brief Stop the queue and wake up blockers
   */
  void stop() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      stop_ = true;
    }
    condition_.notify_all();
  }

  /**
   * @brief Clear all tasks from the queue
   */
  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    while (!tasks_.empty()) {
      tasks_.pop();
    }
  }

  /**
   * @brief Get the current size of the queue
   */
  size_t size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return tasks_.size();
  }

  /**
   * @brief Check if the queue is empty
   */
  bool empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return tasks_.empty();
  }

private:
  mutable std::mutex mutex_;
  std::condition_variable condition_;
  std::queue<std::function<void()>> tasks_;
  bool stop_ = false;
};

} // namespace roaya
