/**
 * Test server for DoggyHole browser examples
 * Run this with Node.js to test the browser examples
 * 
 * Usage: node test-server.js
 */

// Import the DoggyHole server (you'll need to install the package or build it first)
// const { DoggyHoleServer } = require('../../dist/index.js');

// For testing without building, you can use this simple mock:
const { DoggyHoleServer } = (() => {
    try {
        return require('../../dist/index.js');
    } catch (e) {
        console.log('Package not built yet. Please run "npm run build" first.');
        console.log('Or install the package: npm install doggyhole-ws');
        process.exit(1);
    }
})();

console.log('🐺 Starting DoggyHole test server...');

// Create server
const server = DoggyHoleServer.create({
    port: 8080,
    heartbeatInterval: 5000,
    heartbeatTimeout: 10000
});

// Add test users
server.setUser('client1', 'secret-token-1');
server.setUser('client2', 'secret-token-2');
server.setUser('alice', 'alice-token');
server.setUser('bob', 'bob-token');
server.setUser('charlie', 'charlie-token');
server.setUser('dashboard-client', 'dashboard-secret-token');

// Add server handlers
server.addHandler('greet', (data) => {
    console.log('Greet handler called with:', data);
    return `Hello ${data.name || 'Anonymous'}! Welcome to the pack! 🐺`;
});

server.addHandler('echo', (data) => {
    console.log('Echo handler called with:', data);
    return {
        echo: data,
        timestamp: Date.now(),
        server: 'DoggyHole Test Server'
    };
});

server.addHandler('getTime', () => {
    return {
        time: new Date().toISOString(),
        timestamp: Date.now()
    };
});

server.addHandler('calculate', (data) => {
    console.log('Calculate handler called with:', data);
    const { a, b, operation = 'add' } = data;
    
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Both a and b must be numbers');
    }
    
    let result;
    switch (operation) {
        case 'add':
            result = a + b;
            break;
        case 'subtract':
            result = a - b;
            break;
        case 'multiply':
            result = a * b;
            break;
        case 'divide':
            if (b === 0) throw new Error('Division by zero');
            result = a / b;
            break;
        default:
            throw new Error('Unknown operation');
    }
    
    return {
        operation,
        a,
        b,
        result,
        timestamp: Date.now()
    };
});

// Server lifecycle events
server.on('clientConnected', (clientName) => {
    console.log(`🎉 ${clientName} joined the pack!`);
    
    // Notify other clients about new user
    server.event.broadcastToAll('userJoined', {
        username: clientName,
        timestamp: Date.now()
    });
});

server.on('clientDisconnected', (clientName) => {
    console.log(`👋 ${clientName} left the pack...`);
    
    // Notify other clients about user leaving
    server.event.broadcastToAll('userLeft', {
        username: clientName,
        timestamp: Date.now()
    });
});

server.on('clientTimeout', (clientName) => {
    console.log(`⏱️  ${clientName} timed out`);
});

// Handle client events
server.event.on('chatMessage', (data) => {
    console.log(`💬 [${data.fromClient}]: ${data.message}`);
    // Echo chat messages to all clients (this happens automatically)
});

server.event.on('testEvent', (data) => {
    console.log(`🧪 Test event from ${data.fromClient}:`, data);
});

// Handle dashboard metric events
server.event.on('cpuMetric', (data) => {
    console.log(`📊 CPU: ${data.usage?.toFixed(1)}% from ${data.fromClient}`);
    
    // Broadcast to dashboard clients
    server.event.broadcastToAll('cpuMetric', {
        ...data,
        serverTimestamp: Date.now()
    });
});

server.event.on('memoryMetric', (data) => {
    console.log(`🧠 Memory: ${data.used}MB/${data.total}MB from ${data.fromClient}`);
    
    // Broadcast to dashboard clients
    server.event.broadcastToAll('memoryMetric', {
        ...data,
        serverTimestamp: Date.now()
    });
});

server.event.on('userMetric', (data) => {
    console.log(`👥 Users: ${data.count} from ${data.fromClient}`);
    
    // Broadcast to dashboard clients
    server.event.broadcastToAll('userMetric', {
        ...data,
        serverTimestamp: Date.now()
    });
});

server.event.on('requestMetric', (data) => {
    console.log(`📈 Requests/sec: ${data.perSecond} from ${data.fromClient}`);
    
    // Broadcast to dashboard clients
    server.event.broadcastToAll('requestMetric', {
        ...data,
        serverTimestamp: Date.now()
    });
});

// Error handling
server.on('error', (error) => {
    console.error('❌ Server error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server gracefully...');
    await server.gracefulShutdown('Server shutdown requested');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down server gracefully...');
    await server.gracefulShutdown('Server shutdown requested');
    process.exit(0);
});

console.log('🚀 Server is running on ws://localhost:8080');
console.log('📝 Available test users:');
console.log('   - client1 (token: secret-token-1)');
console.log('   - client2 (token: secret-token-2)');
console.log('   - alice (token: alice-token)');
console.log('   - bob (token: bob-token)');
console.log('   - charlie (token: charlie-token)');
console.log('   - dashboard-client (token: dashboard-secret-token)');
console.log('');
console.log('🌐 Open these files in your browser:');
console.log('   - chat.html (for chat example)');
console.log('   - dashboard.html (for dashboard example)');
console.log('   - simple-example.html (for basic testing)');
console.log('');
console.log('🛑 Press Ctrl+C to stop the server');

// Send periodic test data for dashboard
setInterval(() => {
    // Simulate system metrics
    server.event.broadcastToAll('cpuMetric', {
        usage: Math.random() * 100,
        source: 'system-monitor',
        timestamp: Date.now()
    });
    
    server.event.broadcastToAll('memoryMetric', {
        used: Math.floor(Math.random() * 8000),
        total: 8000,
        source: 'system-monitor',
        timestamp: Date.now()
    });
    
    server.event.broadcastToAll('userMetric', {
        count: server.getConnectedClientNames().length,
        timestamp: Date.now()
    });
    
    server.event.broadcastToAll('requestMetric', {
        perSecond: Math.floor(Math.random() * 100),
        source: 'api-gateway',
        timestamp: Date.now()
    });
}, 10000); // Every 10 seconds