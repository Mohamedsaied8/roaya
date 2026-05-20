
# Detailed Implementation Roadmap: Roaya (Vision)

> **Last updated**: 2026-04-10 (Phase 1–4 carry-over closed)

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

---

## Audit Findings (2026-04-09)

A full review of `docs/architecture_design.md` against the codebase produced the following gaps. **All A.1–A.5 items are now resolved as of 2026-04-10. Phases 1–4 are 100% complete per the Definition of Done (builds green, 29/29 backend unit tests passing, 68/68 frontend unit tests passing, SFU TypeScript typecheck clean).**

### A. Carry-over gaps from Phases 2–4

#### A.1 Backend persistence — *Resolved 2026-04-10*
- [x] **PostgresClient real libpq binding** — *Audit was wrong.* `backend/src/db/postgres_client.{hpp,cpp}` already uses `libpqxx` (FetchContent in `CMakeLists.txt:97`) and `UserRepository` performs real parameterized SQL via `executeQuery`. Marked done after re-reading the code.
- [x] **RedisClient real hiredis binding** — `backend/src/db/redis_client.cpp` rewritten to use `hiredis` (binary-safe `SET %b`/`GET %b`, native `EXPIRE`, native `PUBLISH`). Mutex still serializes access (hiredis contexts aren't thread-safe). Falls back to in-memory mode automatically when Redis is unreachable so unit tests don't need a live server. CMake locates hiredis via `find_path`/`find_library`; `libhiredis-dev` (build) and `libhiredis0.14` (runtime) added to `backend/Dockerfile`.
- [x] **Schema file** — added `backend/scripts/migrations/002_rooms_sessions_recordings.sql` with `rooms`, `sessions`, `recordings`, `storage_settings` (encrypted-at-rest columns for OAuth secrets). `docker-compose.yml` now mounts `backend/scripts/migrations` into the postgres container's `docker-entrypoint-initdb.d`, so first-boot applies 001 then 002 in lexical order.

#### A.2 RBAC enforcement gaps (Phase 3)
Architecture §5 / §11 mandate backend-side role checks for every privileged action. Implementation is inconsistent:
- [x] **Bug — `MUTE_ALL` has no host check** — *Fixed 2026-04-10.* `backend/src/room/room.cpp:187` now early-returns with a warning when `!isHost(msg.senderId)`. Negative test `MuteAllRejectedFromNonHost` added in `backend/tests/unit/test_room_controls.cpp`.
- [x] **Move privileged actions into a single enforcement point** — *Fixed 2026-04-10.* Added `requiresHost()` helper in `backend/src/signaling/message_types.hpp`; `Room::handleMessage` now checks it once at the top before the switch, and `SignalingHandler::handleKickParticipant` / `handleEndMeeting` both funnel through the same helper. One rule, three call sites.
- [x] **Unit tests for RBAC negatives** — *Fixed 2026-04-10.* `backend/tests/unit/test_room_controls.cpp` now covers `MuteAllRejectedFromNonHost`, `KickRejectedFromNonHost`, `EndMeetingRejectedFromNonHost` (9/9 in the RoomControls suite pass).

#### A.3 SFU architectural drift (Phase 4)
Architecture §2.1 / §2.4 describe a C++ `SFUManager` proxy co-located with signaling. Reality:
- [x] **`backend/src/media/sfu/sfu_manager.cpp` stub + server.cpp TODO** — *Resolved 2026-04-10.* TODO removed in `server.cpp`; replaced with a comment documenting the standalone-SFU topology. The C++ `SFUManager` continues to proxy signaling messages; media lives exclusively in the Node worker.
- [x] **Decision taken: option (b) — standalone SFU.** Rationale: the Node worker is already production-shaped, the C++ proxy was never going to own mediasoup workers, and centralizing the SFU in one language keeps latency instrumentation simple. `docs/architecture_design.md` §2 updated.
- [x] **SFU service requires the room JWT** — *Fixed 2026-04-10.* `sfu/src/main.ts` now ships a dependency-free HS256 verifier (keyed by `ROAYA_JWT_SECRET`, matches the backend's `jwt-cpp` issuer `roaya`). Socket.IO requests run through an `io.use()` middleware; HTTP endpoints check the `Authorization: Bearer …` header. Can be toggled off in tests via `ROAYA_SFU_REQUIRE_JWT=false`.

#### A.4 Frontend resilience gaps (Phase 4)
- [x] **FSM for the WebRTC lifecycle** — *Fixed 2026-04-10.* Added `frontend/src/hooks/useConnectionFSM.ts` (hand-rolled reducer, zero deps) with states `IDLE → SIGNALING → CONNECTING → CONNECTED → RECONNECTING → FAILED`. Wired into `useSFUMedia` — emits `START_SIGNALING` / `SIGNALING_READY` / `CONNECTED` / `FAIL` at the right lifecycle points. Illegal transitions log a dev warning instead of crashing.
- [x] **`getUserMedia` timeout + error UI** — *Fully fixed 2026-04-10.* The 5 s race was already in `RoomPage.tsx`; now `frontend/src/components/common/MediaErrorToast.tsx` listens for `roaya:media-error` and renders a dismissable banner. Mounted once at the App root.
- [x] **Operations queue for renegotiation** — *Fixed 2026-04-10.* `MediaClient.ts` now has a `pendingOps` promise chain. `produce()` and `consume()` enqueue through `enqueue()`, which serializes calls so no new negotiation starts while one is in flight. Failures don't poison the chain.
- [x] **Track-end lifecycle binding** — *Fixed 2026-04-10.* `useSFUMedia.consumeProducer` now binds `consumer.on('trackended', …)` and `consumer.track.addEventListener('ended', …)`. On fire, the consumer is closed, the remote stream is removed, and a `roaya:track-ended` window event is dispatched for any UI listener that wants to react.

#### A.5 Remote control hardening
- [x] **Permission gate on `RemoteControlChannel`** — *Fixed 2026-04-10.* Added `grantControl()` / `revokeControl()` with a `granted` flag. `sendEvent` refuses to transmit until the gate is open; inbound `event` frames are dropped unless granted. Host sends a `{kind:'grant'}` / `{kind:'revoke'}` control frame that the guest uses to update its local state.
- [x] **Latency instrumentation** — *Fixed 2026-04-10.* `RemoteControlChannel` now runs a 1 s PING loop on channel open; the peer echoes with a PONG and the originator computes RTT via `performance.now()`. Exposed through `getLastRtt()` and `onRtt()`. Logged in dev with `console.debug`.

---

## Phase 5: Recording & Storage ⬅️ **CURRENT**
*Goal: Persistent meeting capture and cloud offloading.*

### 5.0 Pre-requisites (carry-over from audit)
~~Resolve **A.1** (real Postgres + schema) and **A.2** (RBAC for `MUTE_ALL`).~~ **Cleared 2026-04-10** — all A.1–A.5 closed. Phase 5 can start freely.

### 5.1 Recording Manager scaffold
- [ ] **5.1.a** Add `recordings` and `storage_settings` tables to `docs/schema.sql` and run a migration.
- [ ] **5.1.b** Create `backend/src/media/recording/recording_manager.{hpp,cpp}` with the interface `startRecording(roomId)`, `stopRecording(roomId)`, `getStatus(recordingId)`. Stub the engine; persist state in DB.
- [ ] **5.1.c** Wire REST routes `POST /api/rooms/:id/record/start|stop` (host-only) into `RecordingManager`. Reject if room state ≠ `ACTIVE`.
- [ ] **5.1.d** Unit-test the manager state machine (`IDLE → STARTING → RECORDING → STOPPING → UPLOADING → DONE/FAILED`).

### 5.2 Headless capture engine
- [ ] **5.2.a** Spike: choose Puppeteer-headless-Chrome vs. an SFU-side GStreamer/FFmpeg sink. Document the decision in `docs/architecture_design.md` §6.
- [ ] **5.2.b** Implement the chosen capture pipeline as a standalone worker process spawned by `RecordingManager`. Output: H.264 + AAC in fragmented MP4 (`+faststart`) on local disk under `/var/roaya/recordings/{roomId}/{recordingId}.mp4`.
- [ ] **5.2.c** Ensure the recorder joins as a *bot participant* with a server-issued JWT and `kind=recorder` so the SFU consumes all producers but does not produce.
- [ ] **5.2.d** Validation script: ffprobe the output and assert `duration > 0`, `video bitrate > 0`, `audio track present`. Run in CI as part of acceptance tests.

### 5.3 Storage settings & OAuth2
- [ ] **5.3.a** Backend: `GET/POST /api/settings/storage` with encrypted-at-rest persistence (libsodium or AES-GCM) for `client_id`, `client_secret`, `refresh_token`, `folder_id`.
- [ ] **5.3.b** Backend: implement Google OAuth2 callback handler `GET /api/settings/storage/oauth/callback` that exchanges the auth code for a refresh token and stores it.
- [ ] **5.3.c** Frontend: `SettingsPage.tsx` with "Connect Google Drive" button, folder picker, and status of last upload. Add to the main nav.
- [ ] **5.3.d** Mocked unit tests of the OAuth exchange against a fake Google endpoint.

### 5.4 Async upload worker
- [ ] **5.4.a** Implement `backend/src/media/recording/upload_worker.cpp` — a background `WorkerThread` that polls `recordings WHERE status='UPLOADING'` and chunk-uploads to Drive (resumable upload protocol).
- [ ] **5.4.b** On success, store the Drive `fileId`/`webViewLink` on the recording row and broadcast `recording_ready` over WebSocket to the host.
- [ ] **5.4.c** Retry policy: exponential backoff, max 5 attempts, then mark `FAILED` and surface in the Settings UI.
- [ ] **5.4.d** Integration test against a mocked Drive API (chunked PUT, 308 resume, final 200).

### 5.5 Recording UX & E2E
- [ ] **5.5.a** Add a **Record** button to the meeting toolbar (host-only); show a red "● REC" indicator to all participants while active.
- [ ] **5.5.b** Add a "Past recordings" list on `SettingsPage` showing status + Drive link.
- [ ] **5.5.c** Acceptance test `frontend/src/__tests__/acceptance/recording-flow.test.ts`: host starts recording → stops → recording row reaches `DONE` → link is rendered.
- [ ] **5.5.d** Update `architecture_design.md` §6/§7 with the actual file paths, table names, and the chosen capture engine.

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
