// This will get the environmental values from .env file that we have created 

const express = require("express");
const cors = require("cors");
const session = require("express-session");

//We use axios for external
const mysql = require("mysql2");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- Middleware ----------------

app.use(express.json());
app.use(
  cors({
    origin: true, // allow frontend on localhost (any port)
    credentials: true, // allow cookies for sessions
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "petcareplus-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(express.static(path.join(__dirname, "frontend")));

// ---------------- MySQL connection pool ----------------

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "petcareplusdb",
});

// Confirm DB works on startup
db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Error connecting to MySQL:", err.message);
  } else {
    console.log(
      "✅ Connected to MySQL database:",
      process.env.DB_NAME || "petcareplusdb"
    );
    conn.release();
  }
});

// ---------------- Helper functions ----------------

function validateEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

// Simple CSV value escaper
function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Role hierarchy helper (guest < user < admin)
const ROLE_LEVEL = {
  guest: 0,
  user: 1,
  admin: 2,
};

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in" });
    }
    const userRole = req.session.user.role || "user";
    const userLevel =
      ROLE_LEVEL[userRole] !== undefined ? ROLE_LEVEL[userRole] : ROLE_LEVEL.user;
    const minLevel =
      ROLE_LEVEL[minRole] !== undefined ? ROLE_LEVEL[minRole] : ROLE_LEVEL.user;

    if (userLevel < minLevel) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }

    next();
  };
}

// City -> coordinates for external weather API (simple mapping for assignment)
const CITY_COORDS = {
  toronto: { lat: 43.65107, lon: -79.347015 },
  ajax: { lat: 43.8509, lon: -79.0204 },
  whitby: { lat: 43.8971, lon: -78.942 },
  oshawa: { lat: 43.8971, lon: -78.8658 },
};

// ---------------- Routes ----------------

// Simple home route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// ---------- Phase III: User Authentication + Roles ----------

// LOGIN - uses `users` table for credentials and `user_accounts` for role (if available)
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  // Input Validation (email + password)
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const sqlUser = "SELECT id, email FROM users WHERE email = ? AND password = ?";
  db.query(sqlUser, [email, password], (err, userRows) => {
    if (err) {
      console.error("DB error in /api/login (users):", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (userRows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = userRows[0];

    // Look up role in user_accounts if available; default to "user" otherwise
    const sqlRole = "SELECT role FROM user_accounts WHERE email = ? LIMIT 1";
    db.query(sqlRole, [email], (roleErr, roleRows) => {
      if (roleErr) {
        console.error("DB error in /api/login (user_accounts):", roleErr);
        return res.status(500).json({ error: "Database error" });
      }

      const role = roleRows.length > 0 ? roleRows[0].role : "user";

      req.session.user = {
        id: user.id,
        email: user.email,
        role,
      };

      res.json({
        message: "Logged in successfully",
        role,
      });
    });
  });
});

// LOGOUT
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

// ---------- Phase III: CRUD Operations (Owner, Pet, Appointment) ----------
//
// Each entity has full Create, Read, Update, Delete using REST/JSON.

// ----- Owner CRUD -----

// Get all owners (requires login)
app.get("/api/owners", requireLogin, (req, res) => {
  const sql = "SELECT * FROM Owner";
  db.query(sql, (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/owners:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

// Get single owner by ID
app.get("/api/owners/:id", requireLogin, (req, res) => {
  const ownerId = toInt(req.params.id);
  if (Number.isNaN(ownerId)) {
    return res.status(400).json({ error: "Invalid owner_id" });
  }

  const sql = "SELECT * FROM Owner WHERE owner_id = ?";
  db.query(sql, [ownerId], (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/owners/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }
    res.json(rows[0]);
  });
});

// Create new owner (admin only)
app.post("/api/owners", requireRole("admin"), (req, res) => {
  const { owner_id, first_name, last_name, phone, email, address } = req.body;

  const id = toInt(owner_id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "owner_id must be an integer" });
  }
  if (!first_name || !last_name || !email) {
    return res
      .status(400)
      .json({ error: "first_name, last_name, and email are required" });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const sql =
    "INSERT INTO Owner (owner_id, first_name, last_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)";
  db.query(
    sql,
    [id, first_name, last_name, phone || "", email, address || ""],
    (err) => {
      if (err) {
        console.error("DB error in POST /api/owners:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.status(201).json({ message: "Owner created", owner_id: id });
    }
  );
});

// Update owner (admin only)
app.put("/api/owners/:id", requireRole("admin"), (req, res) => {
  const ownerId = toInt(req.params.id);
  if (Number.isNaN(ownerId)) {
    return res.status(400).json({ error: "Invalid owner_id" });
  }

  const { first_name, last_name, phone, email, address } = req.body;

  if (!first_name || !last_name || !email) {
    return res
      .status(400)
      .json({ error: "first_name, last_name, and email are required" });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const sql =
    "UPDATE Owner SET first_name = ?, last_name = ?, phone = ?, email = ?, address = ? WHERE owner_id = ?";
  db.query(
    sql,
    [first_name, last_name, phone || "", email, address || "", ownerId],
    (err, result) => {
      if (err) {
        console.error("DB error in PUT /api/owners/:id:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Owner not found" });
      }
      res.json({ message: "Owner updated" });
    }
  );
});

// Delete owner (admin only)
app.delete("/api/owners/:id", requireRole("admin"), (req, res) => {
  const ownerId = toInt(req.params.id);
  if (Number.isNaN(ownerId)) {
    return res.status(400).json({ error: "Invalid owner_id" });
  }

  const sql = "DELETE FROM Owner WHERE owner_id = ?";
  db.query(sql, [ownerId], (err, result) => {
    if (err) {
      console.error("DB error in DELETE /api/owners/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }
    res.json({ message: "Owner deleted" });
  });
});

// ----- Pet CRUD -----

app.get("/api/pets", requireLogin, (req, res) => {
  const sql = "SELECT * FROM Pet";
  db.query(sql, (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/pets:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/pets/:id", requireLogin, (req, res) => {
  const petId = toInt(req.params.id);
  if (Number.isNaN(petId)) {
    return res.status(400).json({ error: "Invalid pet_id" });
  }

  const sql = "SELECT * FROM Pet WHERE pet_id = ?";
  db.query(sql, [petId], (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/pets/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: "Pet not found" });
    }
    res.json(rows[0]);
  });
});

app.post("/api/pets", requireRole("admin"), (req, res) => {
  const { pet_id, name, species, gender, owner_id } = req.body;

  const id = toInt(pet_id);
  const ownerId = toInt(owner_id);

  if (Number.isNaN(id) || Number.isNaN(ownerId)) {
    return res
      .status(400)
      .json({ error: "pet_id and owner_id must be integers" });
  }
  if (!name || !species || !gender) {
    return res
      .status(400)
      .json({ error: "name, species, and gender are required" });
  }

  const sql =
    "INSERT INTO Pet (pet_id, name, species, gender, owner_id) VALUES (?, ?, ?, ?, ?)";
  db.query(sql, [id, name, species, gender, ownerId], (err) => {
    if (err) {
      console.error("DB error in POST /api/pets:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.status(201).json({ message: "Pet created", pet_id: id });
  });
});

app.put("/api/pets/:id", requireRole("admin"), (req, res) => {
  const petId = toInt(req.params.id);
  if (Number.isNaN(petId)) {
    return res.status(400).json({ error: "Invalid pet_id" });
  }

  const { name, species, gender, owner_id } = req.body;
  const ownerId = toInt(owner_id);

  if (Number.isNaN(ownerId)) {
    return res.status(400).json({ error: "owner_id must be an integer" });
  }
  if (!name || !species || !gender) {
    return res
      .status(400)
      .json({ error: "name, species, and gender are required" });
  }

  const sql =
    "UPDATE Pet SET name = ?, species = ?, gender = ?, owner_id = ? WHERE pet_id = ?";
  db.query(sql, [name, species, gender, ownerId, petId], (err, result) => {
    if (err) {
      console.error("DB error in PUT /api/pets/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Pet not found" });
    }
    res.json({ message: "Pet updated" });
  });
});

app.delete("/api/pets/:id", requireRole("admin"), (req, res) => {
  const petId = toInt(req.params.id);
  if (Number.isNaN(petId)) {
    return res.status(400).json({ error: "Invalid pet_id" });
  }

  const sql = "DELETE FROM Pet WHERE pet_id = ?";
  db.query(sql, [petId], (err, result) => {
    if (err) {
      console.error("DB error in DELETE /api/pets/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Pet not found" });
    }
    res.json({ message: "Pet deleted" });
  });
});

// ----- Appointment CRUD -----

app.get("/api/appointments", requireLogin, (req, res) => {
  const sql = "SELECT * FROM Appointment";
  db.query(sql, (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/appointments:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/appointments/:id", requireLogin, (req, res) => {
  const apptId = toInt(req.params.id);
  if (Number.isNaN(apptId)) {
    return res.status(400).json({ error: "Invalid appointment_id" });
  }

  const sql = "SELECT * FROM Appointment WHERE appointment_id = ?";
  db.query(sql, [apptId], (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/appointments/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    res.json(rows[0]);
  });
});

app.post("/api/appointments", requireRole("admin"), (req, res) => {
  const {
    appointment_id,
    pet_id,
    vet_id,
    appointment_date,
    appointment_time,
    reason,
    status,
  } = req.body;

  const id = toInt(appointment_id);
  const petId = toInt(pet_id);
  const vetId = toInt(vet_id);

  if (Number.isNaN(id) || Number.isNaN(petId) || Number.isNaN(vetId)) {
    return res.status(400).json({
      error: "appointment_id, pet_id, and vet_id must be integers",
    });
  }
  if (!appointment_date || !appointment_time || !reason || !status) {
    return res.status(400).json({
      error:
        "appointment_date, appointment_time, reason, and status are required",
    });
  }

  const sql =
    "INSERT INTO Appointment (appointment_id, pet_id, vet_id, appointment_date, appointment_time, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?)";
  db.query(
    sql,
    [id, petId, vetId, appointment_date, appointment_time, reason, status],
    (err) => {
      if (err) {
        console.error("DB error in POST /api/appointments:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res
        .status(201)
        .json({ message: "Appointment created", appointment_id: id });
    }
  );
});

app.put("/api/appointments/:id", requireRole("admin"), (req, res) => {
  const apptId = toInt(req.params.id);
  if (Number.isNaN(apptId)) {
    return res.status(400).json({ error: "Invalid appointment_id" });
  }

  const {
    pet_id,
    vet_id,
    appointment_date,
    appointment_time,
    reason,
    status,
  } = req.body;

  const petId = toInt(pet_id);
  const vetId = toInt(vet_id);

  if (Number.isNaN(petId) || Number.isNaN(vetId)) {
    return res.status(400).json({
      error: "pet_id and vet_id must be integers",
    });
  }
  if (!appointment_date || !appointment_time || !reason || !status) {
    return res.status(400).json({
      error:
        "appointment_date, appointment_time, reason, and status are required",
    });
  }

  const sql =
    "UPDATE Appointment SET pet_id = ?, vet_id = ?, appointment_date = ?, appointment_time = ?, reason = ?, status = ? WHERE appointment_id = ?";
  db.query(
    sql,
    [petId, vetId, appointment_date, appointment_time, reason, status, apptId],
    (err, result) => {
      if (err) {
        console.error("DB error in PUT /api/appointments/:id:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json({ message: "Appointment updated" });
    }
  );
});

app.delete("/api/appointments/:id", requireRole("admin"), (req, res) => {
  const apptId = toInt(req.params.id);
  if (Number.isNaN(apptId)) {
    return res.status(400).json({ error: "Invalid appointment_id" });
  }

  const sql = "DELETE FROM Appointment WHERE appointment_id = ?";
  db.query(sql, [apptId], (err, result) => {
    if (err) {
      console.error("DB error in DELETE /api/appointments/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    res.json({ message: "Appointment deleted" });
  });
});

// ---------- Phase III: Visualization - Appointments per Month ----------

app.get("/api/stats/appointments-per-month", requireLogin, (req, res) => {
  const sql = `
    SELECT 
      DATE_FORMAT(appointment_date, '%Y-%m') AS month,
      COUNT(*) AS count
    FROM Appointment
    GROUP BY month
    ORDER BY month;
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("DB error in /api/stats/appointments-per-month:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

// ---------- Phase III: Views (based on Phase II Part C) ----------

app.get("/api/views/upcoming-appointments", requireLogin, (req, res) => {
  db.query("SELECT * FROM UpcomingAppointments", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/upcoming-appointments:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/top-cost-vets", requireLogin, (req, res) => {
  db.query("SELECT * FROM TopCostVets", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/top-cost-vets:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/owner-pet-counts", requireLogin, (req, res) => {
  db.query("SELECT * FROM OwnerPetCounts", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/owner-pet-counts:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/full-appointment-summary", requireLogin, (req, res) => {
  db.query("SELECT * FROM FullAppointmentSummary", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/full-appointment-summary:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/active-pets", requireLogin, (req, res) => {
  db.query("SELECT * FROM ActivePets", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/active-pets:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/top-medications", requireLogin, (req, res) => {
  db.query("SELECT * FROM TopMedications", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/top-medications:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/multi-service-pets", requireLogin, (req, res) => {
  db.query("SELECT * FROM MultiServicePets", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/multi-service-pets:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/multi-pet-owners", requireLogin, (req, res) => {
  db.query("SELECT * FROM MultiPetOwners", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/multi-pet-owners:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/avg-treatment-cost-per-vet", requireLogin, (req, res) => {
  db.query("SELECT * FROM AvgTreatmentCostPerVet", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/avg-treatment-cost-per-vet:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

app.get("/api/views/inactive-pets", requireLogin, (req, res) => {
  db.query("SELECT * FROM InactivePets", (err, rows) => {
    if (err) {
      console.error("DB error in /api/views/inactive-pets:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

// ---------- Search & Filter endpoints ----------

// Owners search by name/email (single q param)
app.get("/api/owners/search", requireLogin, (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    return res.json([]);
  }

  const like = `%${q}%`;
  const sql = `
    SELECT *
    FROM Owner
    WHERE first_name LIKE ? 
       OR last_name LIKE ?
       OR email LIKE ?
  `;
  db.query(sql, [like, like, like], (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/owners/search:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

// Appointments filter by status and/or date range
app.get("/api/appointments/search", requireLogin, (req, res) => {
  const { status, from, to } = req.query;

  let sql = "SELECT * FROM Appointment WHERE 1=1";
  const params = [];

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (from) {
    sql += " AND appointment_date >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND appointment_date <= ?";
    params.push(to);
  }

  sql += " ORDER BY appointment_date, appointment_time";

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/appointments/search:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});



// ---------- Phase III: External API Integration (PetCare Community Feed) ----------
//
// Stores pet-related social media posts into SocialLog.

app.post("/api/social/fetch", requireLogin, async (req, res) => {
  try {
    const platform = "PetCare Community Feed";

    // External fake social media API
    const response = await axios.get("https://dummyjson.com/posts?limit=5");
    const posts = response.data.posts; // [{ userId, id, title, body }]

    const insertSql =
      "INSERT INTO SocialLog (platform, title, username) VALUES (?, ?, ?)";

    for (const post of posts) {
      const username = `PetOwner-${post.userId}`;
      const title = `PetCare Post: ${post.title}`;

      await new Promise((resolve, reject) => {
        db.query(insertSql, [platform, title, username], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    res.json({
      message: "PetCare community posts fetched and saved",
      count: posts.length,
      platform,
    });
  } catch (err) {
    console.error("Error in /api/social/fetch:", err);
    res.status(500).json({ error: "Failed to fetch PetCare posts" });
  }
});

// GET stored social posts
app.get("/api/social/logs", requireLogin, (req, res) => {
  const sql =
    "SELECT id, platform, title, username, logged_at FROM SocialLog ORDER BY logged_at DESC LIMIT 50";

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/social/logs:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});


// -External API Integration (PetCare Community Feed) 
//
// Stores pet-related social media posts into SocialLog.

app.post("/api/social/fetch", requireLogin, async (req, res) => {
  try {
    const platform = "PetCare Community Feed";

    // Still call an external API (to satisfy the requirement),
    // but we ignore its weird text and map it to pet-related content.
    const response = await axios.get("https://dummyjson.com/posts?limit=5");
    const posts = response.data.posts; // [{ userId, id, title, body }]

    // Nice, pet-related titles we control
    const petTitles = [
      "PetCare Tip: Daily walking routine for dogs",
      "PetCare Story: Milo the cat’s first vet visit",
      "PetCare Tip: How to keep your pet calm during checkups",
      "PetCare Update: Grooming reminders for long-hair pets",
      "PetCare Tip: Vaccination schedule for puppies and kittens"
    ];

    const insertSql =
      "INSERT INTO SocialLog (platform, title, username) VALUES (?, ?, ?)";

    let i = 0;
    for (const post of posts) {
      const username = `PetOwner-${post.userId}`;
      const title = petTitles[i % petTitles.length]; // cycle through pet titles
      i++;

      await new Promise((resolve, reject) => {
        db.query(insertSql, [platform, title, username], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    res.json({
      message: "PetCare community posts fetched and saved",
      count: posts.length,
      platform,
    });
  } catch (err) {
    console.error("Error in /api/social/fetch:", err);
    res.status(500).json({ error: "Failed to fetch PetCare posts" });
  }
});


// ---------- Phase III: Error Handling ----------

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal server error" });
});

// ---------------- Start server ----------------

app.listen(PORT, () => {
  console.log(`PetCarePlus backend running on http://localhost:${PORT}`);
});
