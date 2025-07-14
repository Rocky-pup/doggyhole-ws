import { EventEmitter } from 'events';
import WebSocket from 'ws';

import { DoggyHoleClientEventManager, DoggyHoleServerEventManager } from './internalClasses';
import { 
  ServerOptions, 
  ClientOptions, 
  ConnectionState, 
  LogLevel,
  RequestHandler,
  ConnectionStateHandler,
  ClientInfo
} from './types';
import { 
  DoggyHoleError,
  AuthenticationError,
  ConnectionError,
  TimeoutError,
  HandlerNotFoundError,
  ClientNotFoundError,
  NetworkError
} from './errors';
import { Logger } from './logger';

export class DoggyHoleServer extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Map<string, ClientInfo> = new Map();
  private connectedClients: Map<WebSocket, { name: string; lastHeartbeat: number }> = new Map();
  private handlers: Map<string, RequestHandler> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private options: Required<ServerOptions>;
  private logger: Logger;
  private isShuttingDown: boolean = false;
  private shutdownPromise: Promise<void> | null = null;
  public event: DoggyHoleServerEventManager;

  constructor(options: ServerOptions) {
    super();
    this.options = {
      port: options.port,
      heartbeatInterval: options.heartbeatInterval || 1000,
      heartbeatTimeout: options.heartbeatTimeout || 3000,
      maxConnections: options.maxConnections || 1000,
      logLevel: options.logLevel || LogLevel.INFO,
      gracefulShutdownTimeout: options.gracefulShutdownTimeout || 5000,
      messageQueueSize: options.messageQueueSize || 100
    };
    this.logger = new Logger('Server', this.options.logLevel);
    this.wss = new WebSocket.Server({ 
      port: this.options.port,
      maxPayload: 1024 * 1024 // 1MB max message size
    });
    this.event = new DoggyHoleServerEventManager(this);
    this.setupServer();
    this.startHeartbeat();
    this.logger.info(`Server started on port ${this.options.port}`);
  }

  static create(options: ServerOptions): DoggyHoleServer {
    return new DoggyHoleServer(options);
  }

  setUser(name: string, token: string): DoggyHoleServer {
    this.clients.set(name, { name, token });
    return this;
  }

  removeUser(name: string): DoggyHoleServer {
    this.clients.delete(name);
    for (const [ws, clientData] of this.connectedClients) {
      if (clientData.name === name) {
        ws.close(1000, 'Client removed from server');
        this.connectedClients.delete(ws);
        break;
      }
    }
    return this;
  }

  addHandler<TReq = any, TRes = any>(functionName: string, handler: RequestHandler<TReq, TRes>): DoggyHoleServer {
    this.handlers.set(functionName, handler);
    this.logger.debug(`Handler added: ${functionName}`);
    return this;
  }

  removeHandler(functionName: string): DoggyHoleServer {
    const removed = this.handlers.delete(functionName);
    if (removed) {
      this.logger.debug(`Handler removed: ${functionName}`);
    }
    return this;
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      let isAuthenticated = false;
      let clientName = '';

      // Check connection limit
      if (this.connectedClients.size >= this.options.maxConnections) {
        this.logger.warn('Connection limit reached');
        ws.close(1013, 'Server overloaded');
        return;
      }

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message: any = JSON.parse(data.toString());

          if (message.type === 'auth' && !isAuthenticated) {
            await this.handleAuth(ws, message);
            isAuthenticated = true;
            clientName = message.name;
            this.connectedClients.set(ws, { name: clientName, lastHeartbeat: Date.now() });
          } else if (message.type === 'request' && isAuthenticated) {
            await this.handleRequest(ws, message);
          } else if (message.type === 'client_request' && isAuthenticated) {
            await this.handleClientRequest(ws, message);
          } else if (message.type === 'response' && isAuthenticated) {
            this.handleResponse(ws, message);
          } else if (message.type === 'heartbeat_response' && isAuthenticated) {
            this.handleHeartbeatResponse(ws);
          } else if (message.type === 'event' && isAuthenticated) {
            this.handleEvent(ws, message);
          } else if (!isAuthenticated) {
            ws.close(1008, 'Authentication required');
          }
        } catch (error) {
          this.logger.error('Message handling error:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', (code, reason) => {
        this.connectedClients.delete(ws);
        if (clientName) {
          this.logger.info(`Client disconnected: ${clientName} (${code}: ${reason})`);
          this.emit('clientDisconnected', clientName);
        }
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });
    });

    this.wss.on('error', (error) => {
      this.logger.error('Server error:', error);
      this.emit('error', new NetworkError('Server error', { originalError: error }));
    });
  }

  private async handleAuth(ws: WebSocket, message: any): Promise<void> {
    const clientInfo = this.clients.get(message.name);
    
    if (!clientInfo || clientInfo.token !== message.token) {
      this.logger.warn(`Authentication failed for client: ${message.name}`);
      ws.close(1008, 'Invalid credentials');
      throw new AuthenticationError('Invalid credentials', { clientName: message.name });
    }

    this.logger.info(`Client connected: ${message.name}`);
    this.emit('clientConnected', message.name);
  }

  private async handleRequest(ws: WebSocket, message: any): Promise<void> {
    const handler = this.handlers.get(message.functionName);
    
    if (!handler) {
      const error = new HandlerNotFoundError(message.functionName);
      this.logger.warn(error.message);
      this.sendResponse(ws, message.id, false, null, error.message);
      return;
    }

    try {
      const result = await handler(message.data);
      this.sendResponse(ws, message.id, true, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Request handler error for ${message.functionName}:`, error);
      this.sendResponse(ws, message.id, false, null, errorMessage);
    }
  }

  private async handleClientRequest(ws: WebSocket, message: any): Promise<void> {
    const targetClient = this.findClientByName(message.targetClient);
    
    if (!targetClient) {
      const error = new ClientNotFoundError(message.targetClient);
      this.logger.warn(error.message);
      this.sendResponse(ws, message.id, false, null, error.message);
      return;
    }

    const clientRequestMessage: any = {
      type: 'client_request',
      id: message.id,
      functionName: message.functionName,
      data: message.data,
      targetClient: message.targetClient,
      fromClient: this.getClientName(ws)
    };

    if (targetClient.readyState === WebSocket.OPEN) {
      targetClient.send(JSON.stringify(clientRequestMessage));
    } else {
      const error = new ConnectionError('Target client not available');
      this.logger.warn(error.message);
      this.sendResponse(ws, message.id, false, null, error.message);
    }
  }

  private handleResponse(_ws: WebSocket, message: any): void {
    if (message.originalFromClient) {
      const originalClient = this.findClientByName(message.originalFromClient);
      if (originalClient && originalClient.readyState === WebSocket.OPEN) {
        originalClient.send(JSON.stringify(message));
      }
    }
  }

  private handleHeartbeatResponse(ws: WebSocket): void {
    const clientData = this.connectedClients.get(ws);
    if (clientData) {
      clientData.lastHeartbeat = Date.now();
    }
  }

  private handleEvent(ws: WebSocket, message: any): void {
    const clientData = this.connectedClients.get(ws);
    if (clientData) {
      this.event.handleIncomingEvent(clientData.name, message.eventName, message.data);
    }
  }

  private findClientByName(name: string): WebSocket | null {
    for (const [ws, clientData] of this.connectedClients) {
      if (clientData.name === name) {
        return ws;
      }
    }
    return null;
  }

  private getClientName(ws: WebSocket): string {
    const clientData = this.connectedClients.get(ws);
    return clientData ? clientData.name : 'unknown';
  }

  getConnectedClients(): Map<WebSocket, { name: string; lastHeartbeat: number }> {
    return this.connectedClients;
  }

  getConnectedClientNames(): string[] {
    return Array.from(this.connectedClients.values()).map(client => client.name);
  }


  private sendResponse(ws: WebSocket, id: string, success: boolean, data?: any, error?: string): void {
    const response: any = {
      type: 'response',
      id,
      success,
      data,
      error
    };
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1002, error);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [ws, clientData] of this.connectedClients) {
        if (now - clientData.lastHeartbeat > this.options.heartbeatTimeout) {
          ws.close(1000, 'Heartbeat timeout');
          this.connectedClients.delete(ws);
          this.emit('clientTimeout', clientData.name);
        } else {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }
      }
    }, this.options.heartbeatInterval);
  }

  getLogger(): Logger {
    return this.logger;
  }

  isServerShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  async gracefulShutdown(reason?: string): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    this.logger.info(`Starting graceful shutdown: ${reason || 'No reason provided'}`);

    this.shutdownPromise = new Promise<void>(async (resolve) => {
      // Notify all clients about shutdown
      const shutdownMessage = {
        type: 'shutdown',
        reason: reason || 'Server shutdown',
        gracePeriod: this.options.gracefulShutdownTimeout
      };

      for (const [ws] of this.connectedClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(shutdownMessage));
        }
      }

      // Wait for graceful shutdown timeout
      setTimeout(() => {
        this.close();
        resolve();
      }, this.options.gracefulShutdownTimeout);
    });

    return this.shutdownPromise;
  }

  close(): void {
    this.logger.info('Closing server');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Close all client connections
    for (const [ws] of this.connectedClients) {
      ws.close(1001, 'Server shutdown');
    }
    
    this.wss.close();
    this.emit('closed');
  }
}

export class DoggyHoleClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private options: Required<ClientOptions>;
  private requestId: number = 0;
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private clientHandlers: Map<string, RequestHandler> = new Map();
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private logger: Logger;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  public event: DoggyHoleClientEventManager;

  constructor(options: ClientOptions) {
    super();
    this.options = {
      url: options.url,
      name: options.name,
      token: options.token,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      heartbeatInterval: options.heartbeatInterval || 1000,
      requestTimeout: options.requestTimeout || 10000,
      logLevel: options.logLevel || LogLevel.INFO,
      reconnectBackoffMultiplier: options.reconnectBackoffMultiplier || 1.5
    };
    this.logger = new Logger(`Client:${this.options.name}`, this.options.logLevel);
    this.event = new DoggyHoleClientEventManager(this);
  }

  static create(options: ClientOptions): DoggyHoleClient {
    return new DoggyHoleClient(options);
  }

  setName(name: string): DoggyHoleClient {
    this.options.name = name;
    return this;
  }

  setToken(token: string): DoggyHoleClient {
    this.options.token = token;
    return this;
  }

  setUrl(url: string): DoggyHoleClient {
    this.options.url = url;
    return this;
  }

  addHandler<TReq = any, TRes = any>(functionName: string, handler: RequestHandler<TReq, TRes>): DoggyHoleClient {
    this.clientHandlers.set(functionName, handler);
    this.logger.debug(`Handler added: ${functionName}`);
    return this;
  }

  removeHandler(functionName: string): DoggyHoleClient {
    this.clientHandlers.delete(functionName);
    return this;
  }

  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      this.logger.warn('Already connected');
      return;
    }

    if (this.connectionState === ConnectionState.CONNECTING) {
      this.logger.warn('Connection already in progress');
      return;
    }

    return new Promise((resolve, reject) => {
      this.setConnectionState(ConnectionState.CONNECTING);
      
      this.ws = new WebSocket(this.options.url);

      this.ws.on('open', () => {
        this.authenticate();
        this.startHeartbeat();
        this.reconnectAttempts = 0;
        this.setConnectionState(ConnectionState.CONNECTED);
        
        this.logger.info('Connected to server');
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code: number, reason: string) => {
        this.logger.info(`Disconnected: ${code} - ${reason}`);
        this.cleanup();
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.emit('disconnected', code, reason);
        
        // Auto-reconnect if not intentionally disconnected
        if (code !== 1000 && code !== 1001 && this.reconnectAttempts < this.options.maxReconnectAttempts && !this.isClientShuttingDown()) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error('WebSocket error:', error);
        this.cleanup();
        this.setConnectionState(ConnectionState.DISCONNECTED);
        const connectionError = new ConnectionError('WebSocket connection failed', { originalError: error });
        this.emit('error', connectionError);
        reject(connectionError);
      });
    });
  }

  private authenticate(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const authMessage: any = {
        type: 'auth',
        name: this.options.name,
        token: this.options.token
      };
      this.ws.send(JSON.stringify(authMessage));
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: any = JSON.parse(data.toString());

      if (message.type === 'response') {
        this.handleResponse(message);
      } else if (message.type === 'heartbeat') {
        this.handleHeartbeat();
      } else if (message.type === 'event') {
        this.handleEvent(message);
      } else if (message.type === 'client_request') {
        this.handleClientRequest(message);
      } else if (message.type === 'shutdown') {
        this.handleShutdown(message);
      }
    } catch (error) {
      this.logger.error('Message parsing error:', error);
      this.emit('error', new NetworkError('Invalid message format', { originalError: error }));
    }
  }

  private async handleClientRequest(message: any): Promise<void> {
    const handler = this.clientHandlers.get(message.functionName);
    
    if (!handler) {
      this.sendClientResponse(message.id, false, null, 'Handler not found', message.fromClient);
      return;
    }

    try {
      const result = await handler(message.data);
      this.sendClientResponse(message.id, true, result, undefined, message.fromClient);
    } catch (error) {
      this.sendClientResponse(message.id, false, null, error instanceof Error ? error.message : 'Unknown error', message.fromClient);
    }
  }

  private sendClientResponse(id: string, success: boolean, data?: any, error?: string, originalFromClient?: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const response: any = {
        type: 'response',
        id,
        success,
        data,
        error,
        originalFromClient
      };
      this.ws.send(JSON.stringify(response));
    }
  }

  private handleResponse(message: any): void {
    const request = this.pendingRequests.get(message.id);
    if (request) {
      clearTimeout(request.timeout);
      this.pendingRequests.delete(message.id);
      
      if (message.success) {
        request.resolve(message.data);
      } else {
        const error = new DoggyHoleError(message.error || 'Unknown error', 'REQUEST_ERROR');
        request.reject(error);
      }
    }
  }

  private handleHeartbeat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const response: any = {
        type: 'heartbeat_response'
      };
      this.ws.send(JSON.stringify(response));
    }
  }

  private handleEvent(message: any): void {
    this.event.handleIncomingEvent(message.eventName, message.data);
  }

  private handleShutdown(message: any): void {
    this.logger.warn(`Server shutdown: ${message.reason || 'No reason'}`);
    this.emit('serverShutdown', message.reason, message.gracePeriod);
    
    // Gracefully disconnect
    setTimeout(() => {
      if (this.isConnected()) {
        this.disconnect();
      }
    }, Math.min(message.gracePeriod || 1000, 5000));
  }

  sendEvent<T = any>(eventName: string, data: T): void {
    if (this.isConnected() && this.ws) {
      const eventMessage: any = {
        type: 'event',
        eventName,
        data
      };
      
      this.ws.send(JSON.stringify(eventMessage));
      this.logger.debug(`Event sent: ${eventName}`);
    } else {
      this.logger.warn(`Cannot send event ${eventName}: not connected`);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.handleHeartbeat();
      }
    }, this.options.heartbeatInterval);
  }

  async request<TReq = any, TRes = any>(functionName: string, data: TReq): Promise<TRes> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new ConnectionError('Client not connected'));
        return;
      }

      const id = (++this.requestId).toString();
      const requestMessage: any = {
        type: 'request',
        id,
        functionName,
        data
      };

      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          const error = new TimeoutError(`Request timeout for ${functionName}`, { functionName, timeout: this.options.requestTimeout });
          this.logger.warn(error.message);
          reject(error);
        }
      }, this.options.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      
      this.ws!.send(JSON.stringify(requestMessage));
    });
  }

  async requestClient<TReq = any, TRes = any>(targetClient: string, functionName: string, data: TReq): Promise<TRes> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new ConnectionError('Client not connected'));
        return;
      }

      const id = (++this.requestId).toString();
      const clientRequestMessage: any = {
        type: 'client_request',
        id,
        functionName,
        data,
        targetClient,
        fromClient: this.options.name
      };

      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          const error = new TimeoutError(`Client request timeout for ${targetClient}.${functionName}`, { targetClient, functionName, timeout: this.options.requestTimeout });
          this.logger.warn(error.message);
          reject(error);
        }
      }, this.options.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      
      this.ws!.send(JSON.stringify(clientRequestMessage));
    });
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    for (const [_, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new ConnectionError('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  disconnect(): void {
    this.setConnectionState(ConnectionState.DISCONNECTING);
    this.logger.info('Disconnecting from server');
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.setConnectionState(ConnectionState.DISCONNECTED);
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const oldState = this.connectionState;
      this.connectionState = state;
      this.logger.debug(`Connection state changed: ${oldState} -> ${state}`);
      this.emit('stateChange', state, oldState);
    }
  }

  onStateChange(handler: ConnectionStateHandler): DoggyHoleClient {
    this.on('stateChange', handler);
    return this;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(this.options.reconnectBackoffMultiplier, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.setConnectionState(ConnectionState.RECONNECTING);
    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error('Reconnection failed:', error);
      });
    }, delay);
  }

  private isClientShuttingDown(): boolean {
    return this.connectionState === ConnectionState.DISCONNECTING;
  }

  getLogger(): Logger {
    return this.logger;
  }
}

// Export all types and classes for TypeScript users
export * from './types';
export {
  DoggyHoleError,
  AuthenticationError,
  ConnectionError,
  TimeoutError,
  ValidationError,
  HandlerNotFoundError,
  ClientNotFoundError,
  NetworkError
} from './errors';
export { Logger } from './logger';
export { DoggyHoleClientEventManager, DoggyHoleServerEventManager } from './internalClasses';