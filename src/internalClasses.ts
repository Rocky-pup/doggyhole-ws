import { EventEmitter } from 'events';
import WebSocket from 'ws';

interface DoggyHoleClientInterface {
  sendEvent(eventName: string, data?: any): void;
}

interface DoggyHoleServerInterface {
  getConnectedClients(): Map<WebSocket, { name: string; lastHeartbeat: number }>;
}

export class DoggyHoleClientEventManager {
  private client: DoggyHoleClientInterface;
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private onceHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private maxListeners: number = 10;
  private internalEmitter: EventEmitter = new EventEmitter();
  
  constructor(client: DoggyHoleClientInterface) {
    this.client = client;
  }
  
  on(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    if (!eventName || typeof eventName !== 'string') {
      throw new Error('Event name must be a non-empty string');
    }
    if (!handler || typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    
    const handlers = this.eventHandlers.get(eventName)!;
    
    if (handlers.size >= this.maxListeners) {
      console.warn(`Maximum listeners (${this.maxListeners}) exceeded for event '${eventName}'`);
    }
    
    handlers.add(handler);
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  once(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    if (!eventName || typeof eventName !== 'string') {
      throw new Error('Event name must be a non-empty string');
    }
    if (!handler || typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    
    if (!this.onceHandlers.has(eventName)) {
      this.onceHandlers.set(eventName, new Set());
    }
    
    this.onceHandlers.get(eventName)!.add(handler);
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  off(eventName: string, handler?: (...args: any[]) => void): DoggyHoleClientEventManager {
    if (!handler) {
      this.eventHandlers.delete(eventName);
      this.onceHandlers.delete(eventName);
      this.internalEmitter.emit('allListenersRemoved', eventName);
      return this;
    }
    
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventName);
      }
    }
    
    const onceHandlers = this.onceHandlers.get(eventName);
    if (onceHandlers) {
      onceHandlers.delete(handler);
      if (onceHandlers.size === 0) {
        this.onceHandlers.delete(eventName);
      }
    }
    
    this.internalEmitter.emit('listenerRemoved', eventName, handler);
    return this;
  }
  
  send(eventName: string, data?: any): void {
    if (!eventName || typeof eventName !== 'string') {
      throw new Error('Event name must be a non-empty string');
    }
    this.client.sendEvent(eventName, data);
  }
  
  broadcast(eventName: string, data?: any): void {
    this.send(eventName, data);
  }
  
  handleIncomingEvent(eventName: string, data: any, fromClient?: string): void {
    const handlers = this.eventHandlers.get(eventName);
    const onceHandlers = this.onceHandlers.get(eventName);
    
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data, fromClient);
        } catch (error) {
          console.error(`Error in event handler for '${eventName}':`, error);
          this.internalEmitter.emit('handlerError', eventName, error, handler);
        }
      });
    }
    
    if (onceHandlers) {
      const handlersToRemove = Array.from(onceHandlers);
      onceHandlers.clear();
      
      if (onceHandlers.size === 0) {
        this.onceHandlers.delete(eventName);
      }
      
      handlersToRemove.forEach(handler => {
        try {
          handler(data, fromClient);
        } catch (error) {
          console.error(`Error in once event handler for '${eventName}':`, error);
          this.internalEmitter.emit('handlerError', eventName, error, handler);
        }
      });
    }
    
    this.internalEmitter.emit('eventReceived', eventName, data, fromClient);
  }
  
  hasListeners(eventName: string): boolean {
    return this.eventHandlers.has(eventName) || this.onceHandlers.has(eventName);
  }
  
  getListenerCount(eventName: string): number {
    const regularCount = this.eventHandlers.get(eventName)?.size || 0;
    const onceCount = this.onceHandlers.get(eventName)?.size || 0;
    return regularCount + onceCount;
  }
  
  getEventNames(): string[] {
    const regularEvents = Array.from(this.eventHandlers.keys());
    const onceEvents = Array.from(this.onceHandlers.keys());
    return [...new Set([...regularEvents, ...onceEvents])];
  }
  
  setMaxListeners(max: number): DoggyHoleClientEventManager {
    this.maxListeners = Math.max(0, max);
    return this;
  }
  
  getMaxListeners(): number {
    return this.maxListeners;
  }
  
  clearAll(): void {
    const eventNames = this.getEventNames();
    this.eventHandlers.clear();
    this.onceHandlers.clear();
    eventNames.forEach(eventName => this.internalEmitter.emit('allListenersRemoved', eventName));
  }
  
  clearEvent(eventName: string): void {
    this.eventHandlers.delete(eventName);
    this.onceHandlers.delete(eventName);
    this.internalEmitter.emit('allListenersRemoved', eventName);
  }
  
  prependListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    
    const handlers = this.eventHandlers.get(eventName)!;
    const oldHandlers = Array.from(handlers);
    handlers.clear();
    handlers.add(handler);
    oldHandlers.forEach(h => handlers.add(h));
    
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  prependOnceListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    if (!this.onceHandlers.has(eventName)) {
      this.onceHandlers.set(eventName, new Set());
    }
    
    const handlers = this.onceHandlers.get(eventName)!;
    const oldHandlers = Array.from(handlers);
    handlers.clear();
    handlers.add(handler);
    oldHandlers.forEach(h => handlers.add(h));
    
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  addListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    return this.on(eventName, handler);
  }
  
  removeListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    return this.off(eventName, handler);
  }
  
  removeAllListeners(eventName?: string): DoggyHoleClientEventManager {
    if (eventName) {
      this.clearEvent(eventName);
    } else {
      this.clearAll();
    }
    return this;
  }
  
  onInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    this.internalEmitter.on(eventName, handler);
    return this;
  }
  
  offInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    this.internalEmitter.off(eventName, handler);
    return this;
  }
  
  onceInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager {
    this.internalEmitter.once(eventName, handler);
    return this;
  }
}

export class DoggyHoleServerEventManager {
  private server: DoggyHoleServerInterface;
  private eventHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private onceHandlers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private maxListeners: number = 10;
  private internalEmitter: EventEmitter = new EventEmitter();
  
  constructor(server: DoggyHoleServerInterface) {
    this.server = server;
  }
  
  on(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    if (!eventName || typeof eventName !== 'string') {
      throw new Error('Event name must be a non-empty string');
    }
    if (!handler || typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    
    const handlers = this.eventHandlers.get(eventName)!;
    
    if (handlers.size >= this.maxListeners) {
      console.warn(`Maximum listeners (${this.maxListeners}) exceeded for event '${eventName}'`);
    }
    
    handlers.add(handler);
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  once(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    if (!this.onceHandlers.has(eventName)) {
      this.onceHandlers.set(eventName, new Set());
    }
    
    this.onceHandlers.get(eventName)!.add(handler);
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  off(eventName: string, handler?: (...args: any[]) => void): DoggyHoleServerEventManager {
    if (!handler) {
      this.eventHandlers.delete(eventName);
      this.onceHandlers.delete(eventName);
      this.internalEmitter.emit('allListenersRemoved', eventName);
      return this;
    }
    
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventName);
      }
    }
    
    const onceHandlers = this.onceHandlers.get(eventName);
    if (onceHandlers) {
      onceHandlers.delete(handler);
      if (onceHandlers.size === 0) {
        this.onceHandlers.delete(eventName);
      }
    }
    
    this.internalEmitter.emit('listenerRemoved', eventName, handler);
    return this;
  }
  
  emit(eventName: string, data?: any, fromClient?: string): boolean {
    const handlers = this.eventHandlers.get(eventName);
    const onceHandlers = this.onceHandlers.get(eventName);
    
    let hasListeners = false;
    
    if (handlers) {
      hasListeners = true;
      handlers.forEach(handler => {
        try {
          handler(data, fromClient);
        } catch (error) {
          console.error(`Error in event handler for '${eventName}':`, error);
          this.internalEmitter.emit('handlerError', eventName, error, handler);
        }
      });
    }
    
    if (onceHandlers) {
      hasListeners = true;
      const handlersToRemove = Array.from(onceHandlers);
      onceHandlers.clear();
      
      if (onceHandlers.size === 0) {
        this.onceHandlers.delete(eventName);
      }
      
      handlersToRemove.forEach(handler => {
        try {
          handler(data, fromClient);
        } catch (error) {
          console.error(`Error in once event handler for '${eventName}':`, error);
          this.internalEmitter.emit('handlerError', eventName, error, handler);
        }
      });
    }
    
    this.internalEmitter.emit('eventEmitted', eventName, data, fromClient);
    return hasListeners;
  }
  
  send(eventName: string, data?: any): void {
    this.broadcast(eventName, data);
  }
  
  handleIncomingEvent(fromClient: string, eventName: string, data: any): void {
    this.emit(eventName, data, fromClient);
    this.broadcastToOthers(eventName, data, fromClient);
  }
  
  private broadcastToOthers(eventName: string, data: any, fromClient: string): void {
    const eventMessage: any = {
      type: 'event',
      eventName,
      data: { ...data, fromClient },
      fromClient
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
    const eventMessage: any = {
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
  
  hasListeners(eventName: string): boolean {
    return this.eventHandlers.has(eventName) || this.onceHandlers.has(eventName);
  }
  
  getListenerCount(eventName: string): number {
    const regularCount = this.eventHandlers.get(eventName)?.size || 0;
    const onceCount = this.onceHandlers.get(eventName)?.size || 0;
    return regularCount + onceCount;
  }
  
  getEventNames(): string[] {
    const regularEvents = Array.from(this.eventHandlers.keys());
    const onceEvents = Array.from(this.onceHandlers.keys());
    return [...new Set([...regularEvents, ...onceEvents])];
  }
  
  setMaxListeners(max: number): DoggyHoleServerEventManager {
    this.maxListeners = Math.max(0, max);
    return this;
  }
  
  getMaxListeners(): number {
    return this.maxListeners;
  }
  
  clearAll(): void {
    const eventNames = this.getEventNames();
    this.eventHandlers.clear();
    this.onceHandlers.clear();
    eventNames.forEach(eventName => this.internalEmitter.emit('allListenersRemoved', eventName));
  }
  
  clearEvent(eventName: string): void {
    this.eventHandlers.delete(eventName);
    this.onceHandlers.delete(eventName);
    this.internalEmitter.emit('allListenersRemoved', eventName);
  }
  
  prependListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    
    const handlers = this.eventHandlers.get(eventName)!;
    const oldHandlers = Array.from(handlers);
    handlers.clear();
    handlers.add(handler);
    oldHandlers.forEach(h => handlers.add(h));
    
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  prependOnceListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    if (!this.onceHandlers.has(eventName)) {
      this.onceHandlers.set(eventName, new Set());
    }
    
    const handlers = this.onceHandlers.get(eventName)!;
    const oldHandlers = Array.from(handlers);
    handlers.clear();
    handlers.add(handler);
    oldHandlers.forEach(h => handlers.add(h));
    
    this.internalEmitter.emit('listenerAdded', eventName, handler);
    return this;
  }
  
  addListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    return this.on(eventName, handler);
  }
  
  removeListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    return this.off(eventName, handler);
  }
  
  removeAllListeners(eventName?: string): DoggyHoleServerEventManager {
    if (eventName) {
      this.clearEvent(eventName);
    } else {
      this.clearAll();
    }
    return this;
  }
  
  onInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    this.internalEmitter.on(eventName, handler);
    return this;
  }
  
  offInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    this.internalEmitter.off(eventName, handler);
    return this;
  }
  
  onceInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleServerEventManager {
    this.internalEmitter.once(eventName, handler);
    return this;
  }
}