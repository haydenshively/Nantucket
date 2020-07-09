require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

;(async () => {
  const client = await pool.connect()
  console.log("Connected");
  try {
    await client.query(
      "INSERT INTO users (address) VALUES ('284e835255c0865e18abc5f544bce5519422a1aa');",
    );
    const res = await client.query(
      "SELECT * FROM users;"
    );
    console.log(res.rows);
  } finally {
    // Make sure to release the client before any error handling,
    // just in case the error handling itself throws an error.
    client.release();
  }
  pool.end();
})().catch(err => console.log(err.stack))