# 🐺 DoggyHole WebSocket Library

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
- 🎯 **Dual Event System**: `server.event.on()` for client events, `server.on()` for server lifecycle events
- 🔗 **Connection State Management**: Track and respond to connection state changes
- ⚡ **Structured Logging**: Configurable log levels with contextual information
- 🛑 **Graceful Shutdown**: Properly close connections with notification
- 🔧 **Full TypeScript Support**: Complete type definitions for IDE assistance
- 🚨 **Enhanced Error Handling**: Specific error types with detailed information

## 🚀 Installation

```bash
npm install doggyhole-ws
```

## 🌐 Browser Usage

For browser usage with native HTML + CSS + JavaScript (no bundlers required), check out the complete examples in the [`examples/browser`](./examples/browser) directory:

- **Chat Application** - Real-time chat with multiple users
- **Dashboard** - Live metrics and monitoring 
- **Simple Example** - Basic API demonstration

The browser examples include a standalone `doggyhole-browser.js` client that provides the same API as the Node.js version using native browser WebSocket and EventTarget APIs.

**Quick Start:**
```bash
# Start the test server
cd examples/browser
node test-server.js

# Open examples/browser/chat.html in your browser
```

See [`examples/browser/README.md`](./examples/browser/README.md) for detailed instructions.

## 🎯 Quick Start

### Server Setup

```typescript
import { DoggyHoleServer } from 'doggyhole-ws';

const server = DoggyHoleServer.create({
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
import { DoggyHoleClient } from 'doggyhole-ws';

const client = DoggyHoleClient.create({
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

## 📚 Complete API Reference

### DoggyHoleServer

#### Constructor Options

```typescript
interface ServerOptions {
  port: number;
  heartbeatInterval?: number;     // Default: 1000ms
  heartbeatTimeout?: number;      // Default: 3000ms
  maxConnections?: number;        // Default: 1000
  logLevel?: LogLevel;            // Default: 'info'
  gracefulShutdownTimeout?: number; // Default: 5000ms
  messageQueueSize?: number;      // Default: 100
}
```

#### Static Methods

##### `DoggyHoleServer.create(options: ServerOptions): DoggyHoleServer`
Creates a new server instance.

```typescript
const server = DoggyHoleServer.create({
  port: 8080,
  heartbeatInterval: 1000,
  heartbeatTimeout: 3000
});
```

#### User Management Methods

##### `setUser(name: string, token: string): DoggyHoleServer`
Add an authenticated user to the server.

```typescript
server.setUser('alice', 'alice-secret-token');
server.setUser('bob', 'bob-secret-token');
```

##### `removeUser(name: string): DoggyHoleServer`
Remove a user and disconnect them from the server.

```typescript
server.removeUser('alice');
// Alice will be disconnected automatically
```

#### Request Handler Methods

##### `addHandler(functionName: string, handler: Function): DoggyHoleServer`
Add a request handler function.

```typescript
server.addHandler('getUserProfile', async (data) => {
  const user = await database.getUser(data.userId);
  return {
    name: user.name,
    email: user.email,
    status: 'online'
  };
});

server.addHandler('calculate', (data) => {
  return data.a + data.b;
});
```

##### `removeHandler(functionName: string): DoggyHoleServer`
Remove a request handler.

```typescript
server.removeHandler('getUserProfile');
```

#### Connection Management Methods

##### `getConnectedClients(): Map<WebSocket, { name: string; lastHeartbeat: number }>`
Get all connected clients with their WebSocket connections.

```typescript
const clients = server.getConnectedClients();
console.log(`Connected clients: ${clients.size}`);

for (const [ws, clientData] of clients) {
  console.log(`Client: ${clientData.name}, Last heartbeat: ${clientData.lastHeartbeat}`);
}
```

##### `getConnectedClientNames(): string[]`
Get array of connected client names.

```typescript
const names = server.getConnectedClientNames();
console.log('Connected clients:', names);
// Output: ['alice', 'bob', 'charlie']
```

##### `getLogger(): Logger`
Get the server logger instance.

```typescript
const logger = server.getLogger();
logger.info('Custom log message');
logger.setLevel(LogLevel.DEBUG);
```

##### `isServerShuttingDown(): boolean`
Check if server is in shutdown process.

```typescript
if (server.isServerShuttingDown()) {
  console.log('Server is shutting down');
}
```

##### `async gracefulShutdown(reason?: string): Promise<void>`
Gracefully shutdown the server with client notification.

```typescript
await server.gracefulShutdown('Maintenance required');
```

##### `close(): void`
Immediately close the server and all connections.

```typescript
server.close();
```


#### Server Event Management

DoggyHole Server uses two different event systems:

1. **`server.event.on()` - For client events**: Use this for events sent by clients via `client.event.send()`. These events are broadcast between clients and can be handled server-side.

2. **`server.on()` - For server lifecycle events**: Use this for server-specific events like connections, disconnections, and timeouts.

#### Server Lifecycle Events (use `server.on()`)

The server extends EventEmitter and emits these lifecycle events:

##### `'clientConnected'`
Emitted when a client connects.

```typescript
server.on('clientConnected', (clientName: string) => {
  console.log(`${clientName} joined the pack!`);
  server.broadcastEvent('userJoined', { username: clientName });
});
```

##### `'clientDisconnected'`
Emitted when a client disconnects.

```typescript
server.on('clientDisconnected', (clientName: string) => {
  console.log(`${clientName} left the den...`);
  server.broadcastEvent('userLeft', { username: clientName });
});
```

##### `'clientTimeout'`
Emitted when a client times out.

```typescript
server.on('clientTimeout', (clientName: string) => {
  console.log(`${clientName} timed out`);
  // Clean up user's game state, notify other players
});
```


### DoggyHoleClient

#### Constructor Options

```typescript
interface ClientOptions {
  url: string;
  name: string;
  token: string;
  maxReconnectAttempts?: number;  // Default: 5
  heartbeatInterval?: number;     // Default: 1000ms
  requestTimeout?: number;        // Default: 10000ms
  logLevel?: LogLevel;            // Default: 'info'
  reconnectBackoffMultiplier?: number; // Default: 1.5
}
```

#### Static Methods

##### `DoggyHoleClient.create(options: ClientOptions): DoggyHoleClient`
Create a new client instance.

```typescript
const client = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'alice',
  token: 'alice-secret-token',
  maxReconnectAttempts: 10,
  requestTimeout: 15000
});
```

#### Configuration Methods

##### `setName(name: string): DoggyHoleClient`
Update client name.

```typescript
client.setName('alice-gaming');
```

##### `setToken(token: string): DoggyHoleClient`
Update authentication token.

```typescript
client.setToken('new-secure-token');
```

##### `setUrl(url: string): DoggyHoleClient`
Update server URL.

```typescript
client.setUrl('ws://production-server:8080');
```

#### Connection Methods

##### `connect(): Promise<void>`
Connect to the server.

```typescript
try {
  await client.connect();
  console.log('Connected successfully!');
} catch (error) {
  console.error('Connection failed:', error);
}
```

##### `disconnect(): void`
Disconnect from the server.

```typescript
client.disconnect();
```

##### `isConnected(): boolean`
Check if client is connected.

```typescript
if (client.isConnected()) {
  console.log('Client is connected');
  // Make requests or send events
}
```

##### `getConnectionState(): ConnectionState`
Get the current connection state.

```typescript
const state = client.getConnectionState();
console.log('Connection state:', state); // 'connected', 'connecting', 'disconnected', etc.
```

##### `onStateChange(handler: ConnectionStateHandler): DoggyHoleClient`
Listen for connection state changes.

```typescript
client.onStateChange((newState, oldState) => {
  console.log(`Connection state: ${oldState} -> ${newState}`);
});
```

##### `getLogger(): Logger`
Get the client logger instance.

```typescript
const logger = client.getLogger();
logger.debug('Debug message');
```

#### Request Methods

##### `request(functionName: string, data: any): Promise<any>`
Make a request to the server.

```typescript
try {
  const userProfile = await client.request('getUserProfile', { userId: 123 });
  console.log('User profile:', userProfile);
  
  const mathResult = await client.request('calculate', { a: 5, b: 3 });
  console.log('5 + 3 =', mathResult);
} catch (error) {
  console.error('Request failed:', error);
}
```

##### `requestClient(targetClient: string, functionName: string, data: any): Promise<any>`
Make a request to another client through the server.

```typescript
try {
  const result = await client.requestClient('bob', 'getGameState', { gameId: 456 });
  console.log('Bob\'s game state:', result);
  
  const fileData = await client.requestClient('fileServer', 'getFile', { filename: 'data.json' });
  console.log('File data:', fileData);
} catch (error) {
  console.error('Client request failed:', error);
}
```

#### Handler Methods

##### `addHandler(functionName: string, handler: Function): DoggyHoleClient`
Add a handler for client-to-client requests.

```typescript
client.addHandler('ping', (data) => {
  return { pong: true, timestamp: Date.now() };
});

client.addHandler('getGameState', (data) => {
  return {
    gameId: data.gameId,
    level: 5,
    score: 1250,
    players: ['alice', 'bob']
  };
});

client.addHandler('processData', async (data) => {
  const result = await heavyComputation(data);
  return result;
});
```

##### `removeHandler(functionName: string): DoggyHoleClient`
Remove a client request handler.

```typescript
client.removeHandler('ping');
```

#### Event Methods

##### `sendEvent(eventName: string, data: any): void`
Send an event to all clients through the server.

```typescript
client.sendEvent('userMessage', {
  message: 'Hello everyone!',
  timestamp: Date.now()
});

client.sendEvent('gameMove', {
  gameId: 123,
  move: 'knight-e4',
  player: 'alice'
});
```

#### Client EventEmitter Events

##### `'connected'`
Emitted when successfully connected to server.

```typescript
client.on('connected', () => {
  console.log('Connected to server!');
  // Initialize UI, start sending data, etc.
});
```

##### `'disconnected'`
Emitted when disconnected from server.

```typescript
client.on('disconnected', (code: number, reason: string) => {
  console.log(`Disconnected: ${code} - ${reason}`);
  // Save state, show reconnection UI
});
```

##### `'error'`
Emitted when an error occurs.

```typescript
client.on('error', (error: DoggyHoleError) => {
  console.error('Client error:', error.message);
  console.error('Error code:', error.code);
  // Handle connection errors, authentication failures
});
```

##### `'stateChange'`
Emitted when connection state changes.

```typescript
client.on('stateChange', (newState: ConnectionState, oldState: ConnectionState) => {
  console.log(`Connection state changed: ${oldState} -> ${newState}`);
  // Update UI based on connection state
});
```

##### `'serverShutdown'`
Emitted when server notifies of shutdown.

```typescript
client.on('serverShutdown', (reason: string, gracePeriod: number) => {
  console.log(`Server shutting down: ${reason}`);
  console.log(`Grace period: ${gracePeriod}ms`);
  // Save work, notify user
});
```

### Client Event Manager

Access the client event manager via `client.event`.

#### Event Listening Methods

##### `on(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Listen for events from other clients.

```typescript
client.event.on('userMessage', (data) => {
  console.log(`${data.fromClient}: ${data.message}`);
  updateChatUI(data);
});

client.event.on('gameMove', (data) => {
  console.log(`${data.player} made move: ${data.move}`);
  updateGameBoard(data);
});
```

##### `once(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Listen for an event only once.

```typescript
client.event.once('gameStart', (data) => {
  console.log('Game started!');
  initializeGame(data);
});
```

##### `off(eventName: string, handler?: (...args: any[]) => void): DoggyHoleClientEventManager`
Remove event listener(s).

```typescript
const messageHandler = (data) => console.log(data);
client.event.on('message', messageHandler);

// Remove specific handler
client.event.off('message', messageHandler);

// Remove all handlers for event
client.event.off('message');
```

##### `addListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Alias for `on()`.

```typescript
client.event.addListener('userJoined', (data) => {
  console.log(`${data.username} joined!`);
});
```

##### `removeListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Remove specific event listener.

```typescript
client.event.removeListener('userJoined', joinHandler);
```

##### `removeAllListeners(eventName?: string): DoggyHoleClientEventManager`
Remove all listeners for event or all events.

```typescript
// Remove all listeners for specific event
client.event.removeAllListeners('userMessage');

// Remove all listeners for all events
client.event.removeAllListeners();
```

##### `prependListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Add listener to beginning of listeners array.

```typescript
client.event.prependListener('userMessage', (data) => {
  console.log('This handler runs first!');
});
```

##### `prependOnceListener(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Add one-time listener to beginning of listeners array.

```typescript
client.event.prependOnceListener('gameStart', (data) => {
  console.log('Game starting - this runs first and only once!');
});
```

#### Event Sending Methods

##### `send(eventName: string, data?: any): void`
Send an event to all clients.

```typescript
client.event.send('userMessage', {
  message: 'Hello everyone!',
  timestamp: Date.now()
});
```

##### `broadcast(eventName: string, data?: any): void`
Alias for `send()`.

```typescript
client.event.broadcast('statusUpdate', {
  status: 'online',
  activity: 'coding'
});
```

#### Event Utility Methods

##### `hasListeners(eventName: string): boolean`
Check if there are listeners for an event.

```typescript
if (client.event.hasListeners('userMessage')) {
  console.log('Message handlers are registered');
}
```

##### `getListenerCount(eventName: string): number`
Get number of listeners for an event.

```typescript
const count = client.event.getListenerCount('userMessage');
console.log(`${count} handlers for userMessage`);
```

##### `getEventNames(): string[]`
Get all event names with listeners.

```typescript
const events = client.event.getEventNames();
console.log('Events with listeners:', events);
```

##### `setMaxListeners(max: number): DoggyHoleClientEventManager`
Set maximum listeners per event.

```typescript
client.event.setMaxListeners(50);
```

##### `getMaxListeners(): number`
Get maximum listeners per event.

```typescript
const max = client.event.getMaxListeners();
console.log(`Max listeners: ${max}`);
```

##### `clearAll(): void`
Remove all event listeners.

```typescript
client.event.clearAll();
```

##### `clearEvent(eventName: string): void`
Remove all listeners for specific event.

```typescript
client.event.clearEvent('userMessage');
```

#### Internal Event Methods

##### `onInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Listen for internal event manager events.

```typescript
client.event.onInternal('listenerAdded', (eventName, handler) => {
  console.log(`Listener added for ${eventName}`);
});

client.event.onInternal('handlerError', (eventName, error, handler) => {
  console.error(`Error in ${eventName} handler:`, error);
});
```

##### `offInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Remove internal event listener.

```typescript
client.event.offInternal('listenerAdded', addedHandler);
```

##### `onceInternal(eventName: string, handler: (...args: any[]) => void): DoggyHoleClientEventManager`
Listen for internal event once.

```typescript
client.event.onceInternal('eventReceived', (eventName, data) => {
  console.log(`First event received: ${eventName}`);
});
```

### Server Event Manager

Access the server event manager via `server.event` to handle client events. Use this for events sent by clients via `client.event.send()`.

#### Client Event Handling (use `server.event.on()`)

Handle events sent by clients using `server.event.on()`:

```typescript
// Listen for chat messages from any client
server.event.on('chatMessage', (data) => {
  console.log(`[${data.fromClient}]: ${data.message}`);
  // Process message, store in database, moderate content, etc.
});

// Listen for game moves
server.event.on('gameMove', (data) => {
  console.log(`Player ${data.fromClient} moved ${data.move}`);
  // Validate move, update game state
});

// Listen for user status updates
server.event.on('statusChange', (data) => {
  console.log(`${data.fromClient} is now ${data.status}`);
  // Update user database, notify other systems
});
```

The server event manager has the same API as client event manager but with server-specific functionality.

#### All Client Event Manager Methods Plus:

##### `handleIncomingEvent(fromClient: string, eventName: string, data: any): void`
Handle incoming events from clients (automatically called by server).

```typescript
// This is called automatically when clients send events
// You can override it if needed
server.event.handleIncomingEvent = function(fromClient, eventName, data) {
  console.log(`Event ${eventName} from ${fromClient}`);
  // Custom processing
  this.emit(eventName, {...data, fromClient});
  this.broadcastToOthers(eventName, data, fromClient);
};
```

##### `broadcastToAll(eventName: string, data: any, fromClient?: string): void`
Broadcast event to all connected clients.

```typescript
server.event.broadcastToAll('serverAnnouncement', {
  message: 'Scheduled maintenance complete',
  timestamp: Date.now()
}, 'server');
```

## 🌟 Advanced Usage Examples

### Complete Chat Application

```typescript
// Server
const server = DoggyHoleServer.create({ port: 8080 });

server.setUser('alice', 'alice-token');
server.setUser('bob', 'bob-token');

// Handle chat messages on server-side
server.event.on('chatMessage', (data) => {
  console.log(`[${data.fromClient}]: ${data.message}`);
  // Log to database, moderate content, etc.
});

// Handle user status changes
server.event.on('statusChange', (data) => {
  console.log(`${data.fromClient} is now ${data.status}`);
  // Update user database, notify other systems
});

// Client
const client = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'alice',
  token: 'alice-token'
});

await client.connect();

// Send chat message
client.event.send('chatMessage', {
  message: 'Hello everyone!',
  timestamp: Date.now()
});

// Listen for chat messages
client.event.on('chatMessage', (data) => {
  if (data.fromClient !== 'alice') {
    console.log(`${data.fromClient}: ${data.message}`);
  }
});

// Update status
client.event.send('statusChange', { status: 'online' });
```

### Game Server with Client-to-Client Communication

```typescript
// Game server
const gameServer = DoggyHoleServer.create({ port: 8080 });

gameServer.setUser('player1', 'p1-token');
gameServer.setUser('player2', 'p2-token');

// Handle game events on server
gameServer.event.on('gameMove', (data) => {
  console.log(`Player ${data.fromClient} moved ${data.move}`);
  // Validate move, update game state
});

gameServer.event.on('gameStart', (data) => {
  console.log('Game started!');
  // Initialize game state
});

// Player 1 client
const player1 = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'player1',
  token: 'p1-token'
});

// Add handler for game state requests
player1.addHandler('getGameState', (data) => {
  return {
    position: { x: 10, y: 20 },
    health: 100,
    inventory: ['sword', 'potion']
  };
});

await player1.connect();

// Player 2 client
const player2 = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'player2',
  token: 'p2-token'
});

await player2.connect();

// Player 2 requests Player 1's game state
const player1State = await player2.requestClient('player1', 'getGameState', {});
console.log('Player 1 state:', player1State);

// Send game move
player1.event.send('gameMove', {
  move: 'forward',
  timestamp: Date.now()
});

// Listen for moves
player2.event.on('gameMove', (data) => {
  if (data.fromClient === 'player1') {
    console.log(`Player 1 moved: ${data.move}`);
    // Update game display
  }
});
```

### Microservices Communication

```typescript
// API Gateway Server
const gateway = DoggyHoleServer.create({ port: 8080 });

gateway.setUser('auth-service', 'auth-token');
gateway.setUser('user-service', 'user-token');
gateway.setUser('order-service', 'order-token');

// Handle service events
gateway.event.on('userRegistered', (data) => {
  console.log(`New user registered: ${data.userId}`);
  // Notify other services, update metrics
});

gateway.event.on('orderCreated', (data) => {
  console.log(`Order created: ${data.orderId}`);
  // Process order, send notifications
});

// Auth Service Client
const authService = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'auth-service',
  token: 'auth-token'
});

authService.addHandler('validateToken', (data) => {
  // Validate JWT token
  return { valid: true, userId: 123 };
});

await authService.connect();

// User Service Client
const userService = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'user-service',
  token: 'user-token'
});

userService.addHandler('getUserProfile', (data) => {
  return {
    userId: data.userId,
    name: 'John Doe',
    email: 'john@example.com'
  };
});

await userService.connect();

// Order Service Client
const orderService = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'order-service',
  token: 'order-token'
});

await orderService.connect();

// Order service validates token with auth service
const tokenValidation = await orderService.requestClient('auth-service', 'validateToken', {
  token: 'jwt-token-here'
});

if (tokenValidation.valid) {
  // Get user profile from user service
  const userProfile = await orderService.requestClient('user-service', 'getUserProfile', {
    userId: tokenValidation.userId
  });
  
  // Create order and notify
  orderService.event.send('orderCreated', {
    orderId: 'ORDER-123',
    userId: userProfile.userId,
    items: ['item1', 'item2']
  });
}
```

### Real-time Monitoring Dashboard

```typescript
// Monitoring Server
const monitor = DoggyHoleServer.create({ port: 8080 });

monitor.setUser('web-dashboard', 'dashboard-token');
monitor.setUser('mobile-app', 'mobile-token');
monitor.setUser('system-monitor', 'system-token');

// Track system metrics
monitor.event.on('cpuUsage', (data) => {
  console.log(`CPU: ${data.percentage}% from ${data.fromClient}`);
  if (data.percentage > 90) {
    // Send alert
    monitor.event.broadcast('alert', {
      type: 'high-cpu',
      message: 'High CPU usage detected',
      value: data.percentage
    });
  }
});

monitor.event.on('memoryUsage', (data) => {
  console.log(`Memory: ${data.used}MB/${data.total}MB`);
});

// System Monitor Client
const systemMonitor = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'system-monitor',
  token: 'system-token'
});

await systemMonitor.connect();

// Send metrics periodically
setInterval(() => {
  systemMonitor.event.send('cpuUsage', {
    percentage: Math.random() * 100,
    timestamp: Date.now()
  });
  
  systemMonitor.event.send('memoryUsage', {
    used: Math.random() * 8000,
    total: 8000,
    timestamp: Date.now()
  });
}, 5000);

// Dashboard Client
const dashboard = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'web-dashboard',
  token: 'dashboard-token'
});

await dashboard.connect();

// Listen for metrics
dashboard.event.on('cpuUsage', (data) => {
  updateCpuChart(data);
});

dashboard.event.on('memoryUsage', (data) => {
  updateMemoryChart(data);
});

dashboard.event.on('alert', (data) => {
  showAlert(data);
});
```

## 🔧 Error Handling & TypeScript Support

### Error Types

DoggyHole provides specific error types for better error handling:

```typescript
import { 
  DoggyHoleError,
  AuthenticationError,
  ConnectionError,
  TimeoutError,
  HandlerNotFoundError,
  ClientNotFoundError,
  NetworkError
} from 'doggyhole-ws';

// All errors extend DoggyHoleError with additional context
try {
  await client.request('nonexistent', {});
} catch (error) {
  if (error instanceof HandlerNotFoundError) {
    console.log('Handler not found:', error.message);
    console.log('Function name:', error.details?.functionName);
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out after:', error.details?.timeout, 'ms');
  }
}
```

### TypeScript Support

Full generic type support for requests and events:

```typescript
interface UserData {
  id: number;
  name: string;
}

interface UserResponse {
  user: UserData;
  status: string;
}

// Typed request handlers
server.addHandler<{ userId: number }, UserResponse>('getUser', async (data) => {
  // data is typed as { userId: number }
  return {
    user: { id: data.userId, name: 'John' },
    status: 'active'
  }; // Return type is validated as UserResponse
});

// Typed client requests
const response = await client.request<{ userId: number }, UserResponse>('getUser', { userId: 123 });
// response is typed as UserResponse

// Typed events
client.event.on('userUpdate', (data: UserData) => {
  // data is typed as UserData
  console.log('User updated:', data.name);
});

client.sendEvent<UserData>('userUpdate', { id: 1, name: 'Jane' });
```

### Connection State Management

```typescript
import { ConnectionState } from 'doggyhole-ws';

client.onStateChange((newState, oldState) => {
  switch (newState) {
    case ConnectionState.CONNECTING:
      showConnectingSpinner();
      break;
    case ConnectionState.CONNECTED:
      hideSpinner();
      enableFeatures();
      break;
    case ConnectionState.RECONNECTING:
      showReconnectingMessage();
      break;
    case ConnectionState.DISCONNECTED:
      disableFeatures();
      break;
  }
});
```


### Comprehensive Error Handling

```typescript
// Server error handling
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Client error handling
client.on('error', (error) => {
  console.error('Client error:', error);
  // Handle different error types
  if (error.message.includes('authentication')) {
    // Handle auth errors
    refreshToken();
  }
});

client.on('disconnected', (code, reason) => {
  console.log(`Disconnected: ${code} - ${reason}`);
  // Handle reconnection based on reason
  if (code === 1008) {
    // Authentication error
    updateCredentials();
  }
});

// Request error handling
try {
  const result = await client.request('someFunction', data);
} catch (error) {
  if (error.message === 'Handler not found') {
    console.log('Function not available on server');
  } else if (error.message === 'Request timeout') {
    console.log('Request took too long');
  }
}

// Event handler error handling
client.event.onInternal('handlerError', (eventName, error, handler) => {
  console.error(`Error in ${eventName} handler:`, error);
  // Log error, notify monitoring system
});
```


## 🏗️ Architecture

DoggyHole uses a hub-and-spoke model where:

1. **Server** acts as the central hub managing all connections
2. **Clients** connect to the server with token authentication
3. **Direct client requests** are routed through the server
4. **Events** can be broadcast to all clients or processed server-side
5. **Heartbeat system** maintains connection health
6. **EventEmitter-like API** for both client and server event handling

## 🔧 Performance Tips

### High-Performance Configuration

```typescript
// Server optimized for high throughput
const server = DoggyHoleServer.create({
  port: 8080,
  heartbeatInterval: 30000,     // 30 seconds
  heartbeatTimeout: 60000,      // 1 minute
  maxConnections: 10000,        // High connection limit
  logLevel: LogLevel.WARN       // Reduce logging overhead
});

// Client optimized for reliability
const client = DoggyHoleClient.create({
  url: 'ws://localhost:8080',
  name: 'client',
  token: 'token',
  maxReconnectAttempts: 10,
  requestTimeout: 30000,
  heartbeatInterval: 30000,
  reconnectBackoffMultiplier: 1.2, // Faster reconnection
  logLevel: LogLevel.ERROR      // Minimal logging
});

// Batch events for better performance
const events = ['event1', 'event2', 'event3'];
events.forEach(eventName => {
  client.sendEvent(eventName, { timestamp: Date.now() });
});
```

## 🤝 Contributing

We welcome contributions to make DoggyHole even more pawsome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📄 License

MIT License - Feel free to use in your projects!

## 🐾 Support

Having trouble? Create an issue on GitHub or join our community chat!

---

*Made with 💙 by the DoggyHole pack - Building cozy connections, one WebSocket at a time!*