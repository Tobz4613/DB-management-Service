async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const msgEl = document.getElementById("login-message");
  msgEl.textContent = "";

  try {
    const data = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    msgEl.textContent = `Logged in as ${data.role}`;
    // small delay then go to dashboard
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 500);
  } catch (err) {
    msgEl.textContent = err.message;
  }
}

async function handleLogout() {
  try {
    await apiRequest("/api/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // ignore errors
  } finally {
    window.location.href = "index.html";
  }
}
