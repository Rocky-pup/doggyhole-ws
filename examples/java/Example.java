import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.CompletableFuture;

/**
 * Example usage of DoggyHoleClient in Java
 * Demonstrates async data sending and receiving
 */
public class Example {
    
    public static void main(String[] args) {
        // Create client options
        DoggyHoleClient.ClientOptions options = new DoggyHoleClient.ClientOptions(
            "ws://localhost:8080",
            "java-client",
            "java-secret-token"
        );
        options.maxReconnectAttempts = 10;
        options.requestTimeout = 15000;
        options.logLevel = DoggyHoleClient.LogLevel.INFO;
        
        // Create client instance - just like in TypeScript!
        DoggyHoleClient client = new DoggyHoleClient(options);
        
        // Or use the static factory method
        // DoggyHoleClient client = DoggyHoleClient.create(options);
        
        // Set up event handlers before connecting
        setupHandlers(client);
        
        // Connect and run examples
        client.connect()
            .thenCompose(v -> runAsyncExamples(client))
            .whenComplete((result, error) -> {
                if (error != null) {
                    System.err.println("Example failed: " + error.getMessage());
                } else {
                    System.out.println("Example completed successfully!");
                }
                
                // Cleanup after 30 seconds
                try {
                    Thread.sleep(30000);
                    client.disconnect();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
    }
    
    private static void setupHandlers(DoggyHoleClient client) {
        // Add request handlers for incoming client requests
        client.addHandler("ping", (Map<String, Object> data) -> {
            System.out.println("Received ping: " + data);
            Map<String, Object> response = new HashMap<>();
            response.put("pong", true);
            response.put("timestamp", System.currentTimeMillis());
            response.put("receivedData", data);
            return response;
        });
        
        client.addHandler("calculate", (Map<String, Object> data) -> {
            int a = ((Number) data.get("a")).intValue();
            int b = ((Number) data.get("b")).intValue();
            
            Map<String, Object> result = new HashMap<>();
            result.put("result", a + b);
            result.put("operation", "addition");
            result.put("operands", Map.of("a", a, "b", b));
            return result;
        });
        
        client.addHandler("echo", (Object data) -> {
            System.out.println("Echo request received: " + data);
            return Map.of("echo", data, "timestamp", System.currentTimeMillis());
        });
        
        // Add event listeners
        client.addEventListener("userMessage", (data, fromClient) -> {
            System.out.println("Message from " + fromClient + ": " + 
                data.get("message").asText());
        });
        
        client.addEventListener("gameMove", (data, fromClient) -> {
            System.out.println("Game move from " + fromClient + ": " + 
                data.get("move").asText());
        });
        
        client.addEventListener("systemAlert", (data, fromClient) -> {
            System.out.println("ALERT from " + fromClient + ": " + 
                data.get("message").asText());
        });
        
        // Connection state handlers
        client.onConnected(name -> {
            System.out.println("✓ Connected as: " + name);
        });
        
        client.onDisconnected(reason -> {
            System.out.println("✗ Disconnected: " + reason);
        });
        
        client.onError(error -> {
            System.err.println("Error: " + error.getMessage());
        });
        
        client.onStateChange((newState, oldState) -> {
            System.out.println("State change: " + oldState + " → " + newState);
        });
    }
    
    private static CompletableFuture<Void> runAsyncExamples(DoggyHoleClient client) {
        System.out.println("Running async examples...");
        
        // Create data for requests
        Map<String, Object> greetData = Map.of("name", "Java Client");
        Map<String, Object> calcData = Map.of("a", 15, "b", 25);
        
        // Example 1: Server requests (async)
        CompletableFuture<Void> serverRequests = client.request("greet", greetData)
            .thenAccept(result -> {
                System.out.println("Server greeting: " + result);
            })
            .thenCompose(v -> client.request("calculate", calcData))
            .thenAccept(result -> {
                System.out.println("Server calculation: " + result);
            })
            .thenCompose(v -> client.request("getTime", Map.of()))
            .thenAccept(result -> {
                System.out.println("Server time: " + result);
            })
            .exceptionally(error -> {
                System.err.println("Server request failed: " + error.getMessage());
                return null;
            });
        
        // Example 2: Client-to-client requests (async)
        CompletableFuture<Void> clientRequests = CompletableFuture.runAsync(() -> {
            try {
                Thread.sleep(2000); // Wait a bit before client requests
                
                // Try to ping another client
                client.requestClient("alice", "ping", Map.of("message", "Hello from Java!"))
                    .thenAccept(result -> {
                        System.out.println("Alice ping response: " + result);
                    })
                    .exceptionally(error -> {
                        System.out.println("Alice not available: " + error.getMessage());
                        return null;
                    });
                
                // Try to request from another client
                client.requestClient("bob", "getStatus", Map.of())
                    .thenAccept(result -> {
                        System.out.println("Bob status: " + result);
                    })
                    .exceptionally(error -> {
                        System.out.println("Bob not available: " + error.getMessage());
                        return null;
                    });
                    
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        
        // Example 3: Event broadcasting (async)
        CompletableFuture<Void> eventSending = CompletableFuture.runAsync(() -> {
            try {
                // Send events periodically
                for (int i = 0; i < 5; i++) {
                    Thread.sleep(3000);
                    
                    // Send user message event
                    Map<String, Object> messageData = Map.of(
                        "message", "Hello from Java client! Count: " + (i + 1),
                        "timestamp", System.currentTimeMillis(),
                        "sender", client.getName()
                    );
                    client.sendEvent("userMessage", messageData);
                    
                    // Send status update
                    Map<String, Object> statusData = Map.of(
                        "status", "active",
                        "activity", "sending messages",
                        "count", i + 1
                    );
                    client.sendEvent("statusUpdate", statusData);
                    
                    System.out.println("Sent events batch " + (i + 1));
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        
        // Example 4: Parallel async operations
        CompletableFuture<Void> parallelOps = CompletableFuture.allOf(
            // Multiple server requests in parallel
            client.request("echo", "Message 1"),
            client.request("echo", "Message 2"),
            client.request("echo", "Message 3")
        ).thenRun(() -> {
            System.out.println("All parallel echo requests completed");
        });
        
        // Combine all examples
        return CompletableFuture.allOf(
            serverRequests,
            clientRequests, 
            eventSending,
            parallelOps
        ).thenRun(() -> {
            System.out.println("All async examples completed!");
        });
    }
}