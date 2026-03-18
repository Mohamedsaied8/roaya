#include "worker_thread.hpp"
#include "logger.hpp"

namespace roaya {

WorkerThread::WorkerThread(TaskQueue &queue) : queue_(queue) {}

WorkerThread::~WorkerThread() { stop(); }

void WorkerThread::start() {
  if (running_) {
    return;
  }

  running_ = true;
  stop_requested_ = false;
  thread_ = std::thread(&WorkerThread::run, this);
  LOG_INFO("Worker thread started");
}

void WorkerThread::stop() {
  if (!running_) {
    return;
  }

  stop_requested_ = true;
  // The TaskQueue::stop() should be called externally if we want to wake up
  // workers immediately
  if (thread_.joinable()) {
    thread_.join();
  }
  running_ = false;
  LOG_INFO("Worker thread stopped");
}

void WorkerThread::join() {
  if (thread_.joinable()) {
    thread_.join();
  }
}

void WorkerThread::run() {
  while (!stop_requested_) {
    auto task = queue_.pop();
    if (task) {
      try {
        task();
      } catch (const std::exception &e) {
        LOG_ERROR("Error executing task in worker thread: {}", e.what());
      } catch (...) {
        LOG_ERROR("Unknown error executing task in worker thread");
      }
    } else if (stop_requested_) {
      break;
    }
  }
  running_ = false;
}

} // namespace roaya
