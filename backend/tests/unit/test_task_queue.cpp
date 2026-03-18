#include "core/task_queue.hpp"
#include <gtest/gtest.h>
#include <thread>
#include <vector>
#include <atomic>

using namespace roaya;

TEST(TaskQueueTest, PushAndPop) {
    TaskQueue queue;
    std::atomic<int> counter{0};
    
    queue.push([&counter]() { counter++; });
    queue.push([&counter]() { counter += 2; });
    
    auto task1 = queue.pop();
    task1();
    EXPECT_EQ(counter, 1);
    
    auto task2 = queue.pop();
    task2();
    EXPECT_EQ(counter, 3);
}

TEST(TaskQueueTest, ThreadSafety) {
    TaskQueue queue;
    std::atomic<int> counter{0};
    const int num_tasks = 1000;
    
    std::thread producer([&queue, num_tasks]() {
        for (int i = 0; i < num_tasks; ++i) {
            queue.push([]() { /* dummy */ });
        }
    });
    
    std::thread consumer([&queue, num_tasks, &counter]() {
        for (int i = 0; i < num_tasks; ++i) {
            auto task = queue.pop();
            counter++;
        }
    });
    
    producer.join();
    consumer.join();
    
    EXPECT_EQ(counter, num_tasks);
}

TEST(TaskQueueTest, StopAndEmpty) {
    TaskQueue queue;
    queue.push([]() {});
    queue.stop();
    
    // pop should return nullopt or empty function after stop if empty
    // My implementation returns empty function
    auto task = queue.pop();
    EXPECT_FALSE(task);
}
