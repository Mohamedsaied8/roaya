# Detailed Implementation Roadmap: Roaya (Vision)

> **Last updated**: 2026-03-23

This document provides a granular, step-by-step breakdown of the development process for **Roaya**. Every task follows the strict **Definition of Done** outlined below.

## Definition of Done (DoD)
To ensure high quality and prevent regression, a feature is considered "Done" only when:
1.  **Implementation**: The feature is fully implemented according to the architectural spec.
2.  **Unit Testing**: 100% test coverage is achieved for all new core logic.
3.  **Integration/Acceptance**: GUI and communication paths are verified via integration/E2E tests (Playwright/Jest).
4.  **Version Control**: Code is pushed to a GitHub repository within a dedicated **Pull Request**.
5.  **CI/CD Validation**: The Jenkins pipeline runs successfully, ensuring zero regressions and 100% passing tests.
6.  **Peer Review**: Code is reviewed, approved, and merged by a collaborator.

---

## Phase 1: CI/CD, Containerization & Environment [DONE]
*Goal: Establish the automated build, test, and deployment foundation.*

### 1.1 Dockerization
- [x] **Backend (C++)**:
    - [x] Create a Multi-stage `Dockerfile` (Build vs Runtime).
    - [x] Configure `docker-compose.yml` for local development (Backend, Postgres, Redis, Coturn).
- [x] **Frontend (React/TS)**:
    - [x] Create a `Dockerfile` for the frontend (Build vs NGINX Runtime).
- [x] **SFU Worker**:
    - [x] Containerize the `mediasoup-worker` independent service (stub).

### 1.2 Local Jenkins CI/CD
- [x] **Jenkins Setup**:
    - [x] Install Jenkins locally (Docker or Host-based).
    - [x] Configure **GitHub Plugin** and **GitHub Status API** credentials.
- [x] **Pipeline Configuration**:
    - [x] Define `Jenkinsfile` with the following mandatory stages:
        - [x] **Build**: Compile C++ backend and Frontend assets.
        - [x] **Unit testing**: Run `GoogleTest` and `Vitest` unit suites.
        - [x] **Integration testing**: Verify DB connections and WebSocket signaling.
        - [x] **Acceptance testing**: Execute E2E Playwright scenarios.
- [x] **GitHub Feedback**:
    - [x] Configure `post`-build actions to update the GitHub Pull Request status (Success/Failure) via the Status API.

### 1.3 Testing Foundation
- [x] Set up **Sanitizers** (ASan, TSan) in the C++ build for early memory/race detection.
- [x] Configure **Client-side E2E test runner** (Playwright or Cypress) in the CI pipeline.

---

## Phase 2: Foundation & Authentication [DONE]
*Goal: Secure user identity and core backend scaffolding with integrated tests.*

### 2.1 Backend & Concurrency Scaffolding [DONE]
- [x] Set up CMake with strict warnings and **Signal Handler Abstraction**.
- [x] Implement `TaskQueue` and `WorkerThread` classes.
- [x] **Test**: Unit test `TaskQueue` for thread-safety and `WorkerThread` for message processing.

### 2.2 Database & Authentication [DONE]
- [x] Define Postgres schemas and implement `PostgresClient`.
- [x] Implement `AuthService` (Register/Login) with Argon2id.
- [x] **Test**: Integration tests for DB CRUD and Auth logic.

### 2.3 Frontend Foundation [DONE]
- [x] Scaffold Vite/Tailwind/Lucide project.
- [x] Implement `AuthStore` and Auth UI components.
- [x] **Test**: Unit tests for `AuthStore` and Component tests for Login forms.

---

## Phase 3: Signaling & Room Management [DONE]
*Goal: Real-time orchestration and meeting lifecycle.*

### 3.1 WebSocket Core & Lock-Free Signaling
- [x] Implement `WebSocketServer` and `SignalingMessage` JSON envelope.
- [x] Implement **Lock-Free SPSC Queues** for IO-to-Room communication.
- [x] **Test**: Load test the WebSocket server for 1000+ concurrent connections.

### 3.2 Room Logic, Lifecycle & RBAC
- [x] Implement `RoomManager` with **Thread Pinning** and **Auth Enforcement**.
- [x] Implement Host Controls (Mute/Kick/Permissions) with backend validation.
- [x] **Test**: Scenario-based tests for Host actions (e.g., "Non-host cannot kick").

### 3.3 Roaya Branding & Participant UI
- [x] Design and implement the **Roaya Logo** (Vision-themed, clean typography) for the header.
- [x] Build **Icon-Only Participant Menu** (🔇, ⛔, 🖥️).
- [x] **Test**: UI/UX tests for logo responsiveness and permission toggles.

---

## Phase 4: WebRTC Media & Advanced Features [DONE]
*Goal: High-performance audio/video routing and interactive tools.*

### 4.1 Media Server (SFU) Integration [DONE]
- [x] Integrate `mediasoup-worker` and implement `SFUManager`.
    - SFU service: `MediasoupManager` class with full producer/consumer/transport lifecycle (`sfu/src/mediasoup_manager.ts`).
    - SFU signaling server: HTTP + Socket.IO endpoints for all SFU operations (`sfu/src/main.ts`).
    - Backend proxy: C++ `SFUManager` singleton proxying signaling messages to the SFU service (`backend/src/media/sfu/sfu_manager.cpp`).
    - Frontend: `MediaClient` wrapper for the mediasoup-client `Device` (`frontend/src/services/media/MediaClient.ts`).
    - Frontend: `useSFUMedia` hook managing the full SFU media lifecycle (device init, transport creation, produce/consume) (`frontend/src/hooks/useSFUMedia.ts`).
- [x] **Test**: Media integration tests (simulated RTP packet forwarding).
    - Unit tests for `useSFUMedia` hook (`frontend/src/__tests__/unit/useSFUMedia.test.ts`).

### 4.2 Screen Sharing & Remote Control [DONE]
- [x] Implement `getDisplayMedia` and SFU optimization for screens.
    - `WebRTCClient.getDisplayMedia()` with screen share constraints and SFU track replacement (`frontend/src/services/webrtc/WebRTCClient.ts`).
    - `useSFUMedia.shareScreen()` for producing screen track via SFU (`frontend/src/hooks/useSFUMedia.ts`).
    - Screen share flow in `RoomPage` with `getDisplayMedia` integration (`frontend/src/pages/RoomPage.tsx`).
- [x] Implement **WebRTC DataChannels** for Remote Control event transmission.
    - `RemoteControlChannel` class: host/guest DataChannel with `mousemove`, `mousedown`, `mouseup`, `keydown`, `keyup`, `scroll` event types (`frontend/src/services/webrtc/RemoteControlChannel.ts`).
- [x] **Test**: Latency measurements for Remote Control input events.
    - Unit tests for `RemoteControlChannel` (open/close, send/receive, state management) (`frontend/src/__tests__/unit/RemoteControlChannel.test.ts`).
    - Acceptance tests for screen sharing flows (AC-19, AC-26) (`frontend/src/__tests__/acceptance/meeting-flow.test.ts`).

### 4.3 Media UI [DONE]
- [x] Build responsive Masonry `VideoGrid` and Active Speaker detection.
    - `VideoGrid` component with adaptive grid layout (1–4+ columns based on participant count) (`frontend/src/components/Meeting/VideoGrid.tsx`).
    - `ParticipantVideo` component with mute/video-muted/screen-sharing/active-speaker indicators (`frontend/src/components/Meeting/ParticipantVideo.tsx`).
    - `useActiveSpeaker` hook using `AnalyserNode` RMS polling at 200ms intervals (`frontend/src/hooks/useActiveSpeaker.ts`).
- [x] **Test**: Cross-browser testing for WebRTC compatibility (Chrome/Firefox/Safari).
    - End-to-end meeting flow acceptance tests (`frontend/src/__tests__/acceptance/meeting-flow.test.ts`).

---

## Phase 5: Recording & Storage ⬅️ **CURRENT**
*Goal: Persistent meeting capture and cloud offloading.*

### 5.1 Server-Side Recording
- [ ] Implement Headless Recording Engine (Puppeteer/FFmpeg).
- [ ] **Test**: Automated validation of generated MP4 files (bitrate, duration).

### 5.2 Dynamic Google Drive Integration
- [ ] Implement `StorageSettings` API and Frontend **Settings GUI**.
- [ ] Implement OAuth2 refresh token flow for Drive.
- [ ] **Test**: Mocked Google API integration tests for chunked multi-part uploads.

---

## Phase 6: Scheduling & Calendar
*Goal: Future planning and external sync.*

### 6.1 Internal Scheduler & Lifecycle Auth
- [ ] Implement `scheduledAt` logic and **Lifecycle Auth** guards.
- [ ] **Test**: Timezone-aware unit tests for scheduling logic.

### 6.2 Google Calendar Sync
- [ ] Implement Google Calendar API sync and "Add to Calendar" buttons.
- [ ] **Test**: End-to-end flow from "Schedule Meeting" to "Calendar Event Created".

---

## Phase 7: Production Hardening & Scaling
*Goal: Stability and stress-testing at scale.*

- [ ] **Load Balancing**: NGINX sticky sessions and **Coturn** deployment.
- [ ] **Stress Test**: Simulate 50+ concurrent participants with multiple media tracks and recording active.
- [ ] **Stability**: 24-hour soak test to find memory leaks and socket pool exhaustion.
- [ ] **Final QA**: Full manual walkthrough of all "Host Control" icons and "Remote Control" sessions.
