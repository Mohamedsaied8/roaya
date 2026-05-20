import { Server } from 'socket.io';
import { createServer } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { MediasoupManager } from './mediasoup_manager';

// ---------------------------------------------------------------------------
// Minimal HS256 JWT verifier (no extra deps). Mirrors backend/src/auth/jwt_handler
// which signs with `jwt::algorithm::hs256` and issuer "roaya".
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.ROAYA_JWT_SECRET || 'change-this-secret-in-production';
const JWT_REQUIRED = process.env.ROAYA_SFU_REQUIRE_JWT !== 'false'; // default: on

function base64UrlDecode(s: string): Buffer {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

interface JwtPayload { userId?: string; iss?: string; exp?: number; [k: string]: any }

function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest();
    const provided = base64UrlDecode(sig);
    if (expected.length !== provided.length) return null;
    if (!timingSafeEqual(expected, provided)) return null;
    const payload: JwtPayload = JSON.parse(base64UrlDecode(p).toString('utf8'));
    if (payload.iss && payload.iss !== 'roaya') return null;
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractToken(req: { headers?: any; url?: string }): string | null {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  try {
    const url = new URL(req.url || '', 'http://x');
    const q = url.searchParams.get('token');
    if (q) return q;
  } catch { /* ignore */ }
  return null;
}

async function main() {
  console.log('Starting Roaya SFU service...');
  
  const mediasoupManager = new MediasoupManager();
  await mediasoupManager.init();

  const httpServer = createServer((req, res) => {
    // Require a valid backend-issued JWT on every HTTP call.
    if (JWT_REQUIRED) {
      const token = extractToken(req);
      if (!token || !verifyJwt(token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'unauthorized' }));
        return;
      }
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          if (req.url === '/get_router_rtp_capabilities') {
            const router = await mediasoupManager.getOrCreateRouter(data.roomId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, rtpCapabilities: router.rtpCapabilities }));
          } else if (req.url === '/get_active_producers') {
            const producers = mediasoupManager.getActiveProducers(data.roomId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, producers }));
          } else if (req.url === '/close_producer') {
            mediasoupManager.closeProducer(data.producerId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (req.url === '/create_webrtc_transport') {
            const transport = await mediasoupManager.createWebRtcTransport(data.roomId);
            mediasoupManager.storeTransport(transport, data.participantId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              params: {
                id: transport.id, iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates, dtlsParameters: transport.dtlsParameters
              }
            }));
          } else if (req.url === '/connect_webrtc_transport') {
            await mediasoupManager.connectWebRtcTransport(data.transportId, data.dtlsParameters);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else if (req.url === '/produce') {
            const producer = await mediasoupManager.produce(data.transportId, data.kind, data.rtpParameters, data.participantId, data.source);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id: producer.id }));
          } else if (req.url === '/consume') {
            const consumer = await mediasoupManager.consume(data.transportId, data.producerId, data.rtpCapabilities);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              params: {
                id: consumer.id,
                producerId: consumer.producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
              }
            }));
          } else {
            res.writeHead(404);
            res.end();
          }
        } catch (err: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  // Socket.IO auth middleware — same JWT as the C++ signaling server.
  io.use((socket, next) => {
    if (!JWT_REQUIRED) return next();
    const tokenFromAuth = (socket.handshake.auth as any)?.token;
    const headerVal = socket.handshake.headers?.authorization;
    const tokenFromHeader =
      typeof headerVal === 'string' && headerVal.startsWith('Bearer ')
        ? headerVal.slice(7)
        : null;
    const token: string | null =
      tokenFromAuth || tokenFromHeader ||
      (socket.handshake.query?.token as string) || null;
    if (!token) return next(new Error('unauthorized: missing token'));
    const payload = verifyJwt(token);
    if (!payload) return next(new Error('unauthorized: invalid token'));
    (socket.data as any).user = payload;
    next();
  });

  io.on('connection', (socket) => {
    console.log('New connection to SFU signaling:', socket.id);

    socket.on('sfu_get_router_rtp_capabilities', async (data, callback) => {
      try {
        const router = await mediasoupManager.getOrCreateRouter(data.roomId);
        callback({ success: true, rtpCapabilities: router.rtpCapabilities });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('sfu_create_webrtc_transport', async (data, callback) => {
      try {
        const transport = await mediasoupManager.createWebRtcTransport(data.roomId);
        mediasoupManager.storeTransport(transport, data.participantId);
        callback({
          success: true,
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          }
        });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('sfu_connect_webrtc_transport', async (data, callback) => {
      try {
        await mediasoupManager.connectWebRtcTransport(data.transportId, data.dtlsParameters);
        callback({ success: true });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('sfu_produce', async (data, callback) => {
      try {
        const producer = await mediasoupManager.produce(data.transportId, data.kind, data.rtpParameters, data.participantId, data.source);
        callback({ success: true, id: producer.id });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('sfu_consume', async (data, callback) => {
      try {
        const consumer = await mediasoupManager.consume(data.transportId, data.producerId, data.rtpCapabilities);
        callback({
          success: true,
          params: {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          }
        });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('sfu_get_active_producers', async (data, callback) => {
      try {
        const producers = mediasoupManager.getActiveProducers(data.roomId);
        callback({ success: true, producers });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    socket.on('sfu_close_producer', async (data, callback) => {
      try {
        mediasoupManager.closeProducer(data.producerId);
        callback({ success: true });
      } catch (err: any) {
        callback({ success: false, error: err.message });
      }
    });

    // Store participantId on the socket for disconnect cleanup
    socket.on('sfu_register_participant', (data) => {
      socket.data.participantId = data.participantId;
    });

    socket.on('disconnect', () => {
      if (socket.data?.participantId) {
        mediasoupManager.closeParticipant(socket.data.participantId);
      }
      console.log('SFU client disconnected:', socket.id);
    });
  });

  httpServer.listen(3000, () => {
    console.log('Roaya SFU signaling server listening on port 3000');
  });

  console.log('Roaya SFU service is ready.');
}

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...');
  process.exit(0);
});

main().catch((err) => {
  console.error('Failed to start SFU service:', err);
  process.exit(1);
});
