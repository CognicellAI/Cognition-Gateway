import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { db } from "./src/lib/db/client";
import { initCronScheduler, registerJob, unregisterJob } from "./src/lib/gateway/cron";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const prisma = db;

// WebSocket clients
const clients = new Set<WebSocket>();

app.prepare().then(async () => {
  // Run database migrations
  try {
    console.log("🔌 Checking database connection...");
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }

  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Use noServer mode so the wss doesn't intercept all upgrade events.
  // Only delegate /ws path to our WebSocket server; everything else
  // (including Next.js HMR at /_next/webpack-hmr) is handled by Next.js.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "");
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
    // All other upgrade requests (HMR, etc.) fall through to Next.js
  });
  
  wss.on("connection", (ws) => {
    console.log("🔌 WebSocket client connected");
    clients.add(ws);
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
    
    ws.on("close", () => {
      console.log("🔌 WebSocket client disconnected");
      clients.delete(ws);
    });
    
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  // Broadcast function for server events
  const broadcast = (message: unknown) => {
    const data = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(data);
      }
    });
  };

  // Initialize cron scheduler
  const serverUrl = process.env.COGNITION_SERVER_URL ?? "http://localhost:8000";
  await initCronScheduler({ db, serverUrl, broadcast });

  // Expose scheduler controls for the API layer
  // (API routes access these via the global object in production)
  const globalForScheduler = globalThis as unknown as {
    cronRegisterJob: typeof registerJob;
    cronUnregisterJob: typeof unregisterJob;
    wsBroadcast: typeof broadcast;
    cognitionServerUrl: string;
  };
  globalForScheduler.cronRegisterJob = registerJob;
  globalForScheduler.cronUnregisterJob = unregisterJob;
  globalForScheduler.wsBroadcast = broadcast;
  globalForScheduler.cognitionServerUrl = serverUrl;

  // Start server
  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket available on ws://${hostname}:${port}/ws`);
    
    if (dev) {
      console.log("> Development mode: Hot reloading enabled");
    }
  });

  // Graceful shutdown
  const gracefulShutdown = async () => {
    console.log("\n🛑 Shutting down gracefully...");
    
    // Close WebSocket connections
    wss.close(() => {
      console.log("WebSocket server closed");
    });
    
    // Close database connection
    await prisma.$disconnect();
    console.log("Database connection closed");
    
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
});