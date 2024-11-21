const http = require("http");
const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
require("dotenv").config();

const sql = neon(process.env.DATABASE_URL);
const allowedTables = ["cabinete", "medici", "asistenti", "pacienti", "consultatii", "retete", "medicamente", "reteta_medicament"];

const requestHandler = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve main menu page
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
  // Serve interm.html page
  else if (req.url === "/interm.html" && req.method === "GET") {
    fs.readFile("interm.html", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading page");
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      }
    });
  }
  // Data fetch route for allowed tables
  else if (req.url.startsWith("/data-fetch/")) {
    const tableName = req.url.split("/").pop();
    console.log("Requested Table:", tableName);
    if (allowedTables.includes(tableName)) {
      try {
        const query=`SELECT * FROM ${tableName}`;
        const result = await sql(query);
        console.log("Data Retrieved:", result);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ tableName, columns: Object.keys(result[0] || {}), rows: result }));
      } catch (error) {
        console.error("Error fetching data:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Error retrieving data" }));
      }
    } 
  }
  else if (req.method === 'DELETE' && req.url.startsWith('/delete/')) {
    const urlParts = req.url.split('/');
    const tableName = urlParts[2];
    const id = urlParts[3];
    console.log(tableName,id);
    if (!allowedTables.includes(tableName)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized table deletion' }));
      return;
    }
    try {
      const primaryKeyQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${tableName}'
    `;
       const primaryKeyResult = await sql(primaryKeyQuery);
       primaryKeyColumn = primaryKeyResult[0].column_name;
      if (tableName=='cabinete'){
         primaryKeyColumn=primaryKeyResult[1].column_name;
      }
      else if(tableName=='pacienti' || tableName=='retete'){
         primaryKeyColumn=primaryKeyResult[3].column_name;
      }
      else if(tableName=='consultatii'){
         primaryKeyColumn=primaryKeyResult[2].column_name;
      }
      const query = `DELETE FROM ${tableName} WHERE ${primaryKeyColumn} = ${id}`;
      await sql(query);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Row deleted successfully' }));
    } catch (error) {
      console.error('Error deleting row:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error deleting row' }));
    }
  }
  else if (req.method === 'POST' && req.url.startsWith('/insert/')) {
    const tableName = req.url.split('/')[2];
    
    if (!allowedTables.includes(tableName)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized table insertion' }));
      return;
    }
    // Read the request body
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();}); 
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        // Get column names for the table
        const columnsQuery = `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = '${tableName}'
          ORDER BY ordinal_position;
        `;
        const columns = await sql(columnsQuery);
        const columnNames = columns.map(col => col.column_name);
        // Build the INSERT query
        const values = columnNames.map(col => data[col] || null);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const query = `
          INSERT INTO ${tableName} (${columnNames.join(', ')})
          VALUES (${placeholders})
          RETURNING *;
        `;

        const result = await sql(query, values);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Row inserted successfully',
          data: result[0]
        }));
      } catch (error) {
        console.error('Error inserting row:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error inserting row' }));
      }
    });
  }
  else if (req.method === 'PUT' && req.url.startsWith('/update/')) {
    const urlParts = req.url.split('/');
    const tableName = urlParts[2];
    if (!allowedTables.includes(tableName)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized table update' }));
      return;
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { columnName, newValue, idColumn, idValue } = data;

        // Sanitize the column name to prevent SQL injection
        const columnQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}'
        `;
        const columns = await sql(columnQuery);
        const validColumns = columns.map(col => col.column_name);
        if (!validColumns.includes(columnName)) {
          throw new Error('Invalid column name');
        }

        // Get primary key column
        let primaryKeyColumn;
        if (tableName === 'cabinete') {
          primaryKeyColumn = columns[1].column_name;
        } else if (tableName === 'pacienti' || tableName === 'retete') {
          primaryKeyColumn = columns[3].column_name;
        } else if (tableName === 'consultatii') {
          primaryKeyColumn = columns[2].column_name;
        } else {
          primaryKeyColumn = columns[0].column_name;
        }

        const updateQuery = `
          UPDATE ${tableName} 
          SET ${columnName} = $1 
          WHERE ${primaryKeyColumn} = $2 
          RETURNING *
        `;
        const result = await sql(updateQuery, [newValue, idValue]);
        if (result.length === 0) {
          throw new Error('Record not found');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Record updated successfully',
          data: result[0]
        }));
      } catch (error) {
        console.error('Error updating record:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error updating record' }));
      }
    });
  }
};

const server = http.createServer(requestHandler);
const PORT = 8080;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));