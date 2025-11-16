# DB-management-Service
# PetCarePlus – Setup & Run Instructions (All-In-One Document)

PetCarePlus is a Node.js, Express, and MySQL application for managing veterinary clinic data. This document contains EVERYTHING required to set up the database, configure the environment, install dependencies, start the server, and log in — all in one place.

--------------------------------------------------------------------
How to run

--------------------------------------------------------------------

Copy/paste the SQL below into MySQL:

CREATE DATABASE IF NOT EXISTS project_db;
USE project_db;

CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255)
);

CREATE TABLE user_accounts (
  email VARCHAR(255) PRIMARY KEY,
  role ENUM('user','admin')
);

CREATE TABLE Owner (
  owner_id INT PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  address VARCHAR(255)
);

CREATE TABLE Pet (
  pet_id INT PRIMARY KEY,
  name VARCHAR(100),
  species VARCHAR(100),
  gender VARCHAR(50),
  owner_id INT
);

CREATE TABLE Appointment (
  appointment_id INT PRIMARY KEY,
  pet_id INT,
  vet_id INT,
  appointment_date DATE,
  appointment_time TIME,
  reason VARCHAR(255),
  status VARCHAR(50)
);

INSERT INTO users VALUES (1, 'admin@example.com', 'admin123');
INSERT INTO user_accounts VALUES ('admin@example.com', 'admin');

--------------------------------------------------------------------

Create a file named **.env** in the project root and paste this EXACTLY:

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=project_db
SESSION_SECRET=super-secret-petcareplus
PORT=3000

(If your MySQL user has a password, put it in DB_PASSWORD.)

--------------------------------------------------------------------

Open a terminal inside the project folder and run:

npm install
npm start

You should see:

PetCarePlus backend running on http://localhost:3000
Connected to MySQL database: project_db

--------------------------------------------------------------------

Open the app in your browser:

http://localhost:3000/

Login using:

Email: admin@example.com
Password: admin123

--------------------------------------------------------------------

You can now use the dashboard to manage:
- Owners
- Pets
- Appointments
Clicking a row loads the data into the form for editing.

--------------------------------------------------------------------


--------------------------------------------------------------------
