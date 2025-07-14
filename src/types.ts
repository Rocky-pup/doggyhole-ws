interface ClientInfo {
  name: string;
  token: string;
}

interface ServerOptions {
  port: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

interface ClientOptions {
  url: string;
  name: string;
  token: string;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  requestTimeout?: number;
}

interface AuthMessage {
  type: 'auth';
  name: string;
  token: string;
}

interface RequestMessage {
  type: 'request';
  id: string;
  functionName: string;
  data: any;
}

interface ClientRequestMessage {
  type: 'client_request';
  id: string;
  functionName: string;
  data: any;
  targetClient: string;
  fromClient?: string;
}

interface ResponseMessage {
  type: 'response';
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  originalFromClient?: string;
}

interface HeartbeatMessage {
  type: 'heartbeat';
}

interface HeartbeatResponseMessage {
  type: 'heartbeat_response';
}

interface EventMessage {
  type: 'event';
  eventName: string;
  data: any;
}

type Message = AuthMessage | RequestMessage | ClientRequestMessage | ResponseMessage | HeartbeatMessage | HeartbeatResponseMessage | EventMessage;