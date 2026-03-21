import { Server } from 'socket.io';
import { createServer } from 'http';
import { MediasoupManager } from './mediasoup_manager';

async function main() {
  console.log('Starting Roaya SFU service...');
  
  const mediasoupManager = new MediasoupManager();
  await mediasoupManager.init();

  const httpServer = createServer((req, res) => {
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
            const producer = await mediasoupManager.produce(data.transportId, data.kind, data.rtpParameters, data.participantId);
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
        const producer = await mediasoupManager.produce(data.transportId, data.kind, data.rtpParameters, data.participantId);
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
