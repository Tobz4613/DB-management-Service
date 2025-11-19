// This is group 17's backend portion


// ------------- ALL IMPORTS ----------------
// This will get the environemntal values from .env file that we have created
// Express allowed us to communite with any get or posts requests
const express = require("express");
const cors = require("cors");
const session = require("express-session");


//We use axios for external
const mysql = require("mysql2");
// axios came in helpful for the external api stuff
const axios = require("axios");
const path = require("path");


const app = express();
const PORT = process.env.PORT || 3000;


// ---------------- MIDDLE MAN ------------


// This portion will basically act as a middle man between the backend and frontend
// Will ultimately connect it together  


app.use(express.json());
app.use(
      cors({
    // If this is true, the frontend is allowed to be on local host
    origin: true,
      //If this is true, cookies will be added.
      //Will keep track of user data
      credentials: true,
  })
);


app.use(
  session({
// We are now checking the env file
    secret: process.env.SESSION_SECRET || "petcareplus-secret-key",
    // This is checking the secret key
    resave: false,
    saveUninitialized: false,
  })
);
    app.use(express.static(path.join(__dirname, "frontend")));


// This portion actually connects the database to the backend
//We make sure the database name macthes


const db = mysql.createPool({
  // We make sure it matches the local host
  host: process.env.DB_HOST || "localhost",
  // The backend will follow the database root
  user: process.env.DB_USER || "root",
  // TWe did not have a password for my sql so thats why its empty
  password: process.env.DB_PASSWORD || "",
  // Make sure the name is exactly the same or else there will be database connection errors.
  // The database will not connect if name doesnt match
  // we faced many issues because of simple mistakes like mistmatchign names
   database: process.env.DB_NAME || "petcareplusdb",
});


// This portion of code will now check to see if the database will start
// This will attempt tp get the database connection
db.getConnection((err, conn) => {
  // if this part fails, we print an error message
  // this urges the user to try and fix
  if (err) {
    console.error("❌ Error connecting to MySQL database:", err.message);
  } else {
    console.log(
      // If we do it correctly a successful connection message will be displayed
      "🟢  We successfully Connected to MySQL database:",
      // This is the database name
      process.env.DB_NAME || "petcareplusdb"
    );
    // This ends the console
    conn.release();
  }
});


// ---------------------- FUNCTION HELPERS --------------


// This portion of code acts as a helper function
// We check if the email is valid.
// This is compared to the email that is in the sql database
function validateEmail(email) {
  // checks if email is good
  if (!email) return false;
  // we get an error message if the email is not valid in the database
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // will retry again
  return re.test(email);
}


// This is a simple toInt function
// We added this for extra security in this program
function toInt(value) {
  // We did this just avoid any sql crashes that could happe
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}


//--------------CSV----------------


// This is our Csv portion
function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  // This allowed us to not have any csv files crash if theres '
  const s = String(value);
  // We implemeneted this beacuse our team ran into trouble with this exact issue. Csv would crash because of commas
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
    //
  }
  return s;
}


// This represents a hierchy
const ROLE_LEVEL = {
  // The guest will have the least amount of freedom
  guest: 0,
  user: 1, // user has more freedok
  admin: 2, // admin has most freedom
};


// Checks if login info is valid
function requireLogin(req, res, next) {
  // if any non user tries logging an error will be printed
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}
// This function is implemented to check the role of the user
function requireRole(minRole) { // will return a function
  return (req, res, next) => {
    if (!req.session.user) { // Again does a check to see if the user is valid first of all
      return res.status(401).json({ error: "Not logged in" }); // prints an error
    }
    const userRole = req.session.user.role || "user";
    const userLevel =
      ROLE_LEVEL[userRole] !== undefined ? ROLE_LEVEL[userRole] : ROLE_LEVEL.user;
    const minLevel =
      ROLE_LEVEL[minRole] !== undefined ? ROLE_LEVEL[minRole] : ROLE_LEVEL.user;


    if (userLevel < minLevel) { // checks if users role is lower that min
      return res.status(403).json({ error: "Forbidden: insufficient role" }); // if its lower an error will be printed
    }


    next();
  };
}


// -------------- Routes -------------


// Acts as simple route
app.get("/", (req, res) => { // if / is hit, the login page is sent
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});


// ---------- Phase 3 User Authentication and roles----------


// LOGIN - uses `users` table for credentials and `user_accounts` for role (if available)
app.post("/api/login", (req, res) => {
  const { email, password } = req.body; // Reads email and password


  // Input Validation
  if (!email || !password) {
    // If none are entered, an error will print
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (!validateEmail(email)) { // checks to see if email format is valid
    // Prints error
    return res.status(400).json({ error: "Invalid email format" });
  }
 
  // Checks if any of the email or password directly macthes any user in the user sql table
  const sqlUser = "SELECT id, email FROM users WHERE email = ? AND password = ?";
  db.query(sqlUser, [email, password], (err, userRows) => {
    if (err) {
      // errors will be printed if condition comes across an error
      console.error("DB error in /api/login (users):", err);
      return res.status(500).json({ error: "Database error" });
    }


    if (userRows.length === 0) { // if nothing is filled, print an error
      return res.status(401).json({ error: "Invalid email or password" });
    }


    const user = userRows[0];


    // This will now validate user roles that are entered
    const sqlRole = "SELECT role FROM user_accounts WHERE email = ? LIMIT 1";
    db.query(sqlRole, [email], (roleErr, roleRows) => {
      if (roleErr) {
        console.error("DB error in /api/login (user_accounts):", roleErr);
        return res.status(500).json({ error: "Database error" });
      }


      const role = roleRows.length > 0 ? roleRows[0].role : "user";


      // requests keep track of whihc role is logged in
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


// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => { // simple logout system
    res.json({ message: "Logged out" }); // prints when logged out
  });
});


// ---------- Phase III: CRUD Operations (Owner, Pet, Appointment) ----------


// Each will have the ability Create, Read, Update, Delete using REST/JSON.


// ----- Owner CRUD -----
// Retrives an owner list
app.get("/api/owners", requireLogin, (req, res) => { // Need to be logged in
  const sql = "SELECT * FROM Owner";
  db.query(sql, (err, rows) => { // Displays list of owners
    if (err) {
      console.error("DB error in GET /api/owners:", err); // Error message will be displayed if cant find in sql
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});


// Get single owner by ID
app.get("/api/owners/:id", requireLogin, (req, res) => {
  const ownerId = toInt(req.params.id); // COnverts id to int
  if (Number.isNaN(ownerId)) { // Validates if owner id is incorrect
    return res.status(400).json({ error: "Invalid owner_id" });
  }


  const sql = "SELECT * FROM Owner WHERE owner_id = ?"; // WIll now allow for queries for Owner
  db.query(sql, [ownerId], (err, rows) => {
    if (err) { // Checks if there is a database error
      console.error("DB error in GET /api/owners/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (rows.length === 0) { // If no more owner rows are left, owner doesnt exist
      return res.status(404).json({ error: "Owner not found" }); // Error will be printed
    }
    // Exit
    res.json(rows[0]);
  });
});


// Create new owner
// Only works for an admin
app.post("/api/owners", requireRole("admin"), (req, res) => { // Validates if owner variables are avlid
  const { owner_id, first_name, last_name, phone, email, address } = req.body;


  // simple change to int
  const id = toInt(owner_id);
  if (Number.isNaN(id)) { // We check if the owner id is an int, other wise print error
    return res.status(400).json({ error: "owner_id must be an integer" });
  }
  if (!first_name || !last_name || !email) { // We make sure these fields are filled.
    return res // cannot be empty
      .status(400)
      .json({ error: "first_name, last_name, and email are required" });
  }
  if (!validateEmail(email)) { // Validates email adress
    return res.status(400).json({ error: "Invalid email format" });
  }


  // Will generate the new owner table
  const sql =
    "INSERT INTO Owner (owner_id, first_name, last_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)";
  db.query(
    sql,
    [id, first_name, last_name, phone || "", email, address || ""],
    (err) => {
      if (err) { // Again checks for database errors
        console.error("DB error in POST /api/owners:", err);
        return res.status(500).json({ error: "Database error" });
      } // When owner is created table will get updated
      res.status(201).json({ message: "Owner created", owner_id: id });
    }
  );
});


// Update owner (admin only)
app.put("/api/owners/:id", requireRole("admin"), (req, res) => { // Checks if role is admin
  const ownerId = toInt(req.params.id); // Makes sure id is only int
  if (Number.isNaN(ownerId)) { // Will print an error
    return res.status(400).json({ error: "Invalid owner_id" });
  }
// These are our parameters
  const { first_name, last_name, phone, email, address } = req.body;


  if (!first_name || !last_name || !email) {
    return res
      .status(400) // We check if these 3 fields are entered
      .json({ error: "first_name, last_name, and email are required" }); // Error message
  }
  if (!validateEmail(email)) { // We also check if the email format is valid
    return res.status(400).json({ error: "Invalid email format" });
  }


  const sql = // We updated the table
    "UPDATE Owner SET first_name = ?, last_name = ?, phone = ?, email = ?, address = ? WHERE owner_id = ?";
  db.query(
    sql, // Updates are acrried out from sql and sent
    [first_name, last_name, phone || "", email, address || "", ownerId],
    (err, result) => {
      if (err) { // Again prints an error if database error happens
        console.error("DB error in PUT /api/owners/:id:", err);
        return res.status(500).json({ error: "Database error" });
      } // If there are no rows left that means theres no more owners
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Owner not found" });
      } // Prints a little message beneath the table to confirm that the owner table has been updated
      res.json({ message: "Owner updated" });
    }
  );
});


// Delete owner
// This can again only be done by admin
app.delete("/api/owners/:id", requireRole("admin"), (req, res) => {
  const ownerId = toInt(req.params.id); // makes sure the owner id an int
// Side comment: we are constantly focusing on the owner id value as that it is the value to be selected which allows for change in the table
  if (Number.isNaN(ownerId)) {
    return res.status(400).json({ error: "Invalid owner_id" }); // Prints an error if id is invalid
  }


  const sql = "DELETE FROM Owner WHERE owner_id = ?"; // Deletes from whichever id is selected
  db.query(sql, [ownerId], (err, result) => {
    if (err) { // prints if there is a database error
      console.error("DB error in DELETE /api/owners/:id:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.affectedRows === 0) { // if there are no more rows left, we know the owner table is now empty
      return res.status(404).json({ error: "Owner not found" });
    }
    res.json({ message: "Owner deleted" }); // Prints a confirmation message underneath the table after deletion
  });
});


// ----- Pet CRUD -----
// We did not comment for this pet portion as it is repeptive to CRUD Owner
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
// Once again, no comments for most of this portion as it is repepetive to Owner and Pet CRUD
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


// ---------- Phase III: Visualization  ----------


// This portion focuses on the appointments per month


app.get("/api/stats/appointments-per-month", requireLogin, (req, res) => { // Only logged in users are able to control
  const sql = `
    SELECT
      DATE_FORMAT(appointment_date, '%Y-%m') AS month,
      COUNT(*) AS count
    FROM Appointment
    GROUP BY month
    ORDER BY month;
  `; // This sorts using date YYYY-MM format
    // Also counts the amount of appointments made
  db.query(sql, (err, rows) => {
    if (err) {
      console.error("DB error in /api/stats/appointments-per-month:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows); // Will returun date and count of appointments
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
// Pet related Social Meida


app.post("/api/social/fetch", requireLogin, async (req, res) => {
  try {
    const platform = "PetCare Community Feed";


   
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


// ---------- CSV Export: Owners ----------


// ---------- CSV Export: Owners ----------
app.get("/api/export/owners.csv", requireRole("admin"), (req, res) => {
  const sql = "SELECT * FROM Owner";


  db.query(sql, (err, rows) => {
    if (err) {
      console.error("DB error in GET /api/export/owners.csv:", err);
      return res.status(500).json({ error: "Database error" });
    }


    // Tell browser this is CSV + attachment
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="owners.csv"');


    // If no rows, just send header line
    if (!rows || rows.length === 0) {
      return res.send("owner_id,first_name,last_name,phone,email,address\n");
    }


    // Build CSV using the helper you already defined
    const headers = Object.keys(rows[0]);
    const lines = [];


    // Header row
    lines.push(headers.join(","));


    // Data rows
    for (const row of rows) {
      const values = headers.map((h) => toCsvValue(row[h]));
      lines.push(values.join(","));
    }


    const csv = lines.join("\n");
    res.send(csv);
  });
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

