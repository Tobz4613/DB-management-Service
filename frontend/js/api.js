const API_BASE = "http://localhost:3000";

async function apiRequest(path, options = {}) {
  const finalOptions = {
    credentials: "include", // send/receive session cookies
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  };

  const res = await fetch(`${API_BASE}${path}`, finalOptions);
  let data = null;

  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}
