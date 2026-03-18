#pragma once

#include <atomic>
#include <cstddef>

namespace roaya {

/**
 * @brief A lock-free Single-Producer Single-Consumer (SPSC) queue.
 * Optimized for passing messages between a producer thread (e.g., Network IO)
 * and a consumer thread (e.g., Room Logic).
 */
template <typename T>
class SPSCQueue {
public:
  explicit SPSCQueue(size_t capacity)
      : capacity_(capacity), buffer_(new T[capacity]), head_(0), tail_(0) {}

  ~SPSCQueue() { delete[] buffer_; }

  // Non-copyable
  SPSCQueue(const SPSCQueue &) = delete;
  SPSCQueue &operator=(const SPSCQueue &) = delete;

  /**
   * @brief Push an item into the queue.
   * @return true if successful, false if queue is full.
   */
  bool push(const T &item) {
    size_t current_tail = tail_.load(std::memory_order_relaxed);
    size_t next_tail = (current_tail + 1) % capacity_;

    if (next_tail == head_.load(std::memory_order_acquire)) {
      return false; // Queue is full
    }

    buffer_[current_tail] = item;
    tail_.store(next_tail, std::memory_order_release);
    return true;
  }

  /**
   * @brief Pop an item from the queue.
   * @return true if successful, false if queue is empty.
   */
  bool pop(T &item) {
    size_t current_head = head_.load(std::memory_order_relaxed);

    if (current_head == tail_.load(std::memory_order_acquire)) {
      return false; // Queue is empty
    }

    item = buffer_[current_head];
    head_.store((current_head + 1) % capacity_, std::memory_order_release);
    return true;
  }

  /**
   * @brief Check if the queue is empty.
   */
  bool empty() const {
    return head_.load(std::memory_order_acquire) == tail_.load(std::memory_order_acquire);
  }

  /**
   * @brief Get an approximate size of the queue.
   */
  size_t size() const {
    size_t head = head_.load(std::memory_order_acquire);
    size_t tail = tail_.load(std::memory_order_acquire);
    if (tail >= head) {
      return tail - head;
    }
    return capacity_ - (head - tail);
  }

private:
  const size_t capacity_;
  T *const buffer_;
  alignas(64) std::atomic<size_t> head_;
  alignas(64) std::atomic<size_t> tail_;
};

} // namespace roaya
