const http = require("http");
const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
require("dotenv").config();

const sql = neon(process.env.DATABASE_URL);

const requestHandler = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve the interm.html page
  if (req.url === "/" && req.method === "GET") {
    fs.readFile("main_menu.html", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading login page");
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      }
    });
  }
  else if (req.url === "/interm.html" && req.method === "GET") {
    fs.readFile("interm.html", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading interm page");
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      }
    });
  } else if (req.url === "/data-fetch" && req.method === "GET") {
    try {
      const result = await sql`SELECT * FROM cabinete`;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tableName: "playing_with_neon", columns: Object.keys(result[0]), rows: result }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error retrieving data" }));
    }
  } else if (req.url === "/update" && req.method === "POST") {
    let body = '';
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      const { id, name, value } = JSON.parse(body);
      try {
        await sql`UPDATE playing_with_neon SET name = ${name}, value = ${value} WHERE id = ${id}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Entry updated successfully!" }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error updating entry" }));
      }
    });
  } else if (req.url === "/delete" && req.method === "POST") {
    let body = '';
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      const { id } = JSON.parse(body);
      try {
        await sql`DELETE FROM playing_with_neon WHERE id = ${id}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Entry deleted successfully!" }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error deleting entry" }));
      }
    });
  } else if (req.url === "/add" && req.method === "POST") {
    let body = '';
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      const { name, value } = JSON.parse(body);
      try {
        await sql`INSERT INTO playing_with_neon (name, value) VALUES (${name}, ${value})`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Entry added successfully!" }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error adding entry" }));
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
};

const server = http.createServer(requestHandler);
const PORT = 8080;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
