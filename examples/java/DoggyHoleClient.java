import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Complete async Java client for DoggyHole WebSocket server
 * Mirrors the TypeScript DoggyHoleClient API
 */
public class DoggyHoleClient {
    
    public enum ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        RECONNECTING,
        DISCONNECTING
    }
    
    public enum LogLevel {
        DEBUG, INFO, WARN, ERROR
    }
    
    public static class ClientOptions {
        public String url;
        public String name;
        public String token;
        public int maxReconnectAttempts = 5;
        public int heartbeatInterval = 1000;
        public int requestTimeout = 10000;
        public LogLevel logLevel = LogLevel.INFO;
        public double reconnectBackoffMultiplier = 1.5;
        
        public ClientOptions(String url, String token) {
            this.url = url;
            this.token = token;
        }
        
        public ClientOptions(String url, String name, String token) {
            this.url = url;
            this.name = name;
            this.token = token;
        }
    }
    
    public interface RequestHandler<TReq, TRes> {
        TRes handle(TReq data) throws Exception;
    }
    
    public interface ConnectionStateHandler {
        void onStateChange(ConnectionState newState, ConnectionState oldState);
    }
    
    public interface EventHandler {
        void handle(JsonNode data, String fromClient);
    }
    
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final ClientOptions options;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(3);
    
    private WebSocket webSocket;
    private ConnectionState connectionState = ConnectionState.DISCONNECTED;
    private final AtomicInteger requestId = new AtomicInteger(0);
    private final Map<String, CompletableFuture<JsonNode>> pendingRequests = new ConcurrentHashMap<>();
    private final Map<String, RequestHandler<JsonNode, Object>> clientHandlers = new ConcurrentHashMap<>();
    private final Map<String, List<EventHandler>> eventListeners = new ConcurrentHashMap<>();
    private final List<ConnectionStateHandler> stateChangeHandlers = new ArrayList<>();
    private final List<Consumer<String>> connectedHandlers = new ArrayList<>();
    private final List<Consumer<String>> disconnectedHandlers = new ArrayList<>();
    private final List<Consumer<Exception>> errorHandlers = new ArrayList<>();
    
    private int reconnectAttempts = 0;
    private boolean isShuttingDown = false;
    
    /**
     * Create a new DoggyHoleClient instance
     */
    public DoggyHoleClient(ClientOptions options) {
        this.options = options;
        
        // Handle token-only auth
        if (options.name == null && options.token != null) {
            options.name = options.token;
        }
        
        log(LogLevel.INFO, "Client created: " + options.name);
    }
    
    /**
     * Static factory method to mirror TypeScript API
     */
    public static DoggyHoleClient create(ClientOptions options) {
        return new DoggyHoleClient(options);
    }
    
    // Configuration methods
    public DoggyHoleClient setName(String name) {
        this.options.name = name;
        return this;
    }
    
    public DoggyHoleClient setToken(String token) {
        this.options.token = token;
        return this;
    }
    
    public DoggyHoleClient setUrl(String url) {
        this.options.url = url;
        return this;
    }
    
    // Connection methods
    public CompletableFuture<Void> connect() {
        if (connectionState == ConnectionState.CONNECTED) {
            log(LogLevel.WARN, "Already connected");
            return CompletableFuture.completedFuture(null);
        }
        
        if (connectionState == ConnectionState.CONNECTING) {
            log(LogLevel.WARN, "Connection already in progress");
            return CompletableFuture.completedFuture(null);
        }
        
        return CompletableFuture.supplyAsync(() -> {
            setConnectionState(ConnectionState.CONNECTING);
            
            HttpClient client = HttpClient.newHttpClient();
            
            try {
                webSocket = client.newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .buildAsync(URI.create(options.url), new WebSocketListener())
                    .get();
                
                // Wait for authentication
                authenticate();
                startHeartbeat();
                reconnectAttempts = 0;
                setConnectionState(ConnectionState.CONNECTED);
                
                log(LogLevel.INFO, "Connected to server");
                connectedHandlers.forEach(handler -> handler.accept(options.name));
                
                return null;
            } catch (Exception e) {
                setConnectionState(ConnectionState.DISCONNECTED);
                log(LogLevel.ERROR, "Connection failed: " + e.getMessage());
                errorHandlers.forEach(handler -> handler.accept(e));
                throw new RuntimeException(e);
            }
        });
    }
    
    public void disconnect() {
        setConnectionState(ConnectionState.DISCONNECTING);
        log(LogLevel.INFO, "Disconnecting from server");
        cleanup();
        
        if (webSocket != null) {
            webSocket.sendClose(WebSocket.NORMAL_CLOSURE, "Client disconnecting");
            webSocket = null;
        }
        
        setConnectionState(ConnectionState.DISCONNECTED);
    }
    
    public boolean isConnected() {
        return connectionState == ConnectionState.CONNECTED;
    }
    
    public ConnectionState getConnectionState() {
        return connectionState;
    }
    
    // Request methods
    public <TReq, TRes> CompletableFuture<TRes> request(String functionName, TReq data) {
        return CompletableFuture.supplyAsync(() -> {
            if (!isConnected()) {
                throw new RuntimeException("Client not connected");
            }
            
            String id = String.valueOf(requestId.incrementAndGet());
            ObjectNode requestMessage = objectMapper.createObjectNode();
            requestMessage.put("type", "request");
            requestMessage.put("id", id);
            requestMessage.put("functionName", functionName);
            requestMessage.set("data", objectMapper.valueToTree(data));
            
            CompletableFuture<JsonNode> future = new CompletableFuture<>();
            pendingRequests.put(id, future);
            
            // Set timeout
            scheduler.schedule(() -> {
                CompletableFuture<JsonNode> timeoutFuture = pendingRequests.remove(id);
                if (timeoutFuture != null) {
                    timeoutFuture.completeExceptionally(
                        new RuntimeException("Request timeout for " + functionName)
                    );
                }
            }, options.requestTimeout, TimeUnit.MILLISECONDS);
            
            try {
                sendMessage(requestMessage);
                JsonNode result = future.get();
                return objectMapper.treeToValue(result, (Class<TRes>) Object.class);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }
    
    public <TReq, TRes> CompletableFuture<TRes> requestClient(String targetClient, String functionName, TReq data) {
        return CompletableFuture.supplyAsync(() -> {
            if (!isConnected()) {
                throw new RuntimeException("Client not connected");
            }
            
            String id = String.valueOf(requestId.incrementAndGet());
            ObjectNode requestMessage = objectMapper.createObjectNode();
            requestMessage.put("type", "client_request");
            requestMessage.put("id", id);
            requestMessage.put("targetClient", targetClient);
            requestMessage.put("functionName", functionName);
            requestMessage.set("data", objectMapper.valueToTree(data));
            requestMessage.put("fromClient", options.name);
            
            CompletableFuture<JsonNode> future = new CompletableFuture<>();
            pendingRequests.put(id, future);
            
            // Set timeout
            scheduler.schedule(() -> {
                CompletableFuture<JsonNode> timeoutFuture = pendingRequests.remove(id);
                if (timeoutFuture != null) {
                    timeoutFuture.completeExceptionally(
                        new RuntimeException("Client request timeout: " + targetClient + "." + functionName)
                    );
                }
            }, options.requestTimeout, TimeUnit.MILLISECONDS);
            
            try {
                sendMessage(requestMessage);
                JsonNode result = future.get();
                return objectMapper.treeToValue(result, (Class<TRes>) Object.class);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }
    
    // Handler methods
    public <TReq, TRes> DoggyHoleClient addHandler(String functionName, RequestHandler<TReq, TRes> handler) {
        clientHandlers.put(functionName, (RequestHandler<JsonNode, Object>) data -> {
            TReq typedData = objectMapper.treeToValue(data, (Class<TReq>) Object.class);
            return handler.handle(typedData);
        });
        log(LogLevel.DEBUG, "Handler added: " + functionName);
        return this;
    }
    
    public DoggyHoleClient removeHandler(String functionName) {
        clientHandlers.remove(functionName);
        log(LogLevel.DEBUG, "Handler removed: " + functionName);
        return this;
    }
    
    // Event methods
    public <T> void sendEvent(String eventName, T data) {
        if (isConnected() && webSocket != null) {
            ObjectNode eventMessage = objectMapper.createObjectNode();
            eventMessage.put("type", "event");
            eventMessage.put("eventName", eventName);
            eventMessage.set("data", objectMapper.valueToTree(data));
            
            sendMessage(eventMessage);
            log(LogLevel.DEBUG, "Event sent: " + eventName);
        } else {
            log(LogLevel.WARN, "Cannot send event " + eventName + ": not connected");
        }
    }
    
    // Event listener methods (mirror JavaScript EventTarget API)
    public DoggyHoleClient addEventListener(String eventName, EventHandler handler) {
        eventListeners.computeIfAbsent(eventName, k -> new ArrayList<>()).add(handler);
        return this;
    }
    
    public DoggyHoleClient removeEventListener(String eventName, EventHandler handler) {
        List<EventHandler> handlers = eventListeners.get(eventName);
        if (handlers != null) {
            handlers.remove(handler);
            if (handlers.isEmpty()) {
                eventListeners.remove(eventName);
            }
        }
        return this;
    }
    
    public DoggyHoleClient removeAllEventListeners(String eventName) {
        if (eventName != null) {
            eventListeners.remove(eventName);
        } else {
            eventListeners.clear();
        }
        return this;
    }
    
    // Connection event handlers
    public DoggyHoleClient onConnected(Consumer<String> handler) {
        connectedHandlers.add(handler);
        return this;
    }
    
    public DoggyHoleClient onDisconnected(Consumer<String> handler) {
        disconnectedHandlers.add(handler);
        return this;
    }
    
    public DoggyHoleClient onError(Consumer<Exception> handler) {
        errorHandlers.add(handler);
        return this;
    }
    
    public DoggyHoleClient onStateChange(ConnectionStateHandler handler) {
        stateChangeHandlers.add(handler);
        return this;
    }
    
    public String getName() {
        return options.name;
    }
    
    // Private methods
    private void authenticate() {
        if (webSocket != null) {
            ObjectNode authMessage = objectMapper.createObjectNode();
            authMessage.put("type", "auth");
            authMessage.put("token", options.token);
            
            if (options.name != null && !options.name.equals(options.token)) {
                authMessage.put("name", options.name);
            }
            
            sendMessage(authMessage);
        }
    }
    
    private void sendMessage(JsonNode message) {
        if (webSocket != null) {
            try {
                String json = objectMapper.writeValueAsString(message);
                webSocket.sendText(json, true);
            } catch (Exception e) {
                log(LogLevel.ERROR, "Failed to send message: " + e.getMessage());
            }
        }
    }
    
    private void startHeartbeat() {
        scheduler.scheduleAtFixedRate(() -> {
            if (webSocket != null && isConnected()) {
                ObjectNode heartbeat = objectMapper.createObjectNode();
                heartbeat.put("type", "heartbeat_response");
                sendMessage(heartbeat);
            }
        }, options.heartbeatInterval, options.heartbeatInterval, TimeUnit.MILLISECONDS);
    }
    
    private void setConnectionState(ConnectionState newState) {
        if (connectionState != newState) {
            ConnectionState oldState = connectionState;
            connectionState = newState;
            log(LogLevel.DEBUG, "Connection state: " + oldState + " -> " + newState);
            stateChangeHandlers.forEach(handler -> handler.onStateChange(newState, oldState));
        }
    }
    
    private void cleanup() {
        for (CompletableFuture<JsonNode> request : pendingRequests.values()) {
            request.completeExceptionally(new RuntimeException("Connection closed"));
        }
        pendingRequests.clear();
    }
    
    private void scheduleReconnect() {
        if (reconnectAttempts < options.maxReconnectAttempts && !isShuttingDown) {
            reconnectAttempts++;
            int delay = (int) Math.min(
                1000 * Math.pow(options.reconnectBackoffMultiplier, reconnectAttempts - 1),
                30000
            );
            
            setConnectionState(ConnectionState.RECONNECTING);
            log(LogLevel.INFO, "Reconnecting in " + delay + "ms (attempt " + 
                reconnectAttempts + "/" + options.maxReconnectAttempts + ")");
            
            scheduler.schedule(() -> {
                connect().exceptionally(error -> {
                    log(LogLevel.ERROR, "Reconnection failed: " + error.getMessage());
                    return null;
                });
            }, delay, TimeUnit.MILLISECONDS);
        }
    }
    
    private void log(LogLevel level, String message) {
        if (level.ordinal() >= options.logLevel.ordinal()) {
            System.out.println("[" + level + "] Client:" + options.name + " - " + message);
        }
    }
    
    // WebSocket listener implementation
    private class WebSocketListener implements WebSocket.Listener {
        @Override
        public void onOpen(WebSocket webSocket) {
            log(LogLevel.DEBUG, "WebSocket connection opened");
            webSocket.request(1);
        }
        
        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            try {
                JsonNode message = objectMapper.readTree(data.toString());
                handleMessage(message);
            } catch (Exception e) {
                log(LogLevel.ERROR, "Error parsing message: " + e.getMessage());
            }
            
            webSocket.request(1);
            return null;
        }
        
        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            log(LogLevel.INFO, "WebSocket closed: " + statusCode + " - " + reason);
            cleanup();
            setConnectionState(ConnectionState.DISCONNECTED);
            disconnectedHandlers.forEach(handler -> handler.accept(reason));
            
            if (statusCode != 1000 && statusCode != 1001 && !isShuttingDown) {
                scheduleReconnect();
            }
            
            return null;
        }
        
        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            log(LogLevel.ERROR, "WebSocket error: " + error.getMessage());
            cleanup();
            setConnectionState(ConnectionState.DISCONNECTED);
            errorHandlers.forEach(handler -> handler.accept(new RuntimeException(error)));
        }
    }
    
    private void handleMessage(JsonNode message) {
        String type = message.get("type").asText();
        
        switch (type) {
            case "auth_success":
                String name = message.get("name").asText();
                options.name = name;
                log(LogLevel.INFO, "Authentication successful: " + name);
                break;
                
            case "response":
                handleResponse(message);
                break;
                
            case "client_request":
                handleClientRequest(message);
                break;
                
            case "event":
                handleEvent(message);
                break;
                
            case "heartbeat":
                // Heartbeat response is handled automatically
                break;
                
            case "shutdown":
                String reason = message.has("reason") ? message.get("reason").asText() : "No reason";
                log(LogLevel.WARN, "Server shutdown: " + reason);
                
                int gracePeriod = message.has("gracePeriod") ? message.get("gracePeriod").asInt() : 1000;
                scheduler.schedule(() -> {
                    if (isConnected()) {
                        disconnect();
                    }
                }, Math.min(gracePeriod, 5000), TimeUnit.MILLISECONDS);
                break;
                
            default:
                log(LogLevel.WARN, "Unknown message type: " + type);
        }
    }
    
    private void handleResponse(JsonNode message) {
        String id = message.get("id").asText();
        CompletableFuture<JsonNode> future = pendingRequests.remove(id);
        
        if (future != null) {
            if (message.get("success").asBoolean()) {
                future.complete(message.get("data"));
            } else {
                future.completeExceptionally(
                    new RuntimeException(message.get("error").asText())
                );
            }
        }
    }
    
    private void handleClientRequest(JsonNode message) {
        String functionName = message.get("functionName").asText();
        RequestHandler<JsonNode, Object> handler = clientHandlers.get(functionName);
        
        if (handler != null) {
            try {
                Object result = handler.handle(message.get("data"));
                sendClientResponse(message.get("id").asText(), true, result, null,
                    message.get("fromClient").asText());
            } catch (Exception e) {
                sendClientResponse(message.get("id").asText(), false, null,
                    e.getMessage(), message.get("fromClient").asText());
            }
        } else {
            sendClientResponse(message.get("id").asText(), false, null,
                "Handler not found", message.get("fromClient").asText());
        }
    }
    
    private void sendClientResponse(String id, boolean success, Object data,
                                  String error, String originalFromClient) {
        ObjectNode response = objectMapper.createObjectNode();
        response.put("type", "response");
        response.put("id", id);
        response.put("success", success);
        
        if (data != null) {
            response.set("data", objectMapper.valueToTree(data));
        }
        if (error != null) {
            response.put("error", error);
        }
        if (originalFromClient != null) {
            response.put("originalFromClient", originalFromClient);
        }
        
        sendMessage(response);
    }
    
    private void handleEvent(JsonNode message) {
        String eventName = message.get("eventName").asText();
        JsonNode data = message.get("data");
        String fromClient = message.has("fromClient") ? message.get("fromClient").asText() : "server";
        
        List<EventHandler> handlers = eventListeners.get(eventName);
        if (handlers != null) {
            handlers.forEach(handler -> {
                try {
                    handler.handle(data, fromClient);
                } catch (Exception e) {
                    log(LogLevel.ERROR, "Error in event handler for " + eventName + ": " + e.getMessage());
                }
            });
        }
    }
}