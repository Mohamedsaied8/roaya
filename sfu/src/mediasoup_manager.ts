import * as mediasoup from 'mediasoup';
import { Worker, Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types';
import { v4 as uuidv4 } from 'uuid';

export class MediasoupManager {
  private workers: Worker[] = [];
  private nextWorkerIdx = 0;
  private routers: Map<string, Router> = new Map();

  constructor() {}

  public async init() {
    const numWorkers = Object.keys(require('os').cpus()).length;
    console.log(`Starting ${numWorkers} mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 41000,
        rtcMaxPort: 41100,
      });

      worker.on('died', () => {
        console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
    }
  }

  public async getOrCreateRouter(roomId: string): Promise<Router> {
    let router = this.routers.get(roomId);
    if (!router) {
      const worker = this.getWorker();
      router = await worker.createRouter({
        mediaCodecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
          },
          {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {
              'x-google-start-bitrate': 1000,
            },
          },
        ],
      });
      this.routers.set(roomId, router);
    }
    return router;
  }

  private getWorker(): Worker {
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  public async createWebRtcTransport(roomId: string): Promise<WebRtcTransport> {
    const router = await this.getOrCreateRouter(roomId);
    
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.SFU_ANNOUNCED_IP || '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      appData: { roomId }
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    return transport;
  }

  public async connectWebRtcTransport(transportId: string, dtlsParameters: any): Promise<void> {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    await transport.connect({ dtlsParameters });
  }

  private transports: Map<string, WebRtcTransport> = new Map();
  private producers: Map<string, Producer> = new Map();
  private consumers: Map<string, Consumer> = new Map();

  public async produce(transportId: string, kind: 'audio' | 'video', rtpParameters: any): Promise<Producer> {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = await transport.produce({ kind, rtpParameters, appData: { roomId: transport.appData.roomId } });
    this.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      producer.close();
      this.producers.delete(producer.id);
    });

    return producer;
  }

  public async consume(transportId: string, producerId: string, rtpCapabilities: any): Promise<Consumer> {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = this.producers.get(producerId);
    if (!producer) throw new Error('Producer not found');

    const router = await this.getOrCreateRouter(producer.appData.roomId as string);
    
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    this.consumers.set(consumer.id, consumer);

    // Resume consumer after creation (standard practice)
    await consumer.resume();

    consumer.on('transportclose', () => {
      consumer.close();
      this.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      consumer.close();
      this.consumers.delete(consumer.id);
    });

    return consumer;
  }

  public storeTransport(transport: WebRtcTransport) {
    this.transports.set(transport.id, transport);
  }
}
