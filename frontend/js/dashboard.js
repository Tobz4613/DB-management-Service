let appointmentsChart = null; // for the Analytics chart

// Run when dashboard loads
window.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupLogout();
  setupOwnerHandlers();
  setupPetHandlers();
  setupAppointmentHandlers();
  setupAppointmentsChart();   // Analytics chart
  setupViews();               // Views / Reports tab
  setupSearchAndExport();     // Search + CSV export

  // try to load data; if not logged in, backend will return 401
  refreshAll();
});

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const sections = document.querySelectorAll(".tab-section");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-target");
      document.getElementById(targetId).classList.add("active");
    });
  });
}

function setupLogout() {
  const btn = document.getElementById("logout-btn");
  if (btn) {
    btn.addEventListener("click", handleLogout);
  }
}

function setDashboardMessage(text) {
  const el = document.getElementById("dashboard-message");
  el.textContent = text || "";
}

/* ---------------- OWNERS ---------------- */

function setupOwnerHandlers() {
  const form = document.getElementById("owner-form");
  const deleteBtn = document.getElementById("owner-delete-btn");
  const tableBody = document.querySelector("#owners-table tbody");

  // Safety check so we don't crash if elements are missing
  if (!form || !deleteBtn || !tableBody) {
    console.error("Owner elements not found on page");
    return;
  }

  // click table row → load into form (for quick edits)
  tableBody.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;

    const cells = row.querySelectorAll("td");
    if (cells.length < 6) return;

    document.getElementById("owner_id").value = cells[0].textContent.trim();
    document.getElementById("owner_first_name").value = cells[1].textContent.trim();
    document.getElementById("owner_last_name").value = cells[2].textContent.trim();
    document.getElementById("owner_phone").value = cells[3].textContent.trim();
    document.getElementById("owner_email").value = cells[4].textContent.trim();
    document.getElementById("owner_address").value = cells[5].textContent.trim();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const owner_id = Number(document.getElementById("owner_id").value);
    const first_name = document.getElementById("owner_first_name").value.trim();
    const last_name = document.getElementById("owner_last_name").value.trim();
    const phone = document.getElementById("owner_phone").value.trim();
    const email = document.getElementById("owner_email").value.trim();
    const address = document.getElementById("owner_address").value.trim();

    try {
      // Try update first
      await apiRequest(`/api/owners/${owner_id}`, {
        method: "PUT",
        body: JSON.stringify({
          first_name,
          last_name,
          phone,
          email,
          address,
        }),
      });
      setDashboardMessage("Owner updated (admin only).");
    } catch (err) {
      // If update fails, try create
      try {
        await apiRequest("/api/owners", {
          method: "POST",
          body: JSON.stringify({
            owner_id,
            first_name,
            last_name,
            phone,
            email,
            address,
          }),
        });
        setDashboardMessage("Owner created (admin only).");
      } catch (err2) {
        setDashboardMessage(err2.message);
      }
    }

    refreshOwners();
  });

  deleteBtn.addEventListener("click", async () => {
    const id = Number(document.getElementById("owner_id").value);
    if (!id) {
      setDashboardMessage("Enter an owner ID to delete.");
      return;
    }

    if (!confirm(`Delete owner ${id}?`)) return;

    try {
      await apiRequest(`/api/owners/${id}`, { method: "DELETE" });
      setDashboardMessage("Owner deleted (admin only).");
      refreshOwners();
    } catch (err) {
      setDashboardMessage(err.message);
    }
  });
}

function renderOwnersTable(owners) {
  const tbody = document.querySelector("#owners-table tbody");
  tbody.innerHTML = "";

  owners.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.owner_id}</td>
      <td>${o.first_name}</td>
      <td>${o.last_name}</td>
      <td>${o.phone || ""}</td>
      <td>${o.email}</td>
      <td>${o.address || ""}</td>
      <td>(click row to edit)</td>
    `;
    tbody.appendChild(tr);
  });
}

async function refreshOwners() {
  try {
    const owners = await apiRequest("/api/owners");
    renderOwnersTable(owners);
  } catch (err) {
    if (err.message.includes("Not logged in")) {
      window.location.href = "index.html";
    } else {
      setDashboardMessage(err.message);
    }
  }
}


/* ---------------- PETS ---------------- */

function setupPetHandlers() {
  const form = document.getElementById("pet-form");
  const deleteBtn = document.getElementById("pet-delete-btn");
  const tableBody = document.querySelector("#pets-table tbody");

  tableBody.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const cells = row.querySelectorAll("td");
    document.getElementById("pet_id").value = cells[0].textContent;
    document.getElementById("pet_name").value = cells[1].textContent;
    document.getElementById("pet_species").value = cells[2].textContent;
    document.getElementById("pet_gender").value = cells[3].textContent;
    document.getElementById("pet_owner_id").value = cells[4].textContent;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const pet_id = Number(document.getElementById("pet_id").value);
    const name = document.getElementById("pet_name").value.trim();
    const species = document.getElementById("pet_species").value.trim();
    const gender = document.getElementById("pet_gender").value.trim();
    const owner_id = Number(
      document.getElementById("pet_owner_id").value
    );

    try {
      await apiRequest(`/api/pets/${pet_id}`, {
        method: "PUT",
        body: JSON.stringify({ name, species, gender, owner_id }),
      });
      setDashboardMessage("Pet updated (admin only).");
    } catch (err) {
      try {
        await apiRequest("/api/pets", {
          method: "POST",
          body: JSON.stringify({
            pet_id,
            name,
            species,
            gender,
            owner_id,
          }),
        });
        setDashboardMessage("Pet created (admin only).");
      } catch (err2) {
        setDashboardMessage(err2.message);
      }
    }

    refreshPets();
  });

  deleteBtn.addEventListener("click", async () => {
    const id = Number(document.getElementById("pet_id").value);
    if (!id) {
      setDashboardMessage("Enter a pet ID to delete.");
      return;
    }

    if (!confirm(`Delete pet ${id}?`)) return;

    try {
      await apiRequest(`/api/pets/${id}`, { method: "DELETE" });
      setDashboardMessage("Pet deleted (admin only).");
      refreshPets();
    } catch (err) {
      setDashboardMessage(err.message);
    }
  });
}

async function refreshPets() {
  try {
    const pets = await apiRequest("/api/pets");
    const tbody = document.querySelector("#pets-table tbody");
    tbody.innerHTML = "";

    pets.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.pet_id}</td>
        <td>${p.name}</td>
        <td>${p.species}</td>
        <td>${p.gender}</td>
        <td>${p.owner_id}</td>
        <td>(click row to edit)</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

/* ---------------- APPOINTMENTS ---------------- */

function setupAppointmentHandlers() {
  const form = document.getElementById("appointment-form");
  const deleteBtn = document.getElementById("appt-delete-btn");
  const tableBody = document.querySelector("#appointments-table tbody");

  tableBody.addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const cells = row.querySelectorAll("td");
    document.getElementById("appointment_id").value = cells[0].textContent;
    document.getElementById("appt_pet_id").value = cells[1].textContent;
    document.getElementById("appt_vet_id").value = cells[2].textContent;
    document.getElementById("appt_date").value = cells[3].textContent;
    document.getElementById("appt_time").value = cells[4].textContent;
    document.getElementById("appt_reason").value = cells[5].textContent;
    document.getElementById("appt_status").value = cells[6].textContent;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const appointment_id = Number(
      document.getElementById("appointment_id").value
    );
    const pet_id = Number(
      document.getElementById("appt_pet_id").value
    );
    const vet_id = Number(
      document.getElementById("appt_vet_id").value
    );
    const appointment_date =
      document.getElementById("appt_date").value;
    const appointment_time =
      document.getElementById("appt_time").value;
    const reason = document.getElementById("appt_reason").value.trim();
    const status = document.getElementById("appt_status").value.trim();

    try {
      await apiRequest(`/api/appointments/${appointment_id}`, {
        method: "PUT",
        body: JSON.stringify({
          pet_id,
          vet_id,
          appointment_date,
          appointment_time,
          reason,
          status,
        }),
      });
      setDashboardMessage("Appointment updated (admin only).");
    } catch (err) {
      try {
        await apiRequest("/api/appointments", {
          method: "POST",
          body: JSON.stringify({
            appointment_id,
            pet_id,
            vet_id,
            appointment_date,
            appointment_time,
            reason,
            status,
          }),
        });
        setDashboardMessage("Appointment created (admin only).");
      } catch (err2) {
        setDashboardMessage(err2.message);
      }
    }

    refreshAppointments();
  });

  deleteBtn.addEventListener("click", async () => {
    const id = Number(document.getElementById("appointment_id").value);
    if (!id) {
      setDashboardMessage("Enter an appointment ID to delete.");
      return;
    }

    if (!confirm(`Delete appointment ${id}?`)) return;

    try {
      await apiRequest(`/api/appointments/${id}`, { method: "DELETE" });
      setDashboardMessage("Appointment deleted (admin only).");
      refreshAppointments();
    } catch (err) {
      setDashboardMessage(err.message);
    }
  });
}

function renderAppointmentsTable(appts) {
  const tbody = document.querySelector("#appointments-table tbody");
  tbody.innerHTML = "";

  appts.forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.appointment_id}</td>
      <td>${a.pet_id}</td>
      <td>${a.vet_id}</td>
      <td>${a.appointment_date}</td>
      <td>${a.appointment_time}</td>
      <td>${a.reason}</td>
      <td>${a.status}</td>
      <td>(click row to edit)</td>
    `;
    tbody.appendChild(tr);
  });
}

async function refreshAppointments() {
  try {
    const appts = await apiRequest("/api/appointments");
    renderAppointmentsTable(appts);
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

/* ---------------- ANALYTICS: APPOINTMENTS PER MONTH ---------------- */

async function setupAppointmentsChart() {
  try {
    const data = await apiRequest("/api/stats/appointments-per-month");
    renderAppointmentsChart(data);
  } catch (err) {
    console.error("Error loading appointments per month:", err);
    setDashboardMessage(err.message);
  }
}

function renderAppointmentsChart(rows) {
  const canvas = document.getElementById("appointments-chart");
  if (!canvas) return;

  // Sort by month ascending
  const sorted = [...rows].sort((a, b) => (a.month < b.month ? -1 : 1));
  const labels = sorted.map((r) => r.month); // "YYYY-MM"
  const counts = sorted.map((r) => r.count);

  const ctx = canvas.getContext("2d");

  // Destroy previous chart if exists
  if (appointmentsChart) {
    appointmentsChart.destroy();
  }

  appointmentsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Appointments Per Month",
          data: counts,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: {
          title: { display: true, text: "Month (YYYY-MM)" },
        },
        y: {
          title: { display: true, text: "Number of Appointments" },
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });
}

/* ---------------- SEARCH + EXPORT ---------------- */

function setupSearchAndExport() {
  // Export owners CSV
  const exportBtn = document.getElementById("export-owners-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      window.location.href = "/api/export/owners.csv";
    });
  }

  // Owner search
  const ownerSearchForm = document.getElementById("owner-search-form");
  if (ownerSearchForm) {
    ownerSearchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = document.getElementById("owner-search-q").value.trim();
      if (!q) {
        refreshOwners();
        return;
      }
      try {
        const owners = await apiRequest(
          `/api/owners/search?q=${encodeURIComponent(q)}`
        );
        renderOwnersTable(owners);
      } catch (err) {
        setDashboardMessage(err.message);
      }
    });

    const clearBtn = document.getElementById("owner-search-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        document.getElementById("owner-search-q").value = "";
        refreshOwners();
      });
    }
  }

  // Appointment search/filter
  const apptSearchForm = document.getElementById("appointment-search-form");
  if (apptSearchForm) {
    apptSearchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("appt-search-status").value;
      const from = document.getElementById("appt-search-from").value;
      const to = document.getElementById("appt-search-to").value;

      const params = new URLSearchParams();
      if (status) params.append("status", status);
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      if (!status && !from && !to) {
        refreshAppointments();
        return;
      }

      try {
        const appts = await apiRequest(
          `/api/appointments/search?${params.toString()}`
        );
        renderAppointmentsTable(appts);
      } catch (err) {
        setDashboardMessage(err.message);
      }
    });

    const clearApptBtn = document.getElementById("appt-search-clear");
    if (clearApptBtn) {
      clearApptBtn.addEventListener("click", () => {
        document.getElementById("appt-search-status").value = "";
        document.getElementById("appt-search-from").value = "";
        document.getElementById("appt-search-to").value = "";
        refreshAppointments();
      });
    }
  }
}

/* ---------------- VIEWS (PHASE II) ---------------- */

function setupViews() {
  const buttons = document.querySelectorAll(".view-btn");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-view");
      loadView(key);
    });
  });
}

const VIEW_CONFIG = {
  "upcoming-appointments": {
    endpoint: "/api/views/upcoming-appointments",
    columns: [
      { key: "appointment_id", label: "Appointment ID" },
      { key: "PetName", label: "Pet" },
      { key: "OwnerFirst", label: "Owner First" },
      { key: "OwnerLast", label: "Owner Last" },
      { key: "VetFirst", label: "Vet First" },
      { key: "VetLast", label: "Vet Last" },
      { key: "appointment_date", label: "Date" },
      { key: "appointment_time", label: "Time" },
      { key: "status", label: "Status" },
    ],
  },
  "top-cost-vets": {
    endpoint: "/api/views/top-cost-vets",
    columns: [
      { key: "vet_id", label: "Vet ID" },
      { key: "first_name", label: "First" },
      { key: "last_name", label: "Last" },
      { key: "AvgCost", label: "Avg Cost" },
    ],
  },
  "owner-pet-counts": {
    endpoint: "/api/views/owner-pet-counts",
    columns: [
      { key: "owner_id", label: "Owner ID" },
      { key: "first_name", label: "First" },
      { key: "last_name", label: "Last" },
      { key: "PetCount", label: "# Pets" },
    ],
  },
  "full-appointment-summary": {
    endpoint: "/api/views/full-appointment-summary",
    columns: [
      { key: "PetName", label: "Pet" },
      { key: "status", label: "Status" },
      { key: "appointment_date", label: "Date" },
    ],
  },
  "active-pets": {
    endpoint: "/api/views/active-pets",
    columns: [{ key: "PetName", label: "Pet" }],
  },
  "top-medications": {
    endpoint: "/api/views/top-medications",
    columns: [
      { key: "medication", label: "Medication" },
      { key: "TimesUsed", label: "Times Used" },
    ],
  },
  "multi-service-pets": {
    endpoint: "/api/views/multi-service-pets",
    columns: [
      { key: "PetName", label: "Pet" },
      { key: "ServiceCount", label: "# Services" },
    ],
  },
  "multi-pet-owners": {
    endpoint: "/api/views/multi-pet-owners",
    columns: [
      { key: "first_name", label: "First" },
      { key: "last_name", label: "Last" },
      { key: "PetCount", label: "# Pets" },
    ],
  },
  "avg-treatment-cost-per-vet": {
    endpoint: "/api/views/avg-treatment-cost-per-vet",
    columns: [
      { key: "first_name", label: "First" },
      { key: "last_name", label: "Last" },
      { key: "AvgCost", label: "Avg Cost" },
    ],
  },
  "inactive-pets": {
    endpoint: "/api/views/inactive-pets",
    columns: [
      { key: "PetName", label: "Pet" },
      { key: "OwnerFirst", label: "Owner First" },
      { key: "OwnerLast", label: "Owner Last" },
    ],
  },
};

async function loadView(viewKey) {
  const config = VIEW_CONFIG[viewKey];
  if (!config) return;

  try {
    const rows = await apiRequest(config.endpoint);
    const thead = document.querySelector("#view-table thead");
    const tbody = document.querySelector("#view-table tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";

    // header
    const headRow = document.createElement("tr");
    config.columns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    // body
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      config.columns.forEach((col) => {
        const td = document.createElement("td");
        td.textContent =
          row[col.key] !== null && row[col.key] !== undefined
            ? row[col.key]
            : "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    setDashboardMessage(err.message);
  }
}

/* ---------------- REFRESH ALL ---------------- */

function refreshAll() {
  refreshOwners();
  refreshPets();
  refreshAppointments();
}
