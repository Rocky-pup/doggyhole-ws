# 🐺 FoxHole WebSocket Library

A floofy, feature-rich WebSocket library for Node.js that makes real-time communication as cozy as a den! Perfect for building snuggly client-server applications with peer-to-peer capabilities.

## ✨ Features

- 🦊 **Easy Server Setup**: Create WebSocket servers with minimal configuration
- 🐺 **Smart Client Management**: Built-in authentication, heartbeat monitoring, and reconnection
- 🏠 **Peer-to-Peer Requests**: Clients can directly request from other clients through the server
- 📡 **Event Broadcasting**: Real-time event system for all your pack communication needs
- 💝 **Handler System**: Register custom request handlers on both server and clients
- 🔄 **Auto-Reconnection**: Clients automatically reconnect with exponential backoff
- 💓 **Heartbeat System**: Keep connections alive and detect timeouts
- 🛡️ **Token Authentication**: Secure your den with token-based auth

## 🚀 Installation

```bash
npm install foxhole-ws
```

## 🎯 Quick Start

### Server Setup

```typescript
import { FoxHoleServer } from 'foxhole-ws';

const server = FoxHoleServer.create({
  port: 8080,
  heartbeatInterval: 1000,
  heartbeatTimeout: 3000
});

server.setUser('client1', 'secret-token-1');
server.setUser('client2', 'secret-token-2');

server.addHandler('greet', (data) => {
  return `Hello ${data.name}!`;
});

server.on('clientConnected', (clientName) => {
  console.log(`${clientName} joined the pack!`);
});

server.on('clientDisconnected', (clientName) => {
  console.log(`${clientName} left the den...`);
});
```

### Client Setup

```typescript
import { FoxHoleClient } from 'foxhole-ws';

const client = FoxHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'client1',
  token: 'secret-token-1',
  maxReconnectAttempts: 5,
  requestTimeout: 10000
});

await client.connect();

const response = await client.request('greet', { name: 'Fluffy' });
console.log(response);
```

## 📚 API Reference

### FoxHoleServer

#### Constructor Options

```typescript
interface ServerOptions {
  port: number;
  heartbeatInterval?: number;    // Default: 1000ms
  heartbeatTimeout?: number;     // Default: 3000ms
}
```

#### Methods

- `setUser(name: string, token: string): FoxHoleServer` - Add authenticated user
- `removeUser(name: string): FoxHoleServer` - Remove user and disconnect them
- `addHandler(functionName: string, handler: Function): FoxHoleServer` - Add request handler
- `removeHandler(functionName: string): FoxHoleServer` - Remove request handler
- `getConnectedClients(): Map<WebSocket, ClientData>` - Get connected clients
- `getConnectedClientNames(): string[]` - Get list of connected client names
- `close(): void` - Close server

#### Events

- `clientConnected(clientName: string)` - When a client connects
- `clientDisconnected(clientName: string)` - When a client disconnects
- `clientTimeout(clientName: string)` - When a client times out

### FoxHoleClient

#### Constructor Options

```typescript
interface ClientOptions {
  url: string;
  name: string;
  token: string;
  maxReconnectAttempts?: number;  // Default: 5
  heartbeatInterval?: number;     // Default: 1000ms
  requestTimeout?: number;        // Default: 10000ms
}
```

#### Methods

- `connect(): Promise<void>` - Connect to server
- `disconnect(): void` - Disconnect from server
- `request(functionName: string, data: any): Promise<any>` - Make server request
- `requestClient(targetClient: string, functionName: string, data: any): Promise<any>` - Request from another client
- `addHandler(functionName: string, handler: Function): FoxHoleClient` - Add client request handler
- `removeHandler(functionName: string): FoxHoleClient` - Remove client request handler
- `sendEvent(eventName: string, data: any): void` - Send event
- `isConnected(): boolean` - Check connection status

#### Events

- `disconnected(code: number, reason: string)` - When disconnected
- `error(error: Error)` - When error occurs

## 🌟 Advanced Usage

### Client-to-Client Communication

```typescript
const client1 = FoxHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'calculator',
  token: 'token1'
});

const client2 = FoxHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'user',
  token: 'token2'
});

client1.addHandler('add', (data) => {
  return data.a + data.b;
});

client1.addHandler('multiply', (data) => {
  return data.a * data.b;
});

await client1.connect();
await client2.connect();

const sum = await client2.requestClient('calculator', 'add', { a: 5, b: 3 });
const product = await client2.requestClient('calculator', 'multiply', { a: 4, b: 7 });

console.log(`Sum: ${sum}, Product: ${product}`);
```

### Event Broadcasting

```typescript
client.event.on('userJoined', (data) => {
  console.log(`${data.username} joined the chat!`);
});

client.event.send('userJoined', { username: 'FluffyWolf' });

server.event.broadcast('announcement', { 
  message: 'Server maintenance in 5 minutes!' 
});
```

### Custom Server Handlers

```typescript
server.addHandler('getUserData', async (data) => {
  const user = await database.getUser(data.userId);
  return {
    name: user.name,
    level: user.level,
    online: true
  };
});

server.addHandler('saveGame', async (data) => {
  await database.saveGameState(data.userId, data.gameState);
  return { success: true, timestamp: Date.now() };
});
```

### Error Handling

```typescript
client.on('error', (error) => {
  console.error('Connection error:', error);
});

client.on('disconnected', (code, reason) => {
  console.log(`Disconnected: ${code} - ${reason}`);
});

try {
  const result = await client.request('nonexistent', {});
} catch (error) {
  console.error('Request failed:', error.message);
}
```

## 🏗️ Architecture

FoxHole uses a hub-and-spoke model where:

1. **Server** acts as the central hub managing all connections
2. **Clients** connect to the server with token authentication
3. **Direct client requests** are routed through the server
4. **Events** can be broadcast to all clients or specific targets
5. **Heartbeat system** maintains connection health

## 🔧 Configuration Examples

### High-Performance Server

```typescript
const server = FoxHoleServer.create({
  port: 8080,
  heartbeatInterval: 500,
  heartbeatTimeout: 1500
});
```

### Reliable Client

```typescript
const client = FoxHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'reliable-client',
  token: 'secure-token',
  maxReconnectAttempts: 10,
  requestTimeout: 5000,
  heartbeatInterval: 500
});
```

## 🤝 Contributing

We welcome contributions to make FoxHole even more pawsome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

MIT License - Feel free to use in your projects!

## 🐾 Support

Having trouble? Create an issue on GitHub or join our community chat!

---

*Made with 💙 by the FoxHole pack - Building cozy connections, one WebSocket at a time!*