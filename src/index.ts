import { EventEmitter } from 'events';
import WebSocket from 'ws';

import { DoggyHoleClientEventManager, DoggyHoleServerEventManager } from './internalClasses';

export class DoggyHoleServer extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Map<string, ClientInfo> = new Map();
  private connectedClients: Map<WebSocket, { name: string; lastHeartbeat: number }> = new Map();
  private handlers: Map<string, Function> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private options: Required<ServerOptions>;
  public event: DoggyHoleServerEventManager;

  constructor(options: ServerOptions) {
    super();
    this.options = {
      port: options.port,
      heartbeatInterval: options.heartbeatInterval || 1000,
      heartbeatTimeout: options.heartbeatTimeout || 3000
    };
    this.wss = new WebSocket.Server({ port: this.options.port });
    this.event = new DoggyHoleServerEventManager(this);
    this.setupServer();
    this.startHeartbeat();
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

  addHandler(functionName: string, handler: Function): DoggyHoleServer {
    this.handlers.set(functionName, handler);
    return this;
  }

  removeHandler(functionName: string): DoggyHoleServer {
    this.handlers.delete(functionName);
    return this;
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      let isAuthenticated = false;
      let clientName = '';

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message: Message = JSON.parse(data.toString());

          if (message.type === 'auth' && !isAuthenticated) {
            await this.handleAuth(ws, message as AuthMessage);
            isAuthenticated = true;
            clientName = (message as AuthMessage).name;
            this.connectedClients.set(ws, { name: clientName, lastHeartbeat: Date.now() });
          } else if (message.type === 'request' && isAuthenticated) {
            await this.handleRequest(ws, message as RequestMessage);
          } else if (message.type === 'client_request' && isAuthenticated) {
            await this.handleClientRequest(ws, message as ClientRequestMessage);
          } else if (message.type === 'response' && isAuthenticated) {
            this.handleResponse(ws, message as ResponseMessage);
          } else if (message.type === 'heartbeat_response' && isAuthenticated) {
            this.handleHeartbeatResponse(ws);
          } else if (message.type === 'event' && isAuthenticated) {
            this.handleEvent(ws, message as EventMessage);
          } else if (!isAuthenticated) {
            ws.close(1008, 'Authentication required');
          }
        } catch (error) {
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.connectedClients.delete(ws);
        if (clientName) {
          this.emit('clientDisconnected', clientName);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connectedClients.delete(ws);
      });
    });
  }

  private async handleAuth(ws: WebSocket, message: AuthMessage): Promise<void> {
    const clientInfo = this.clients.get(message.name);
    
    if (!clientInfo || clientInfo.token !== message.token) {
      ws.close(1008, 'Invalid credentials');
      return;
    }

    this.emit('clientConnected', message.name);
  }

  private async handleRequest(ws: WebSocket, message: RequestMessage): Promise<void> {
    const handler = this.handlers.get(message.functionName);
    
    if (!handler) {
      this.sendResponse(ws, message.id, false, null, 'Handler not found');
      return;
    }

    try {
      const result = await handler(message.data);
      this.sendResponse(ws, message.id, true, result);
    } catch (error) {
      this.sendResponse(ws, message.id, false, null, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async handleClientRequest(ws: WebSocket, message: ClientRequestMessage): Promise<void> {
    const targetClient = this.findClientByName(message.targetClient);
    
    if (!targetClient) {
      this.sendResponse(ws, message.id, false, null, 'Target client not found');
      return;
    }

    const clientRequestMessage: ClientRequestMessage = {
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
      this.sendResponse(ws, message.id, false, null, 'Target client not available');
    }
  }

  private handleResponse(ws: WebSocket, message: ResponseMessage): void {
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

  private handleEvent(ws: WebSocket, message: EventMessage): void {
    const clientData = this.connectedClients.get(ws);
    if (clientData) {
      this.event.handleIncomingEvent(clientData.name, message.eventName, message.data);
      this.emit('event', message.eventName, message.data, clientData.name);
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

  onEvent(eventName: string, handler: (...args: any[]) => void): DoggyHoleServer {
    this.event.on(eventName, handler);
    return this;
  }

  onceEvent(eventName: string, handler: (...args: any[]) => void): DoggyHoleServer {
    this.event.once(eventName, handler);
    return this;
  }

  offEvent(eventName: string, handler?: (...args: any[]) => void): DoggyHoleServer {
    if (handler) {
      this.event.off(eventName, handler);
    } else {
      this.event.off(eventName);
    }
    return this;
  }

  emitEvent(eventName: string, data?: any): boolean {
    return this.event.emit(eventName, data);
  }

  broadcastEvent(eventName: string, data?: any): void {
    this.event.broadcast(eventName, data);
  }

  hasEventListeners(eventName: string): boolean {
    return this.event.hasListeners(eventName);
  }

  getEventListenerCount(eventName: string): number {
    return this.event.getListenerCount(eventName);
  }

  getEventNames(): string[] {
    return this.event.getEventNames();
  }

  setMaxEventListeners(max: number): DoggyHoleServer {
    this.event.setMaxListeners(max);
    return this;
  }

  getMaxEventListeners(): number {
    return this.event.getMaxListeners();
  }

  clearAllEvents(): void {
    this.event.clearAll();
  }

  clearEvent(eventName: string): void {
    this.event.clearEvent(eventName);
  }

  private sendResponse(ws: WebSocket, id: string, success: boolean, data?: any, error?: string): void {
    const response: ResponseMessage = {
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

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }
}

export class DoggyHoleClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private options: Required<ClientOptions>;
  private requestId: number = 0;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private clientHandlers: Map<string, Function> = new Map();
  public event: DoggyHoleClientEventManager;

  constructor(options: ClientOptions) {
    super();
    this.options = {
      url: options.url,
      name: options.name,
      token: options.token,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      heartbeatInterval: options.heartbeatInterval || 1000,
      requestTimeout: options.requestTimeout || 10000
    };
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

  addHandler(functionName: string, handler: Function): DoggyHoleClient {
    this.clientHandlers.set(functionName, handler);
    return this;
  }

  removeHandler(functionName: string): DoggyHoleClient {
    this.clientHandlers.delete(functionName);
    return this;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.options.url);

      this.ws.on('open', () => {
        this.authenticate();
        this.startHeartbeat();
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code: number, reason: string) => {
        this.cleanup();
        this.emit('disconnected', code, reason);
        
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
        }
      });

      this.ws.on('error', (error: Error) => {
        this.cleanup();
        this.emit('error', error);
        reject(error);
      });
    });
  }

  private authenticate(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const authMessage: AuthMessage = {
        type: 'auth',
        name: this.options.name,
        token: this.options.token
      };
      this.ws.send(JSON.stringify(authMessage));
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: Message = JSON.parse(data.toString());

      if (message.type === 'response') {
        this.handleResponse(message as ResponseMessage);
      } else if (message.type === 'heartbeat') {
        this.handleHeartbeat();
      } else if (message.type === 'event') {
        this.handleEvent(message as EventMessage);
      } else if (message.type === 'client_request') {
        this.handleClientRequest(message as ClientRequestMessage);
      }
    } catch (error) {
      this.emit('error', new Error('Invalid message format'));
    }
  }

  private async handleClientRequest(message: ClientRequestMessage): Promise<void> {
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
      const response: ResponseMessage = {
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

  private handleResponse(message: ResponseMessage): void {
    const request = this.pendingRequests.get(message.id);
    if (request) {
      this.pendingRequests.delete(message.id);
      if (message.success) {
        request.resolve(message.data);
      } else {
        request.reject(new Error(message.error || 'Unknown error'));
      }
    }
  }

  private handleHeartbeat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const response: HeartbeatResponseMessage = {
        type: 'heartbeat_response'
      };
      this.ws.send(JSON.stringify(response));
    }
  }

  private handleEvent(message: EventMessage): void {
    this.event.handleIncomingEvent(message.eventName, message.data);
  }

  sendEvent(eventName: string, data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const eventMessage: EventMessage = {
        type: 'event',
        eventName,
        data
      };
      this.ws.send(JSON.stringify(eventMessage));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.handleHeartbeat();
      }
    }, this.options.heartbeatInterval);
  }

  async request(functionName: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = (++this.requestId).toString();
      const requestMessage: RequestMessage = {
        type: 'request',
        id,
        functionName,
        data
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(requestMessage));

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, this.options.requestTimeout);
    });
  }

  async requestClient(targetClient: string, functionName: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = (++this.requestId).toString();
      const clientRequestMessage: ClientRequestMessage = {
        type: 'client_request',
        id,
        functionName,
        data,
        targetClient,
        fromClient: this.options.name
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(clientRequestMessage));

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, this.options.requestTimeout);
    });
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    for (const [_, request] of this.pendingRequests) {
      request.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}