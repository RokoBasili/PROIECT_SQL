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
  else if (req.url === "/fetch-tables" && req.method === "GET") {
    try {
      const query = `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `;
      const result = await sql(query);
      const tables = result.reduce((acc, { table_name, column_name }) => {
        if (!acc[table_name]) acc[table_name] = [];
        acc[table_name].push(column_name);
        return acc;
      }, {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tables));
    } catch (error) {
      console.error("Error fetching table structures:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error fetching table structures" }));
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
  else if (req.url === "/ComplexQuery.html" && req.method === "GET") {
    fs.readFile("ComplexQuery.html", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading complex query page");
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      }
    });
  } 
  else if (req.url === "/JoinQuery.html" && req.method === "GET") {
    fs.readFile("JoinQuery.html", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading Join query page");
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      }
    });
  }
  else if (req.method === "POST" && req.url === "/predefined-query-1") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT *
          FROM medici m
          JOIN cabinete c ON m.id_cabinet = c.id_cabinet
          JOIN asistenti a ON m.id_medic = a.id_medic
          ${userInput ? `WHERE m.nume_medic LIKE '${userInput}%'` : ''}
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in predefined query 1:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in predefined query 1" }));
    }
  } 
  else if (req.method === "POST" && req.url === "/predefined-query-2") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT *
          FROM medici m
          JOIN pacienti p ON m.id_medic = p.id_medic
          ${userInput ? `WHERE p.varsta_pacient <= ${parseInt(userInput)}` : ''}
          ORDER BY p.varsta_pacient
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in predefined query 2:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in predefined query 2" }));
    }
  }
  else if (req.method === "POST" && req.url === "/predefined-query-3") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT *
          FROM pacienti p
          JOIN consultatii c ON p.cnp = c.cnp
          ${userInput ? `WHERE c.cnp LIKE '${userInput}%'` : ''}
          ORDER BY c.an_consultatie DESC
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in predefined query 3:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in predefined query 3" }));
    }
  }
  else if (req.method === "POST" && req.url === "/predefined-query-4") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT *
          FROM consultatii c
          LEFT JOIN retete r ON c.id_consultatie = r.id_consultatie
          ORDER BY c.severitate_diagnostic
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in predefined query 4:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in predefined query 4" }));
    }
  }
  else if (req.method === "POST" && req.url === "/predefined-query-5") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT *
          FROM reteta_medicament rm
          INNER JOIN medicamente m ON m.id_medicament = rm.id_medicament
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in predefined query 5:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in predefined query 5" }));
    }
  }
  else if (req.method === "POST" && req.url === "/complex-query-1") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT m.nume_medic,m.prenume_medic,m.nrtelefon_medic,m.specializare_medic,m.data_nasterii,
          (SELECT COUNT(*) 
          FROM asistenti a 
          WHERE a.id_medic = m.id_medic) AS Numar_Asistenti
        FROM medici m
        ${userInput ? `WHERE m.specializare_medic LIKE '%${userInput}%'` : ''}
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in Complex query 1:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in Complex query 1" }));
    }
  }
  else if (req.method === "POST" && req.url === "/complex-query-2") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT m.nume_medic,m.prenume_medic,m.nrtelefon_medic,m.specializare_medic,m.data_nasterii,Count(a.id_medic) AS Nr_Pacienti
          FROM medici m JOIN (SELECT p.nume_pacient,p.prenume_pacient,p.varsta_pacient,p.nrtelefon_pacient,
                                                        p.ocupatie_actuala,c.diagnostic,c.data_consultatie,p.id_medic
          FROM pacienti p JOIN consultatii c ON c.cnp=p.cnp 
          WHERE existenta_id_reteta = 'TRUE' ${userInput ? `AND p.ocupatie_actuala LIKE '%${userInput}%'` : ''}) 
          AS a ON m.id_medic=a.id_medic
          WHERE data_nasterii>='1980-01-01'
          GROUP BY m.id_medic
          HAVING Count(a.id_medic)>=2 AND (AVG(a.varsta_pacient)>=25 AND AVG(a.varsta_pacient)<=65)
          ORDER BY Count(a.id_medic)
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in Complex query 2:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in Complex query 2" }));
    }
  }
  else if (req.method === "POST" && req.url === "/complex-query-3") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT ROUND(AVG(severitate_diagnostic),2) AS Medie_Severitate_Diag,an_consultatie,ROUND(AVG(varsta_pacient),2) AS Medie_Varsta_Pacient_An
          FROM pacienti p JOIN consultatii c ON c.cnp=p.cnp
          ${userInput ? `WHERE c.an_consultatie >= ${parseInt(userInput)}` : ''}
          GROUP BY c.an_consultatie
          ORDER BY c.an_consultatie
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in Complex query 3:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in Complex query 3" }));
    }
  }
  else if (req.method === "POST" && req.url === "/complex-query-4") {
    try {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        const { userInput } = JSON.parse(body);
        const query = `
          SELECT r.tip_reteta,COUNT(r.tip_reteta) AS Numar_de_Retete,ROUND(AVG(r.probstoc_suficient)) AS Medie_Indeplinire_Stoc
          FROM retete AS r JOIN reteta_medicament AS rm ON r.id_reteta=rm.id_reteta
          WHERE rm.medicament_nou='FALSE' AND rm.indeplinire_cerere='FALSE'
          GROUP BY r.tip_reteta
          ORDER BY Numar_de_Retete DESC,r.tip_reteta
        `;
        const result = await sql(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    } catch (error) {
      console.error("Error in Complex query 4:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Error in Complex query 4" }));
    }
  }
};

const server = http.createServer(requestHandler);
const PORT = 8080;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
