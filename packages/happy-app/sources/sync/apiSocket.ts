import { io, Socket } from 'socket.io-client';
import { TokenStorage } from '@/auth/tokenStorage';
import { Encryption } from './encryption/encryption';
import { storage } from './storage';
import { getFailoverCandidates, getServerUrl, markServerHealthy, markServerUnhealthy, setActiveServerUrl } from './serverConfig';

//
// Types
//

export interface SyncSocketConfig {
    endpoint: string;
    token: string;
    fallbackEndpoints?: string[];
}

export interface SyncSocketState {
    isConnected: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    lastError: Error | null;
}

export type SyncSocketListener = (state: SyncSocketState) => void;

//
// Main Class
//

class ApiSocket {

    // State
    private socket: Socket | null = null;
    private config: SyncSocketConfig | null = null;
    private encryption: Encryption | null = null;
    private messageHandlers: Map<string, (data: any) => void> = new Map();
    private reconnectedListeners: Set<() => void> = new Set();
    private endpointListeners: Set<(endpoint: string) => void> = new Set();
    private statusListeners: Set<(status: 'disconnected' | 'connecting' | 'connected' | 'error') => void> = new Set();
    private currentStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
    private currentEndpoint: string | null = null;
    private isSwitchingEndpoint = false;

    //
    // Initialization
    //

    initialize(config: SyncSocketConfig, encryption: Encryption) {
        this.config = config;
        this.encryption = encryption;
        this.currentEndpoint = config.endpoint;
        this.connect();
    }

    //
    // Connection Management
    //

    connect() {
        if (!this.config || this.socket) {
            return;
        }

        this.currentEndpoint = this.currentEndpoint || this.config.endpoint || getServerUrl();
        this.updateStatus('connecting');

        this.socket = io(this.currentEndpoint, {
            path: '/v1/updates',
            auth: {
                token: this.config.token,
                clientType: 'user-scoped' as const
            },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        this.setupEventHandlers();
    }

    disconnect() {
        this.destroySocket();
        this.updateStatus('disconnected');
    }

    //
    // Listener Management
    //

    onReconnected = (listener: () => void) => {
        this.reconnectedListeners.add(listener);
        return () => this.reconnectedListeners.delete(listener);
    };

    onEndpointChange = (listener: (endpoint: string) => void) => {
        this.endpointListeners.add(listener);
        return () => this.endpointListeners.delete(listener);
    };

    onStatusChange = (listener: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void) => {
        this.statusListeners.add(listener);
        // Immediately notify with current status
        listener(this.currentStatus);
        return () => this.statusListeners.delete(listener);
    };

    //
    // Message Handling
    //

    onMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.set(event, handler);
        return () => this.messageHandlers.delete(event);
    }

    offMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.delete(event);
    }

    /**
     * RPC call for sessions - uses session-specific encryption
     */
    async sessionRPC<R, A>(sessionId: string, method: string, params: A): Promise<R> {
        const sessionEncryption = this.encryption!.getSessionEncryption(sessionId);
        if (!sessionEncryption) {
            throw new Error(`Session encryption not found for ${sessionId}`);
        }
        
        const result = await this.socket!.emitWithAck('rpc-call', {
            method: `${sessionId}:${method}`,
            params: await sessionEncryption.encryptRaw(params)
        });
        
        if (result.ok) {
            return await sessionEncryption.decryptRaw(result.result) as R;
        }
        throw new Error('RPC call failed');
    }

    /**
     * RPC call for machines - uses legacy/global encryption (for now)
     */
    async machineRPC<R, A>(machineId: string, method: string, params: A): Promise<R> {
        const machineEncryption = this.encryption!.getMachineEncryption(machineId);
        if (!machineEncryption) {
            throw new Error(`Machine encryption not found for ${machineId}`);
        }

        const result = await this.socket!.emitWithAck('rpc-call', {
            method: `${machineId}:${method}`,
            params: await machineEncryption.encryptRaw(params)
        });

        if (result.ok) {
            return await machineEncryption.decryptRaw(result.result) as R;
        }
        throw new Error(result.error || 'RPC call failed');
    }

    send(event: string, data: any) {
        this.socket!.emit(event, data);
        return true;
    }

    async emitWithAck<T = any>(event: string, data: any): Promise<T> {
        if (!this.socket) {
            throw new Error('Socket not connected');
        }
        return await this.socket.emitWithAck(event, data);
    }

    //
    // HTTP Requests
    //

    async request(path: string, options?: RequestInit): Promise<Response> {
        if (!this.config) {
            throw new Error('SyncSocket not initialized');
        }

        const credentials = await TokenStorage.getCredentials();
        if (!credentials) {
            throw new Error('No authentication credentials');
        }

        const endpoint = this.currentEndpoint || getServerUrl();
        const url = `${endpoint}${path}`;
        const headers = {
            'Authorization': `Bearer ${credentials.token}`,
            ...options?.headers
        };

        return fetch(url, {
            ...options,
            headers
        });
    }

    //
    // Token Management
    //

    updateToken(newToken: string) {
        if (this.config && this.config.token !== newToken) {
            this.config.token = newToken;

            if (this.socket) {
                this.destroySocket();
                this.connect();
            }
        }
    }

    reconnectToConfiguredEndpoint() {
        const nextEndpoint = getServerUrl();
        if (nextEndpoint === this.currentEndpoint && this.socket) {
            return;
        }

        this.switchEndpoint(nextEndpoint);
    }

    //
    // Private Methods
    //

    private isVerboseLogging(): boolean {
        try {
            return storage.getState().localSettings.verboseLogging;
        } catch {
            return false;
        }
    }

    private updateStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error') {
        if (this.currentStatus !== status) {
            this.currentStatus = status;
            this.statusListeners.forEach(listener => listener(status));
        }
    }

    private destroySocket() {
        if (!this.socket) {
            return;
        }

        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
    }

    private notifyEndpointChange(endpoint: string) {
        this.endpointListeners.forEach((listener) => listener(endpoint));
    }

    private switchEndpoint(nextEndpoint: string) {
        if (this.isSwitchingEndpoint) {
            return;
        }

        this.isSwitchingEndpoint = true;
        this.destroySocket();
        this.currentEndpoint = nextEndpoint;
        setActiveServerUrl(nextEndpoint);
        this.notifyEndpointChange(nextEndpoint);
        this.isSwitchingEndpoint = false;
        this.connect();
    }

    private async handleEndpointFailure(reason: string) {
        if (this.isSwitchingEndpoint) {
            return;
        }

        const failedEndpoint = this.currentEndpoint || this.config?.endpoint;
        if (!failedEndpoint) {
            return;
        }

        markServerUnhealthy(failedEndpoint, reason);
        const nextEndpoint = getFailoverCandidates(failedEndpoint)[0];
        if (!nextEndpoint || nextEndpoint === failedEndpoint) {
            return;
        }

        if (this.isVerboseLogging()) {
            console.warn(`🔁 SyncSocket: failover ${failedEndpoint} -> ${nextEndpoint} (${reason})`);
        }

        this.switchEndpoint(nextEndpoint);
    }

    private setupEventHandlers() {
        if (!this.socket) return;
        const endpoint = this.currentEndpoint || this.config?.endpoint || getServerUrl();

        // Connection events
        this.socket.on('connect', () => {
            if (this.isVerboseLogging()) {
                console.log('🔌 SyncSocket: Connected, recovered: ' + this.socket?.recovered);
                console.log('🔌 SyncSocket: Socket ID:', this.socket?.id);
            }
            markServerHealthy(endpoint);
            setActiveServerUrl(endpoint);
            this.notifyEndpointChange(endpoint);
            this.updateStatus('connected');
            if (!this.socket?.recovered) {
                this.reconnectedListeners.forEach(listener => listener());
            }
        });

        this.socket.on('disconnect', (reason) => {
            if (this.isVerboseLogging()) {
                console.log('🔌 SyncSocket: Disconnected', reason);
            }
            this.updateStatus('disconnected');
            if (reason !== 'io client disconnect') {
                void this.handleEndpointFailure(reason);
            }
        });

        // Error events
        this.socket.on('connect_error', (error) => {
            if (this.isVerboseLogging()) {
                console.error('🔌 SyncSocket: Connection error', error);
            }
            this.updateStatus('error');
            void this.handleEndpointFailure(error.message || 'connect_error');
        });

        this.socket.on('error', (error) => {
            if (this.isVerboseLogging()) {
                console.error('🔌 SyncSocket: Error', error);
            }
            this.updateStatus('error');
        });

        // Message handling
        this.socket.onAny((event, data) => {
            if (this.isVerboseLogging()) {
                console.log(`📥 SyncSocket: Received event '${event}':`, JSON.stringify(data).substring(0, 200));
            }
            const handler = this.messageHandlers.get(event);
            if (handler) {
                handler(data);
            }
        });
    }
}

//
// Singleton Export
//

export const apiSocket = new ApiSocket();
