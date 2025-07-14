import express from "express";
import axios from "axios";
import pg from "pg";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const port = 3000;

// ── PostgreSQL ───────────────────────────────────────────────
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
db.connect();

// ── Middleware & View Engine ─────────────────────────────────
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ───────────────────────────────────────────────────
app.get("/", async (req, res) => {
  const sort = req.query.sort || "read_date"; // Default to recency

  let orderClause;
  if (sort === "rating") {
    orderClause = "ORDER BY rating DESC NULLS LAST";
  } else if (sort === "title") {
    orderClause = "ORDER BY LOWER(title) ASC";
  } else {
    orderClause = "ORDER BY read_date DESC NULLS LAST";
  }

  try {
    const { rows: books } = await db.query(`SELECT * FROM books ${orderClause}`);
    res.render("index", { books });
  } catch (err) {
    console.error("Error fetching sorted books:", err);
    res.status(500).send("Something went wrong. Please try again later.");

  }
});

app.get("/add", (req, res) => res.render("add"));

app.post('/add', async (req, res) => {
  const { title, author, rating, review, read_date } = req.body;
  let cover_url = '';

  try {
    // Fetch book info from Open Library Search API
    const response = await axios.get("https://openlibrary.org/search.json", {
      params: {
        title: title,
        author: author,
        limit: 1,
      },
    });

    const data = response.data;
    const doc = data.docs[0];

    if (doc && doc.cover_i) {
      // Use the cover ID to generate the image URL
      cover_url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    }

    // Insert into database
    await db.query(
      `INSERT INTO books (title, author, rating, review, cover_url, read_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [title, author, rating, review, cover_url, read_date]
    );

    res.redirect('/');
  } catch (err) {
    console.error('Error adding book with cover:', err);
    res.status(500).send("Something went wrong. Please try again later.");

  }
});

app.get("/edit/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT * FROM books WHERE id = $1", [id]);
    const book = result.rows[0];
    res.render("edit", { book });
  } catch (err) {
    console.error("Error fetching book:", err);
    res.status(500).send("Something went wrong. Please try again later.");

  }
});

app.post("/edit/:id", async (req, res) => {
  const { id } = req.params;
  const { title, author, rating, review, cover_url, read_date } = req.body;

  try {
    await db.query(
      `UPDATE books 
       SET title = $1, author = $2, rating = $3, review = $4, cover_url = $5, read_date = $6
       WHERE id = $7`,
      [title, author, rating, review, cover_url, read_date, id]
    );
    res.redirect("/");
  } catch (err) {
    console.error("Error updating book:", err);
    res.status(500).send("Something went wrong. Please try again later.");

  }
});


app.post("/delete/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM books WHERE id = $1", [id]);
    res.redirect("/");
  } catch (err) {
    console.error("Error deleting book:", err);
   res.status(500).send("Something went wrong. Please try again later.");

  }
});


// ── Start Server ─────────────────────────────────────────────
app.listen(port, () =>
  console.log(`Server is running on http://localhost:${port}`)
);
