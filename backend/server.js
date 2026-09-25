// backend/server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
require("dotenv").config();

const adminRoutes = require("./routes/admin");
const submissionRoutes = require("./routes/submissions");
const { initDatabase } = require("./config/database");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

app.set("trust proxy", true);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

/*
 * These parsers do not consume multipart/form-data, so Multer remains
 * responsible for the submission upload route.
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const ROOT_DIR = path.join(__dirname, "..");
const ADMIN_DIR = path.join(__dirname, "public", "admin");

// Never expose backend source, package manifests, or repository metadata
// through the public static-file handler.
app.use((req, res, next) => {
  const blocked = /^(?:\/backend(?:\/|$)|\/node_modules(?:\/|$)|\/\.git(?:\/|$)|\/(?:package|package-lock)\.json$)/i.test(req.path);
  if (blocked) return res.status(404).end();
  next();
});

function staticCacheHeaders(res, filePath) {
  res.setHeader("Vary", "Accept-Encoding");

  const ext = path.extname(filePath).toLowerCase();
  let maxAge = 3600; // Safe default for any static asset Pingdom encounters.

  if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/i.test(filePath)) {
    maxAge = 31536000;
  } else if (/\.(?:woff2?|ttf|otf)$/i.test(filePath)) {
    maxAge = 31536000;
  } else if (/\.(?:css|js)$/i.test(filePath)) {
    maxAge = 2592000;
  } else if (/\.(?:html?|xml|txt|json)$/i.test(filePath)) {
    maxAge = /(?:^|[\\/])index\.html$/i.test(filePath) ? 3600 : 300;
  } else if (!ext) {
    maxAge = 300;
  }

  const immutable = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf)$/i.test(filePath)
    || /\.(?:css|js)$/i.test(filePath);
  res.setHeader(
    "Cache-Control",
    `public, max-age=${maxAge}, stale-while-revalidate=86400${immutable ? ", immutable" : ""}`
  );
  res.setHeader("Expires", new Date(Date.now() + maxAge * 1000).toUTCString());
}

// Serve pre-compressed Brotli first; modern Chrome/PageSpeed prefers br and it
// materially reduces HTML/CSS/JS transfer on mobile connections.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!/\bbr\b/i.test(String(req.headers["accept-encoding"] || ""))) return next();
  const rawPath = decodeURIComponent(req.path === "/" ? "/index.html" : req.path);
  if (!/\.(?:html?|css|js|json|xml|txt)$/i.test(rawPath)) return next();
  const safePath = path.normalize(rawPath).replace(/^([.][.][\\/])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);
  const brPath = `${filePath}.br`;
  if (!filePath.startsWith(ROOT_DIR) || !fs.existsSync(brPath)) return next();
  const types = {".html":"text/html; charset=UTF-8",".htm":"text/html; charset=UTF-8",".css":"text/css; charset=UTF-8",".js":"application/javascript; charset=UTF-8",".json":"application/json; charset=UTF-8",".xml":"application/xml; charset=UTF-8",".txt":"text/plain; charset=UTF-8"};
  staticCacheHeaders(res, filePath);
  res.setHeader("Content-Encoding", "br");
  res.setHeader("Content-Type", types[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  return res.sendFile(brPath);
});

// Serve pre-compressed text assets when the browser advertises gzip support.
// This keeps the existing HTML/CSS/JS files and visual output unchanged while
// reducing transfer time on mobile networks.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!/\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""))) return next();

  const rawPath = decodeURIComponent(req.path === "/" ? "/index.html" : req.path);
  if (!/\.(?:html?|css|js|json|xml|txt)$/i.test(rawPath)) return next();

  const safePath = path.normalize(rawPath).replace(/^([.][.][\\/])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);
  const gzipPath = `${filePath}.gz`;

  if (!filePath.startsWith(ROOT_DIR) || !fs.existsSync(gzipPath)) return next();

  const types = {
    ".html": "text/html; charset=UTF-8",
    ".htm": "text/html; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".js": "application/javascript; charset=UTF-8",
    ".json": "application/json; charset=UTF-8",
    ".xml": "application/xml; charset=UTF-8",
    ".txt": "text/plain; charset=UTF-8"
  };

  staticCacheHeaders(res, filePath);
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Content-Type", types[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  return res.sendFile(gzipPath);
});

app.use(express.static(ROOT_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    staticCacheHeaders(res, filePath);
  }
}));
app.use("/admin", express.static(ADMIN_DIR));

// The homepage is completely static and should not wait for PostgreSQL.
// API requests still wait for the database initialization promise.
let dbReady = Promise.resolve();
let dbInitError = null;

app.get("/api/health", async (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "assignment-help",
    time: new Date().toISOString()
  });
});

app.use("/api", async (req, res, next) => {
  try {
    await dbReady;
    if (dbInitError) {
      return res.status(503).json({ success: false, message: "Database is temporarily unavailable." });
    }
    next();
  } catch (_) {
    return res.status(503).json({ success: false, message: "Database is temporarily unavailable." });
  }
});

app.use("/api/admin", adminRoutes);
app.use("/api/submissions", submissionRoutes);

/*
 * If the client disconnects while a multipart upload is in progress,
 * record it clearly. This is different from a database failure.
 */
app.use((req, res, next) => {
  req.on("aborted", () => {
    console.warn("[HTTP REQUEST ABORTED]", req.method, req.originalUrl);
  });
  next();
});

/*
 * API 404s should return JSON instead of an HTML page.
 */
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });
});

/*
 * Frontend fallback.
 */
app.get("/{*splat}", (req, res) => {
  staticCacheHeaders(res, path.join(ROOT_DIR, "index.html"));
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

/*
 * Final error handler.
 */
app.use((err, req, res, next) => {
  console.error("🔴 Server Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

async function start() {
  const host = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`;

  // Start serving static HTML immediately. Database setup no longer delays
  // the first byte of the public homepage on a cold Railway instance.
  app.listen(PORT, HOST, () => {
    console.log(`Running on: ${host}`);
    console.log(`Admin: ${host}/admin/`);
    console.log(`Health: ${host}/api/health`);
  });

  dbReady = initDatabase()
    .then(() => {
      dbInitError = null;
      console.log("✅ Database initialized");
    })
    .catch((error) => {
      dbInitError = error;
      console.error("❌ Database initialization failed:", error);
      // Keep the static homepage alive, but fail API calls cleanly.
      return Promise.reject(error);
    });

  dbReady.catch(() => {});
}

start();
