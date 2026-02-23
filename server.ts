import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("suzanne.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT,
    content TEXT,
    type TEXT DEFAULT 'text',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
  CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fact TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/facts", (req, res) => {
    const facts = db.prepare("SELECT fact FROM facts ORDER BY created_at DESC").all();
    res.json(facts.map(f => f.fact));
  });

  app.post("/api/facts", (req, res) => {
    const { fact } = req.body;
    db.prepare("INSERT INTO facts (fact) VALUES (?)").run(fact);
    res.json({ success: true });
  });
  app.get("/api/sessions", (req, res) => {
    const sessions = db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all();
    res.json(sessions);
  });

  app.post("/api/sessions", (req, res) => {
    const { id, name } = req.body;
    db.prepare("INSERT INTO sessions (id, name) VALUES (?, ?)").run(id, name);
    res.json({ success: true });
  });

  app.get("/api/sessions/:id/messages", (req, res) => {
    const messages = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(req.params.id);
    res.json(messages);
  });

  app.post("/api/messages", (req, res) => {
    const { session_id, role, content, type } = req.body;
    db.prepare("INSERT INTO messages (session_id, role, content, type) VALUES (?, ?, ?, ?)").run(session_id, role, content, type || 'text');
    res.json({ success: true });
  });

  app.delete("/api/sessions/:id", (req, res) => {
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(req.params.id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
