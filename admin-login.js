// Frontend and backend are two separate servers — the API base URL
// comes from config.js (window.SHE_SAFE_API_BASE) so it's set in one place.
const API_BASE = window.SHE_SAFE_API_BASE;

const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password-input");
const errorBox = document.getElementById("login-error");
const loginBtn = loginForm.querySelector(".login-btn");

function showError(message) {
    errorBox.textContent = message;
}

function clearError() {
    errorBox.textContent = "";
}

function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    loginBtn.textContent = isLoading ? "Logging in..." : "Login";
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const password = passwordInput.value;

    if (!password) {
        showError("Please enter the admin password.");
        return;
    }

    setLoading(true);

    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: "POST",
            credentials: "include", // so the server's Set-Cookie is stored
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            showError(data.message || "Login failed. Please try again.");
            setLoading(false);
            return;
        }

        // Always go to the local dashboard page — this frontend is hosted
        // separately from the API, so we never trust a redirect URL from it.
        window.location.href = "admin-dashboard.html";
    } catch (err) {
        showError("Could not reach the server. Is the backend running?");
        setLoading(false);
    }
});
