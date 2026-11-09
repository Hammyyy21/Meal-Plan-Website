// ========================================
// AUTH - CONNECTED TO FASTAPI BACKEND
// (register, login, logout, session check)
// ========================================

async function apiRequest(path, method, body) {
    const response = await fetch(path, {
        method: method || "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: body ? JSON.stringify(body) : undefined
    });

    let data = {};
    try { data = await response.json(); } catch (e) {}

    if (!response.ok) {
        let message = "Something went wrong. Please try again.";
        if (typeof data.detail === "string") {
            message = data.detail;
        } else if (Array.isArray(data.detail) && data.detail.length) {
            message = data.detail[0].msg.replace("Value error, ", "");
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return data;
}

// ---------- LOGIN ----------
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const errorMessage = document.getElementById("loginError");
        errorMessage.textContent = "";

        if (!email || !password) {
            errorMessage.textContent = "Please enter your email and password.";
            return;
        }

        try {
            await apiRequest("/api/login", "POST", { email: email, password: password });
            const user = await apiRequest("/api/me");

            // keep the rest of the UI (dashboard greeting, etc.) working
            localStorage.setItem("mealPlanLoggedIn", "true");
            localStorage.setItem("mealPlanCurrentUser", JSON.stringify({
                name: (user.first_name + " " + (user.last_name || "")).trim(),
                email: user.email,
                role: user.role_name
            }));

            window.location.href = user.role_name === "admin" ? "admin.html" : "dashboard.html";
        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });
}

// ---------- REGISTER ----------
const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const name = document.getElementById("fullName").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const errorMessage = document.getElementById("registerError");
        errorMessage.textContent = "";

        if (!name || !email || !password || !confirmPassword) {
            errorMessage.textContent = "Please fill out all fields.";
            return;
        }
        if (password !== confirmPassword) {
            errorMessage.textContent = "Passwords do not match.";
            return;
        }
        if (password.length < 8) {
            errorMessage.textContent = "Password must be at least 8 characters.";
            return;
        }

        const parts = name.split(/\s+/);
        const firstName = parts.shift();
        const lastName = parts.join(" ");

        try {
            await apiRequest("/api/register", "POST", {
                first_name: firstName,
                last_name: lastName,
                email: email,
                password: password
            });
            window.location.href = "index.html";
        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });
}

// ---------- LOGOUT ----------
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
        try { await apiRequest("/api/logout", "POST"); } catch (e) {}
        localStorage.removeItem("mealPlanLoggedIn");
        localStorage.removeItem("mealPlanCurrentUser");
        window.location.href = "index.html";
    });
}

// ---------- SESSION GUARD (protected pages) ----------
// Any page using <body class="app-body"> requires a valid server session.
if (document.body.classList.contains("app-body")) {
    apiRequest("/api/me").catch(function () {
        localStorage.removeItem("mealPlanLoggedIn");
        localStorage.removeItem("mealPlanCurrentUser");
        window.location.href = "index.html";
    });
}

// ========================================
// APPEARANCE SETTINGS
// ========================================

// Load saved appearance whenever a page opens
document.addEventListener("DOMContentLoaded", function () {

    const savedTheme = localStorage.getItem("mealPlanTheme") || "green";
    const savedLayout = localStorage.getItem("mealPlanLayout") || "comfortable";
    const savedDarkMode = localStorage.getItem("mealPlanDarkMode") === "true";

    applyTheme(savedTheme);
    applyLayout(savedLayout);
const isAuthPage =
    document.getElementById("loginForm") ||
    document.getElementById("registerForm");

if (!isAuthPage) {
    applyDarkMode(savedDarkMode);
} else {
    document.body.classList.remove("dark-mode");
}
    updateAppearanceButtons(savedTheme, savedLayout, savedDarkMode);
});


// ========================================
// COLOR THEMES
// ========================================

const themeButtons = document.querySelectorAll(
    ".theme-color, .gradient-theme"
);

themeButtons.forEach(function (button) {

    button.addEventListener("click", function () {

        const theme = button.dataset.theme;

        applyTheme(theme);

        localStorage.setItem("mealPlanTheme", theme);

        document
            .querySelectorAll(".theme-color, .gradient-theme")
            .forEach(function (item) {
                item.classList.remove("selected");
            });

        button.classList.add("selected");
    });
});


function applyTheme(theme) {

    const root = document.documentElement;

    const themes = {

        green: {
            primary: "#315f45",
            dark: "#244b35",
            light: "#e9f2ec",
            gradient: "none"
        },

        blue: {
            primary: "#35698c",
            dark: "#28536f",
            light: "#e8f1f7",
            gradient: "none"
        },

        purple: {
            primary: "#69528c",
            dark: "#51406d",
            light: "#f0ebf6",
            gradient: "none"
        },

        orange: {
            primary: "#b4673d",
            dark: "#92502f",
            light: "#f8eee8",
            gradient: "none"
        },

        red: {
            primary: "#a94c4c",
            dark: "#873b3b",
            light: "#f8eaea",
            gradient: "none"
        },

        pink: {
            primary: "#b75f83",
            dark: "#944968",
            light: "#f8eaf0",
            gradient: "none"
        },

        teal: {
            primary: "#367b78",
            dark: "#285f5d",
            light: "#e7f3f2",
            gradient: "none"
        },

        black: {
            primary: "#292d2a",
            dark: "#171a18",
            light: "#eceeec",
            gradient: "none"
        },

        "forest-gradient": {
            primary: "#315f45",
            dark: "#18392a",
            light: "#e9f2ec",
            gradient:
                "linear-gradient(135deg, #18392a, #477c59, #8db49a)"
        },

        "ocean-gradient": {
            primary: "#357ca0",
            dark: "#183b56",
            light: "#e6f2f6",
            gradient:
                "linear-gradient(135deg, #183b56, #357ca0, #6ab7bd)"
        },

        "sunset-gradient": {
            primary: "#c5684c",
            dark: "#93463f",
            light: "#faece6",
            gradient:
                "linear-gradient(135deg, #9e4b45, #d87a55, #e7ad65)"
        },

        "berry-gradient": {
            primary: "#76549a",
            dark: "#442a67",
            light: "#f1eaf6",
            gradient:
                "linear-gradient(135deg, #442a67, #76549a, #ba668d)"
        }
    };


    const selectedTheme = themes[theme] || themes.green;

    root.style.setProperty(
        "--primary",
        selectedTheme.primary
    );

    root.style.setProperty(
        "--primary-dark",
        selectedTheme.dark
    );

    root.style.setProperty(
        "--primary-light",
        selectedTheme.light
    );


    // Gradient themes
    if (selectedTheme.gradient !== "none") {

        document.body.classList.add("gradient-active");

        root.style.setProperty(
            "--selected-gradient",
            selectedTheme.gradient
        );

    } else {

        document.body.classList.remove("gradient-active");

        root.style.removeProperty("--selected-gradient");
    }
}


// ========================================
// PAGE LAYOUT
// ========================================

const layoutButtons = document.querySelectorAll(".layout-option");

layoutButtons.forEach(function (button) {

    button.addEventListener("click", function () {

        const layout = button.dataset.layout;

        applyLayout(layout);

        localStorage.setItem(
            "mealPlanLayout",
            layout
        );

        layoutButtons.forEach(function (item) {
            item.classList.remove("selected");
        });

        button.classList.add("selected");
    });
});


function applyLayout(layout) {

    if (layout === "compact") {

        document.body.classList.add(
            "compact-layout"
        );

    } else {

        document.body.classList.remove(
            "compact-layout"
        );
    }
}


// ========================================
// DARK MODE
// ========================================

const darkModeToggle =
    document.getElementById("darkModeToggle");

if (darkModeToggle) {

    darkModeToggle.addEventListener(
        "change",
        function () {

            const enabled =
                darkModeToggle.checked;

            applyDarkMode(enabled);

            localStorage.setItem(
                "mealPlanDarkMode",
                enabled
            );
        }
    );
}


function applyDarkMode(enabled) {

    if (enabled) {

        document.body.classList.add(
            "dark-mode"
        );

    } else {

        document.body.classList.remove(
            "dark-mode"
        );
    }
}


// ========================================
// UPDATE SELECTED BUTTONS
// ========================================

function updateAppearanceButtons(
    theme,
    layout,
    darkMode
) {

    document
        .querySelectorAll(".theme-color, .gradient-theme")
        .forEach(function (button) {

            button.classList.toggle(
                "selected",
                button.dataset.theme === theme
            );
        });


    document
        .querySelectorAll(".layout-option")
        .forEach(function (button) {

            button.classList.toggle(
                "selected",
                button.dataset.layout === layout
            );
        });


    const toggle =
        document.getElementById("darkModeToggle");

    if (toggle) {
        toggle.checked = darkMode;
    }
}

