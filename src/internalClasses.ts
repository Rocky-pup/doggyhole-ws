import { DoggyHoleClient, DoggyHoleServer } from './';

export class DoggyHoleClientEventManager {
  private client: DoggyHoleClient;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  constructor(client: DoggyHoleClient) {
    this.client = client;
  }
  on(eventName: string, handler: Function): DoggyHoleClientEventManager {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    this.eventHandlers.get(eventName)!.add(handler);
    return this;
  }
  off(eventName: string, handler: Function): DoggyHoleClientEventManager {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventName);
      }
    }
    return this;
  }
  send(eventName: string, data: any): void {
    this.client.sendEvent(eventName, data);
  }
  handleIncomingEvent(eventName: string, data: any): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }
  clearAll(): void {
    this.eventHandlers.clear();
  }
}

export class DoggyHoleServerEventManager {
  private server: DoggyHoleServer;
  constructor(server: DoggyHoleServer) {
    this.server = server;
  }
  handleIncomingEvent(fromClient: string, eventName: string, data: any): void {
    this.broadcastToOthers(eventName, data, fromClient);
  }
  private broadcastToOthers(eventName: string, data: any, fromClient: string): void {
    const eventMessage: EventMessage = {
      type: 'event',
      eventName,
      data: { ...data, fromClient }
    };
    const connectedClients = this.server.getConnectedClients();
    for (const [ws, clientData] of connectedClients) {
      if (clientData.name !== fromClient && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(eventMessage));
      }
    }
  }
  broadcast(eventName: string, data: any): void {
    this.broadcastToAll(eventName, data, 'server');
  }
  broadcastToAll(eventName: string, data: any, fromClient: string = 'server'): void {
    const eventMessage: EventMessage = {
      type: 'event',
      eventName,
      data: { ...data, fromClient }
    };
    const connectedClients = this.server.getConnectedClients();
    for (const [ws, _] of connectedClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(eventMessage));
      }
    }
  }
}