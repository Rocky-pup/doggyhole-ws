# 🌐 DoggyHole Browser Examples

This directory contains browser-compatible examples for using DoggyHole WebSocket library in regular HTML + CSS + JavaScript without any bundlers or frameworks.

## 📁 Files

- **`doggyhole-browser.js`** - Browser-compatible client library (no dependencies)
- **`chat.html`** - Complete chat application example
- **`dashboard.html`** - Real-time dashboard example
- **`simple-example.html`** - Basic usage demonstration
- **`test-server.js`** - Node.js test server for examples
- **`README.md`** - This file

## 🚀 Quick Start

### 1. Build the Library (if needed)

If you cloned the repository, build the library first:

```bash
npm install
npm run build
```

### 2. Start the Test Server

```bash
cd examples/browser
node test-server.js
```

This will start a DoggyHole server on `ws://localhost:8080` with pre-configured test users.

### 3. Open Examples in Browser

Open any of the HTML files in your browser:

- **Chat Example**: Open `chat.html` in multiple browser tabs/windows
- **Dashboard Example**: Open `dashboard.html` to see real-time metrics
- **Simple Example**: Open `simple-example.html` for basic testing

## 🎮 Chat Example (`chat.html`)

A complete chat application demonstrating:
- User authentication with tokens
- Real-time messaging
- Connection state management
- Auto-reconnection
- System notifications

**How to use:**
1. Open `chat.html` in multiple browser tabs
2. Use different usernames (alice, bob, charlie)
3. Use corresponding tokens (alice-token, bob-token, charlie-token)
4. Start chatting!

## 📊 Dashboard Example (`dashboard.html`)

A real-time monitoring dashboard showing:
- CPU and memory metrics
- Active user counts
- Request rates
- System logs
- Connection status

**Features:**
- Real-time metric updates
- Browser notifications for alerts
- Test data generation
- Connection management

## 🧪 Simple Example (`simple-example.html`)

A basic example demonstrating all core features:
- Connection management
- Server requests
- Client-to-client requests
- Event broadcasting
- Handler registration
- Real-time logging

## 🔧 Browser Client API

The `doggyhole-browser.js` provides a browser-compatible API that mimics the Node.js DoggyHole client:

```javascript
// Create client
const client = DoggyHoleBrowserClient.create({
    url: 'ws://localhost:8080',
    name: 'client-name',
    token: 'client-token',
    maxReconnectAttempts: 5,
    requestTimeout: 10000
});

// Connect
await client.connect();

// Make server requests
const result = await client.request('functionName', { data: 'value' });

// Make client-to-client requests
const result = await client.requestClient('targetClient', 'functionName', data);

// Send events
client.sendEvent('eventName', { message: 'Hello!' });

// Listen for events
client.on('eventName', (data) => {
    console.log('Received event:', data);
});

// Add handlers for incoming requests
client.addHandler('ping', (data) => {
    return { pong: true, timestamp: Date.now() };
});

// Connection events
client.addEventListener('connected', () => console.log('Connected!'));
client.addEventListener('disconnected', (event) => console.log('Disconnected:', event.detail));
```

## 🛠️ Test Server

The `test-server.js` provides:

### Pre-configured Users
- `client1` / `secret-token-1`
- `client2` / `secret-token-2`
- `alice` / `alice-token`
- `bob` / `bob-token`
- `charlie` / `charlie-token`
- `dashboard-client` / `dashboard-secret-token`

### Server Handlers
- `greet(data)` - Returns greeting message
- `echo(data)` - Echoes back the data
- `getTime()` - Returns current server time
- `calculate(data)` - Performs math operations

### Auto-Generated Events
- System metrics every 10 seconds
- User join/leave notifications
- Chat message broadcasting

## 🌐 Serving Files

### Option 1: Simple HTTP Server (Python)
```bash
# In the browser examples directory
python -m http.server 8000
# Then open http://localhost:8000/chat.html
```

### Option 2: Simple HTTP Server (Node.js)
```bash
npx http-server
# Then open http://localhost:8080/chat.html
```

### Option 3: File Protocol
You can also open the HTML files directly in your browser using `file://` protocol, but some features may be limited.

## 🔒 Security Notes

- The examples use unencrypted WebSocket (`ws://`) for simplicity
- In production, use secure WebSocket (`wss://`) with proper SSL certificates
- Implement proper token validation on the server side
- Validate and sanitize all user inputs

## 🐛 Troubleshooting

### Connection Issues
- Make sure the test server is running on port 8080
- Check browser console for error messages
- Verify the correct username/token combinations

### CORS Issues
- Serve the HTML files through an HTTP server, not file:// protocol
- Ensure your WebSocket server allows browser connections

### Browser Compatibility
- Modern browsers support WebSocket natively
- EventTarget API is supported in all modern browsers
- For older browsers, consider polyfills

## 📚 Learning Resources

1. Start with `simple-example.html` to understand the basics
2. Explore `chat.html` for real-time communication patterns
3. Check `dashboard.html` for metric monitoring examples
4. Review `doggyhole-browser.js` to understand the implementation

## 🤝 Contributing

Feel free to improve these examples or add new ones! The browser client implementation aims to be as close as possible to the Node.js API while using only browser-native features.