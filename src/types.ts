export interface ClientInfo {
  name: string;
  token: string;
}

export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting'
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface IDoggyHoleError extends Error {
  code: string;
  details?: any;
}


export interface EventSchema {
  eventName: string;
  schema?: any;
  required?: boolean;
}

export interface ClientGroup {
  name: string;
  clients: Set<string>;
  metadata?: Record<string, any>;
}

export interface ServerOptions {
  port: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  maxConnections?: number;
  logLevel?: LogLevel;
  gracefulShutdownTimeout?: number;
  messageQueueSize?: number;
}

export interface ClientOptions {
  url: string;
  name: string;
  token: string;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  requestTimeout?: number;
  logLevel?: LogLevel;
  reconnectBackoffMultiplier?: number;
}

export interface AuthMessage {
  type: 'auth';
  name: string;
  token: string;
}

export interface RequestMessage<T = any> {
  type: 'request';
  id: string;
  functionName: string;
  data: T;
}

export interface ClientRequestMessage<T = any> {
  type: 'client_request';
  id: string;
  functionName: string;
  data: T;
  targetClient: string;
  fromClient?: string;
}

export interface ResponseMessage<T = any> {
  type: 'response';
  id: string;
  success: boolean;
  data?: T;
  error?: string;
  originalFromClient?: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
}

export interface HeartbeatResponseMessage {
  type: 'heartbeat_response';
}

export interface EventMessage<T = any> {
  type: 'event';
  eventName: string;
  data: T;
}

export interface ShutdownMessage {
  type: 'shutdown';
  reason?: string;
  gracePeriod?: number;
}


export type Message = AuthMessage | RequestMessage | ClientRequestMessage | ResponseMessage | HeartbeatMessage | HeartbeatResponseMessage | EventMessage | ShutdownMessage;

export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type RequestHandler<TReq = any, TRes = any> = (data: TReq) => TRes | Promise<TRes>;
export type ErrorHandler = (error: IDoggyHoleError) => void;
export type ConnectionStateHandler = (state: ConnectionState) => void;