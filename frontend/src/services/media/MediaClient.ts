import { Device, types } from 'mediasoup-client';
type Transport = types.Transport;

class MediaClient {
    private device: Device | null = null;
    private sendTransport: Transport | null = null;
    private recvTransport: Transport | null = null;

    async loadDevice(routerRtpCapabilities: any) {
        try {
            this.device = new Device();
            await this.device.load({ routerRtpCapabilities });
            console.log('Mediasoup device loaded');
        } catch (error) {
            console.error('Failed to load mediasoup device:', error);
            throw error;
        }
    }

    get rtpCapabilities() {
        return this.device?.rtpCapabilities;
    }

    async createSendTransport(params: any, 
                             onProduce: (data: any) => Promise<string>,
                             onConnect: (data: any) => Promise<void>) {
        if (!this.device) throw new Error('Device not loaded');

        this.sendTransport = this.device.createSendTransport(params);

        this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
            try {
                const id = await onProduce({ kind, rtpParameters, appData });
                callback({ id });
            } catch (error: any) {
                errback(error);
            }
        });

        this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await onConnect({ transportId: this.sendTransport!.id, dtlsParameters });
                callback();
            } catch (error: any) {
                errback(error);
            }
        });

        return this.sendTransport;
    }

    async createRecvTransport(params: any, onConnect: (data: any) => Promise<void>) {
        if (!this.device) throw new Error('Device not loaded');

        this.recvTransport = this.device.createRecvTransport(params);

        this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await onConnect({ transportId: this.recvTransport!.id, dtlsParameters });
                callback();
            } catch (error: any) {
                errback(error);
            }
        });

        return this.recvTransport;
    }

    async produce(track: MediaStreamTrack) {
        if (!this.sendTransport) throw new Error('Send transport not initialized');
        return await this.sendTransport.produce({ track });
    }

    async consume(params: any) {
        if (!this.recvTransport) throw new Error('Recv transport not initialized');
        return await this.recvTransport.consume(params);
    }
}

export const mediaClient = new MediaClient();
