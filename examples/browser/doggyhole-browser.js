class DoggyHoleBrowserClient extends EventTarget {
    constructor(options) {
        super();
        this.options = {
            url: options.url,
            name: options.name,
            token: options.token,
            maxReconnectAttempts: options.maxReconnectAttempts || 5,
            heartbeatInterval: options.heartbeatInterval || 1000,
            requestTimeout: options.requestTimeout || 10000,
            reconnectBackoffMultiplier: options.reconnectBackoffMultiplier || 1.5
        };
        
        this.ws = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.heartbeatInterval = null;
        this.reconnectAttempts = 0;
        this.clientHandlers = new Map();
        this.connectionState = 'disconnected';
        this.reconnectTimeout = null;
        this.eventHandlers = new Map();
    }

    static create(options) {
        return new DoggyHoleBrowserClient(options);
    }

    async connect() {
        if (this.connectionState === 'connected') {
            console.warn('Already connected');
            return;
        }

        if (this.connectionState === 'connecting') {
            console.warn('Connection already in progress');
            return;
        }

        return new Promise((resolve, reject) => {
            this.setConnectionState('connecting');
            
            this.ws = new WebSocket(this.options.url);

            this.ws.onopen = () => {
                this.authenticate();
                this.startHeartbeat();
                this.reconnectAttempts = 0;
                this.setConnectionState('connected');
                
                console.log('Connected to server');
                this.dispatchEvent(new CustomEvent('connected'));
                resolve();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = (event) => {
                console.log(`Disconnected: ${event.code} - ${event.reason}`);
                this.cleanup();
                this.setConnectionState('disconnected');
                this.dispatchEvent(new CustomEvent('disconnected', { 
                    detail: { code: event.code, reason: event.reason } 
                }));
                
                if (event.code !== 1000 && event.code !== 1001 && 
                    this.reconnectAttempts < this.options.maxReconnectAttempts) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.cleanup();
                this.setConnectionState('disconnected');
                this.dispatchEvent(new CustomEvent('error', { detail: error }));
                reject(new Error('WebSocket connection failed'));
            };
        });
    }

    authenticate() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const authMessage = {
                type: 'auth',
                token: this.options.token
            };
            
            if (this.options.name && this.options.name !== this.options.token) {
                authMessage.name = this.options.name;
            }
            
            this.ws.send(JSON.stringify(authMessage));
        }
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);

            if (!message || typeof message !== 'object' || !message.type) {
                console.warn('Invalid message format: missing type');
                this.dispatchEvent(new CustomEvent('error', { detail: new Error('Invalid message format') }));
                return;
            }

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
            } else if (message.type === 'auth_success') {
                console.log('Received auth_success message:', message);
                this.handleAuthSuccess(message);
            } else {
                console.warn(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Message parsing error:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
        }
    }

    async handleClientRequest(message) {
        if (!message.functionName || typeof message.functionName !== 'string') {
            this.sendClientResponse(message.id, false, null, 'Invalid function name', message.fromClient);
            return;
        }

        if (!message.id || typeof message.id !== 'string') {
            console.warn('Client request received without valid ID');
            return;
        }

        const handler = this.clientHandlers.get(message.functionName);
        
        if (!handler) {
            this.sendClientResponse(message.id, false, null, 'Handler not found', message.fromClient);
            return;
        }

        try {
            const result = await handler(message.data);
            this.sendClientResponse(message.id, true, result, undefined, message.fromClient);
        } catch (error) {
            this.sendClientResponse(message.id, false, null, error.message, message.fromClient);
        }
    }

    sendClientResponse(id, success, data, error, originalFromClient) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const response = {
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

    handleResponse(message) {
        const request = this.pendingRequests.get(message.id);
        if (request) {
            clearTimeout(request.timeout);
            this.pendingRequests.delete(message.id);
            
            if (message.success) {
                request.resolve(message.data);
            } else {
                request.reject(new Error(message.error || 'Unknown error'));
            }
        }
    }

    handleHeartbeat() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const response = {
                type: 'heartbeat_response'
            };
            this.ws.send(JSON.stringify(response));
        }
    }

    handleEvent(message) {
        const handlers = this.eventHandlers.get(message.eventName) || [];
        handlers.forEach(handler => {
            try {
                handler(message.data, message.fromClient);
            } catch (error) {
                console.error(`Error in event handler for ${message.eventName}:`, error);
            }
        });
    }

    handleShutdown(message) {
        console.warn(`Server shutdown: ${message.reason || 'No reason'}`);
        this.dispatchEvent(new CustomEvent('serverShutdown', { 
            detail: { reason: message.reason, gracePeriod: message.gracePeriod } 
        }));
        
        setTimeout(() => {
            if (this.isConnected()) {
                this.disconnect();
            }
        }, Math.min(message.gracePeriod || 1000, 5000));
    }

    handleAuthSuccess(message) {
        console.log('handleAuthSuccess called with:', message);
        if (message.name) {
            this.options.name = message.name;
        }
        console.log(`Authentication successful. Client name: ${this.options.name}`);
        console.log('Dispatching authSuccess event...');
        this.dispatchEvent(new CustomEvent('authSuccess', { 
            detail: { name: this.options.name } 
        }));
        console.log('authSuccess event dispatched');
    }

    async request(functionName, data) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) {
                reject(new Error('Client not connected'));
                return;
            }

            const id = (++this.requestId).toString();
            const requestMessage = {
                type: 'request',
                id,
                functionName,
                data
            };

            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout for ${functionName}`));
                }
            }, this.options.requestTimeout);

            this.pendingRequests.set(id, { resolve, reject, timeout });
            
            this.ws.send(JSON.stringify(requestMessage));
        });
    }

    async requestClient(targetClient, functionName, data) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) {
                reject(new Error('Client not connected'));
                return;
            }

            const id = (++this.requestId).toString();
            const clientRequestMessage = {
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
                    reject(new Error(`Client request timeout for ${targetClient}.${functionName}`));
                }
            }, this.options.requestTimeout);

            this.pendingRequests.set(id, { resolve, reject, timeout });
            
            this.ws.send(JSON.stringify(clientRequestMessage));
        });
    }

    addHandler(functionName, handler) {
        this.clientHandlers.set(functionName, handler);
        console.log(`Handler added: ${functionName}`);
        return this;
    }

    removeHandler(functionName) {
        this.clientHandlers.delete(functionName);
        return this;
    }

    sendEvent(eventName, data) {
        if (!eventName || typeof eventName !== 'string') {
            throw new Error('Event name must be a non-empty string');
        }
        
        if (this.isConnected() && this.ws) {
            const eventMessage = {
                type: 'event',
                eventName,
                data
            };
            
            this.ws.send(JSON.stringify(eventMessage));
            console.log(`Event sent: ${eventName}`);
        } else {
            console.warn(`Cannot send event ${eventName}: not connected`);
        }
    }

    on(eventName, handler) {
        if (!eventName || typeof eventName !== 'string') {
            throw new Error('Event name must be a non-empty string');
        }
        if (!handler || typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }
        
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, []);
        }
        this.eventHandlers.get(eventName).push(handler);
        return this;
    }

    off(eventName, handler) {
        if (this.eventHandlers.has(eventName)) {
            const handlers = this.eventHandlers.get(eventName);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
        return this;
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.handleHeartbeat();
            }
        }, this.options.heartbeatInterval);
    }

    cleanup() {
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
            request.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
    }

    disconnect() {
        this.setConnectionState('disconnecting');
        console.log('Disconnecting from server');
        this.cleanup();
        if (this.ws) {
            this.ws.close(1000, 'Client disconnecting');
            this.ws = null;
        }
        this.setConnectionState('disconnected');
    }

    isConnected() {
        return this.connectionState === 'connected';
    }

    getConnectionState() {
        return this.connectionState;
    }

    setConnectionState(state) {
        if (this.connectionState !== state) {
            const oldState = this.connectionState;
            this.connectionState = state;
            console.log(`Connection state changed: ${oldState} -> ${state}`);
            this.dispatchEvent(new CustomEvent('stateChange', { 
                detail: { newState: state, oldState } 
            }));
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.reconnectAttempts++;
        const delay = Math.min(
            1000 * Math.pow(this.options.reconnectBackoffMultiplier, this.reconnectAttempts - 1),
            30000
        );

        this.setConnectionState('reconnecting');
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        
        this.reconnectTimeout = setTimeout(() => {
            this.connect().catch((error) => {
                console.error('Reconnection failed:', error);
            });
        }, delay);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DoggyHoleBrowserClient;
}