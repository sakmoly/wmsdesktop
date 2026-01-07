// wms-api/src/server.js
// Main server entry point

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import os from "os";
import http from "http";
import routes from "./routes/index.js";
import { logger } from "./utils/logger.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // Bind to all interfaces by default
const API_BASE_URL = process.env.API_BASE_URL || ""; // Optional: override API base URL

// ============================================================================
// HEALTH CHECK ENDPOINT - Handled at raw HTTP level (see server creation below)
// This completely bypasses ALL Express middleware and error handlers
// ============================================================================

// Helper to check if request is for health endpoint (defined early)
const isHealthRequest = (req) => {
  const path = req.path || "";
  const originalUrl = req.originalUrl || "";
  const url = req.url || "";
  return (
    path === "/health" ||
    originalUrl === "/health" ||
    url === "/health" ||
    path.startsWith("/health") ||
    originalUrl.startsWith("/health") ||
    url.startsWith("/health")
  );
};

// Request logging middleware (skip for health endpoint)
app.use((req, res, next) => {
  // Skip logging for health endpoint to avoid any issues
  if (isHealthRequest(req)) {
    return next();
  }

  try {
    const timestamp = new Date().toISOString();
    const clientIP =
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "unknown";
    const method = req.method || "UNKNOWN";
    const url = req.originalUrl || req.url || "/";
    const userAgent =
      req.get?.("user-agent") || req.headers?.["user-agent"] || "unknown";

    logger.info(`📥 ${method} ${url}`, { IP: clientIP, UserAgent: userAgent });
  } catch (logError) {
    // Silently continue if logging fails
    logger.error("Request logging error", logError);
  }
  next();
});

// ============================================================================
// MIDDLEWARE - Applied to all routes EXCEPT /health
// ============================================================================

// CORS middleware (skip for health endpoint)
app.use((req, res, next) => {
  if (isHealthRequest(req)) {
    return next();
  }
  cors()(req, res, next);
});

// Body parsing middleware - skip for health endpoint
app.use((req, res, next) => {
  if (isHealthRequest(req)) {
    return next();
  }
  next();
});

// Increase body size limit to 5MB to handle large batch requests
// Skip body parsing for health endpoint
app.use((req, res, next) => {
  if (isHealthRequest(req)) {
    return next();
  }
  express.json({ limit: "5mb" })(req, res, next);
});

app.use((req, res, next) => {
  if (isHealthRequest(req)) {
    return next();
  }
  express.urlencoded({ extended: true, limit: "5mb" })(req, res, next);
});

// Ensure req.body is always initialized (defensive programming)
app.use((req, res, next) => {
  try {
    if (
      !req.body ||
      (typeof req.body !== "object" && !Array.isArray(req.body))
    ) {
      req.body = {};
    }
  } catch (error) {
    // If initialization fails, set to empty object
    req.body = {};
  }
  next();
});

// Body logging middleware (after body parsing)
app.use((req, res, next) => {
  // Only log body if it exists, is an object (not array), and has properties (skip login requests)
  try {
    if (
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body) &&
      Object.keys(req.body).length > 0 &&
      !req.originalUrl?.includes("/api/auth/login")
    ) {
      logger.debug("Request body", req.body);
    }
  } catch (error) {
    // Silently ignore body logging errors
    logger.error("Body logging error", error);
  }
  next();
});

// Routes
app.use("/", routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    code: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`SERVER ERROR: ${req.method} ${req.originalUrl || req.url}`, {
    errorType: err?.constructor?.name || "Unknown",
    message: err?.message || "Unknown error",
    stack: err?.stack || "No stack trace",
    fullError: err
  });

  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details:
      process.env.NODE_ENV === "development"
        ? err?.message || "Unknown error"
        : null,
  });
});

// Helper function to get network IP addresses
function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  return ips;
}

// Start server with raw HTTP handler for health endpoint
const server = http.createServer((req, res) => {
  // Handle health endpoint at raw HTTP level - completely bypass Express
  if (
    req.method === "GET" &&
    (req.url === "/health" || req.url === "/health/")
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"status":"ok","message":"WMS API Server is running"}');
    return;
  }

  // All other requests go to Express
  app(req, res);
});

server.listen(PORT, HOST, () => {
  const networkIPs = getNetworkIPs();

  // Debug: Show detected network interfaces
  logger.info("=".repeat(70));
  logger.info("🚀 WMS API Server Started");
  logger.info("=".repeat(70));
  logger.info("🔍 Server Configuration", {
    HOST,
    PORT,
    API_BASE_URL: API_BASE_URL || "(not set)",
    NetworkIPs: networkIPs.length > 0 ? networkIPs : "None found"
  });

  // Determine API base URL - use env variable, or detected IP, or localhost
  let apiBaseUrl = API_BASE_URL;
  if (!apiBaseUrl) {
    // Use detected network IP if available, otherwise use localhost
    apiBaseUrl =
      networkIPs.length > 0
        ? `http://${networkIPs[0]}:${PORT}`
        : `http://localhost:${PORT}`;
  }

  // Ensure API_BASE_URL doesn't have trailing slash
  apiBaseUrl = apiBaseUrl.replace(/\/$/, "");

  const primaryIP = networkIPs.length > 0 ? networkIPs[0] : "localhost";

  if (HOST === "0.0.0.0" && networkIPs.length > 0) {
    logger.success(`Server running on all interfaces (0.0.0.0:${PORT})`);
    logger.info("📍 Access URLs", {
      Health: `http://${primaryIP}:${PORT}/health`,
      API: `${apiBaseUrl}/api`,
      LocalHealth: `http://localhost:${PORT}/health`,
      LocalAPI: `http://localhost:${PORT}/api`
    });
    if (networkIPs.length > 1) {
      logger.info("📡 Additional Network IPs", networkIPs.slice(1));
    }
    logger.info("=".repeat(70));
  } else if (HOST === "0.0.0.0") {
    logger.success(`Server running on all interfaces (0.0.0.0:${PORT})`);
    logger.info("📍 Access URLs", {
      Health: `http://YOUR_IP:${PORT}/health (use your machine's IP address)`,
      API: `${apiBaseUrl}/api`,
      LocalHealth: `http://localhost:${PORT}/health`,
      LocalAPI: `http://localhost:${PORT}/api`
    });
    logger.info("=".repeat(70));
  } else {
    logger.success(`Server running on ${HOST}:${PORT}`);
    logger.info("📍 Access URLs", {
      Health: `http://${HOST}:${PORT}/health`,
      API: `${apiBaseUrl}/api`
    });
    logger.info("=".repeat(70));
  }

  // Store API base URL for potential use in routes
  app.locals.apiBaseUrl = apiBaseUrl;
});
