import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { resolveMarketplaceUser } from "../db";
import { subscribeToMarketplaceNotifications } from "../marketplaceNotifications";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  app.get("/api/marketplace/notifications/stream", async (req, res) => {
    const accessToken = typeof req.query.accessToken === "string" ? req.query.accessToken : "";

    if (!accessToken) {
      res.status(400).json({ message: "رمز الدخول مطلوب لفتح قناة الإشعارات." });
      return;
    }

    try {
      const user = await resolveMarketplaceUser(accessToken);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);

      const keepAlive = setInterval(() => {
        res.write(": keep-alive\n\n");
      }, 15000);

      const unsubscribe = subscribeToMarketplaceNotifications(user.id, payload => {
        res.write(`data: ${JSON.stringify({ type: "notification", notification: payload })}\n\n`);
      });

      req.on("close", () => {
        clearInterval(keepAlive);
        unsubscribe();
        res.end();
      });
    } catch (error) {
      console.error("[MarketplaceNotifications] Failed to open stream", error);
      res.status(401).json({ message: "تعذر التحقق من جلسة المستخدم لفتح الإشعارات." });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
