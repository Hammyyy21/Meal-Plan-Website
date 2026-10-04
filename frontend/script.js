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

            window.location.href = "dashboard.html";
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


// ========================================
// DIETARY CHIPS
// ========================================

const preferenceChips =
    document.querySelectorAll(".preference-chip");

preferenceChips.forEach(function (chip) {

    chip.addEventListener("click", function () {

        chip.classList.toggle("selected");

    });
});

// ========================================
// SAVE BUTTON
// ========================================

const savePreferences =
    document.getElementById("savePreferences");

if (savePreferences) {

    savePreferences.addEventListener(
        "click",
        function () {

            const originalText =
                savePreferences.textContent;

            savePreferences.textContent =
                "✓ Saved";

            setTimeout(function () {

                savePreferences.textContent =
                    originalText;

            }, 1500);
        }
    );
}
/* ========================================
   RECIPES FUNCTIONALITY
======================================== */

const recipeSearch = document.getElementById("recipeSearch");
const recipeCards = document.querySelectorAll(".recipe-card");
const recipeCategories = document.querySelectorAll(".recipe-category");
const recipeEmptyState = document.getElementById("recipeEmptyState");

let selectedRecipeCategory = "all";


/* SEARCH + FILTER RECIPES */

function filterRecipes() {

    if (!recipeCards.length) return;

    const searchText = recipeSearch
        ? recipeSearch.value.toLowerCase().trim()
        : "";

    let visibleRecipes = 0;

    recipeCards.forEach(function (card) {

        const recipeName =
            (card.dataset.name || "").toLowerCase();

        const categories =
            (card.dataset.category || "").toLowerCase();

        const matchesSearch =
            recipeName.includes(searchText);

        let matchesCategory;

if (selectedRecipeCategory === "all") {

    matchesCategory = true;

} else if (selectedRecipeCategory === "favorites") {

    const favoriteButton =
        card.querySelector(".favorite-button");

    matchesCategory =
        favoriteButton &&
        favoriteButton.classList.contains("saved");

} else {

    matchesCategory =
        categories.includes(selectedRecipeCategory);

}
        if (matchesSearch && matchesCategory) {
            card.style.display = "";
            visibleRecipes++;
        } else {
            card.style.display = "none";
        }

    });


    /* Show message if nothing matches */

    if (recipeEmptyState) {

        if (visibleRecipes === 0) {
            recipeEmptyState.style.display = "block";
        } else {
            recipeEmptyState.style.display = "none";
        }

    }

}


/* SEARCH BAR */

if (recipeSearch) {

    recipeSearch.addEventListener("input", function () {
        filterRecipes();
    });

}


/* CATEGORY BUTTONS */

recipeCategories.forEach(function (button) {

    button.addEventListener("click", function () {

        recipeCategories.forEach(function (item) {
            item.classList.remove("active");
        });

        button.classList.add("active");

        selectedRecipeCategory =
            button.dataset.category || "all";

        filterRecipes();

    });

});


/* ========================================
   FAVORITE RECIPES
======================================== */

const favoriteButtons =
    document.querySelectorAll(".favorite-button");

favoriteButtons.forEach(function (button, index) {

    const storageKey = "favoriteRecipe" + index;

    /* Restore favorite after refresh */

    if (localStorage.getItem(storageKey) === "true") {
        button.classList.add("saved");
        button.textContent = "♥";
    }


    button.addEventListener("click", function () {

        button.classList.toggle("saved");

        const saved =
            button.classList.contains("saved");

        button.textContent = saved ? "♥" : "♡";

        localStorage.setItem(storageKey, saved);
        // Refresh the recipe list if we're viewing Favorites
if (selectedRecipeCategory === "favorites") {
    filterRecipes();
}

    });

});

/* ========================================
   ADD RECIPE TO MEAL PLAN
======================================== */

const addPlanButtons =
    document.querySelectorAll(".add-plan-button");

addPlanButtons.forEach(function (button) {

    button.addEventListener("click", function () {

        const recipeCard =
            button.closest(".recipe-card");

        if (!recipeCard) return;

       const recipeName =
    recipeCard.dataset.name || "Recipe";

const recipeCalories =
    Number(recipeCard.dataset.calories) || 0;

let mealPlan =
    JSON.parse(localStorage.getItem("mealPlanRecipes")) || [];

        /* Don't add the same recipe twice */

        const alreadyAdded = mealPlan.some(function (recipe) {

    // Supports recipes saved with our older version
    if (typeof recipe === "string") {
        return recipe === recipeName;
    }

    return recipe.name === recipeName;
});


if (!alreadyAdded) {

    mealPlan.push({
        name: recipeName,
        calories: recipeCalories
    });

            localStorage.setItem(
                "mealPlanRecipes",
                JSON.stringify(mealPlan)
            );

            button.textContent = "✓ Added to meal plan";

        } else {

            button.textContent = "✓ Already in meal plan";

        }


        /* Restore button */

        setTimeout(function () {
            button.textContent = "+ Add to meal plan";
        }, 1800);

    });

});
/* ========================================
   CALENDAR - ADD MEAL
======================================== */

const mealModal = document.getElementById("mealModal");
const closeMealModal = document.getElementById("closeMealModal");
const selectedDayText = document.getElementById("selectedDayText");
const savedRecipeSelect = document.getElementById("savedRecipeSelect");
const mealTypeSelect = document.getElementById("mealTypeSelect");
const confirmAddMeal = document.getElementById("confirmAddMeal");
const noSavedRecipes = document.getElementById("noSavedRecipes");

const calendarAddButtons =
    document.querySelectorAll(".day-column .add-small-meal");
const topAddMealBtn =
    document.getElementById("topAddMealBtn");
    const daySelectGroup =
    document.getElementById("daySelectGroup");

const daySelect =
    document.getElementById("daySelect");
let selectedCalendarDay = null;
if (topAddMealBtn) {
    topAddMealBtn.addEventListener("click", function () {
        selectedCalendarDay = null;
daySelectGroup.style.display = "block";
daySelect.value = "";
        selectedDayText.textContent =
            "Choose a day, meal type, and recipe.";

        loadSavedRecipes();
        mealModal.classList.add("show");
    });
}

/* ========================================
   OPEN MODAL
======================================== */

calendarAddButtons.forEach(function (button) {

    button.addEventListener("click", function () {

        const dayColumn = button.closest(".day-column");

        if (!dayColumn) return;

        selectedCalendarDay = dayColumn;
daySelectGroup.style.display = "none";
        const dayName =
            dayColumn.dataset.day || "day";

        selectedDayText.textContent =
            "Choose a meal for " +
            dayName.charAt(0).toUpperCase() +
            dayName.slice(1) +
            ".";

        loadSavedRecipes();

        mealModal.classList.add("show");

    });

});


/* ========================================
   LOAD RECIPES FROM RECIPES PAGE
======================================== */

function loadSavedRecipes() {

    if (!savedRecipeSelect) return;

    const mealPlan =
        JSON.parse(
            localStorage.getItem("mealPlanRecipes")
        ) || [];

    savedRecipeSelect.innerHTML =
        '<option value="">Select a saved recipe</option>';

  mealPlan.forEach(function (recipe) {

    const option =
        document.createElement("option");

    // Support old saved recipes + new recipe objects
    if (typeof recipe === "string") {

        option.value = recipe;
        option.textContent = recipe;
        option.dataset.calories = "0";

    } else {

        option.value = recipe.name;
        option.textContent =
            recipe.name + " — " + recipe.calories + " kcal";

        option.dataset.calories =
            recipe.calories;

    }

    savedRecipeSelect.appendChild(option);

});


    if (noSavedRecipes) {

        if (mealPlan.length === 0) {
            noSavedRecipes.style.display = "block";
        } else {
            noSavedRecipes.style.display = "none";
        }

    }

}


/* ========================================
   CLOSE MODAL
======================================== */

if (closeMealModal) {

    closeMealModal.addEventListener("click", function () {
        mealModal.classList.remove("show");
    });

}


/* Click outside popup to close */

if (mealModal) {

    mealModal.addEventListener("click", function (event) {

        if (event.target === mealModal) {
            mealModal.classList.remove("show");
        }

    });

}


/* ========================================
   ADD MEAL TO CALENDAR
======================================== */

if (confirmAddMeal) {

    confirmAddMeal.addEventListener("click", function () {

        const recipeName =
            savedRecipeSelect.value;

        const mealType =
            mealTypeSelect.value;
const selectedRecipeOption =
    savedRecipeSelect.options[savedRecipeSelect.selectedIndex];

const recipeCalories =
    Number(selectedRecipeOption.dataset.calories) || 0;
        if (!recipeName) {

            savedRecipeSelect.focus();
            return;

        }

if (!selectedCalendarDay && daySelect.value) {
    selectedCalendarDay =
        document.querySelector(
            `.day-column[data-day="${daySelect.value}"]`
        );
}

if (!selectedCalendarDay) {
    daySelect.focus();
    return;
}

        /* Create meal card */

        const mealCard =
            document.createElement("div");

        mealCard.className =
            "calendar-meal " +
            mealType +
            "-meal saved-calendar-meal";


mealCard.innerHTML = `
    <button type="button" class="remove-calendar-meal">
        ×
    </button>

    <span class="meal-type">
        ${mealType.toUpperCase()}
    </span>

    <h3>${recipeName}</h3>

    <p>
        ${recipeCalories > 0
            ? recipeCalories + " kcal"
            : "Added from Recipes"}
    </p>
`;

        /* Put it before the + Add meal button */

        const addButton =
            selectedCalendarDay.querySelector(
                ".add-small-meal"
            );

        selectedCalendarDay.insertBefore(
            mealCard,
            addButton
        );
updateMealsPlannedCount();
const removeButton =
    mealCard.querySelector(".remove-calendar-meal");

removeButton.addEventListener("click", function () {

    let savedCalendar =
        JSON.parse(
            localStorage.getItem("calendarMeals")
        ) || [];

    const mealIndex =
        savedCalendar.findIndex(function (meal) {
            return (
                meal.day === selectedCalendarDay.dataset.day &&
                meal.type === mealType &&
                meal.recipe === recipeName
            );
        });

    if (mealIndex !== -1) {
        savedCalendar.splice(mealIndex, 1);

        localStorage.setItem(
            "calendarMeals",
            JSON.stringify(savedCalendar)
        );
    }

    mealCard.remove();
    updateMealsPlannedCount();
});
        /* SAVE CALENDAR DATA */

        const dayName =
            selectedCalendarDay.dataset.day;

        let savedCalendar =
            JSON.parse(
                localStorage.getItem("calendarMeals")
            ) || [];

       savedCalendar.push({
    day: dayName,
    type: mealType,
    recipe: recipeName,
    calories: recipeCalories
});

        localStorage.setItem(
            "calendarMeals",
            JSON.stringify(savedCalendar)
        );


        /* Close popup */

        mealModal.classList.remove("show");

        savedRecipeSelect.value = "";

    });

}


/* ========================================
   RESTORE SAVED CALENDAR MEALS
======================================== */
function updateMealsPlannedCount() {

    const mealsPlannedCount =
        document.getElementById("mealsPlannedCount");

    if (!mealsPlannedCount) return;

    const allMeals =
        document.querySelectorAll(".calendar-meal");

    mealsPlannedCount.textContent =
        allMeals.length;
}
function restoreCalendarMeals() {

    const savedCalendar =
        JSON.parse(
            localStorage.getItem("calendarMeals")
        ) || [];


    savedCalendar.forEach(function (meal) {

        const dayColumn =
            document.querySelector(
                `.day-column[data-day="${meal.day}"]`
            );

        if (!dayColumn) return;


        const mealCard =
            document.createElement("div");

        mealCard.className =
            "calendar-meal " +
            meal.type +
            "-meal saved-calendar-meal";


mealCard.innerHTML = `
    <button type="button" class="remove-calendar-meal">
        ×
    </button>

    <span class="meal-type">
        ${meal.type.toUpperCase()}
    </span>

    <h3>${meal.recipe}</h3>

    <p>
        ${meal.calories > 0
            ? meal.calories + " kcal"
            : "Added from Recipes"}
    </p>
`;
        const addButton =
            dayColumn.querySelector(
                ".add-small-meal"
            );

        dayColumn.insertBefore(
            mealCard,
            addButton
        );
        const removeButton =
    mealCard.querySelector(".remove-calendar-meal");

removeButton.addEventListener("click", function () {

    let updatedCalendar =
        JSON.parse(
            localStorage.getItem("calendarMeals")
        ) || [];

    const mealIndex =
        updatedCalendar.findIndex(function (savedMeal) {
            return (
                savedMeal.day === meal.day &&
                savedMeal.type === meal.type &&
                savedMeal.recipe === meal.recipe
            );
        });

    if (mealIndex !== -1) {
        updatedCalendar.splice(mealIndex, 1);

        localStorage.setItem(
            "calendarMeals",
            JSON.stringify(updatedCalendar)
        );
    }

    mealCard.remove();
    updateMealsPlannedCount();
});

    });

}


/* Restore meals whenever Calendar loads */
if (document.querySelector(".day-column[data-day]")) {
    restoreCalendarMeals();
    updateMealsPlannedCount();
    
}
/* ========================================
   INVENTORY SEARCH
======================================== */

const inventorySearch =
    document.getElementById("inventorySearch");

if (inventorySearch) {

    inventorySearch.addEventListener("input", function () {

        const searchText =
            inventorySearch.value
                .toLowerCase()
                .trim();

        const inventoryRows =
            document.querySelectorAll(".inventory-row");

        inventoryRows.forEach(function (row) {

            const rowText =
                row.textContent.toLowerCase();

            row.style.display =
                rowText.includes(searchText)
                    ? ""
                    : "none";
        });

    });
}
/* ========================================
   INVENTORY CATEGORY FILTERS
======================================== */

const inventoryFilterButtons =
    document.querySelectorAll(".filter-btn");

inventoryFilterButtons.forEach(function (button) {

    button.addEventListener("click", function () {

        const selectedCategory =
            button.dataset.category.toLowerCase();

        const inventoryRows =
            document.querySelectorAll(".inventory-row");

        // Active button styling
        inventoryFilterButtons.forEach(function (btn) {
            btn.classList.remove("active");
        });

        button.classList.add("active");

        // Filter rows
        inventoryRows.forEach(function (row) {

            const rowText =
                row.textContent.toLowerCase();

            if (
                selectedCategory === "all" ||
                rowText.includes(selectedCategory)
            ) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }

        });

    });

});
/* ========================================
   INVENTORY - ADD ITEM
======================================== */

const addInventoryBtn =
    document.getElementById("addInventoryBtn");

const inventoryModal =
    document.getElementById("inventoryModal");

const closeInventoryModal =
    document.getElementById("closeInventoryModal");

const saveInventoryItem =
    document.getElementById("saveInventoryItem");

const inventoryItemName =
    document.getElementById("inventoryItemName");

const inventoryCategory =
    document.getElementById("inventoryCategory");

const inventoryQuantity =
    document.getElementById("inventoryQuantity");

const inventoryUnit =
    document.getElementById("inventoryUnit");

const inventoryExpiration =
    document.getElementById("inventoryExpiration");


/* OPEN MODAL */

if (addInventoryBtn) {

    addInventoryBtn.addEventListener("click", function () {

        inventoryModal.classList.add("show");

        inventoryItemName.focus();

    });

}


/* CLOSE MODAL */

if (closeInventoryModal) {

    closeInventoryModal.addEventListener("click", function () {

        inventoryModal.classList.remove("show");

    });

}


/* CLOSE WHEN CLICKING BACKGROUND */

if (inventoryModal) {

    inventoryModal.addEventListener("click", function (event) {

        if (event.target === inventoryModal) {
            inventoryModal.classList.remove("show");
        }

    });

}


/* CATEGORY ICONS */

function getInventoryIcon(category) {

    if (category === "produce") return "🥬";
    if (category === "protein") return "🍗";
    if (category === "dairy") return "🥛";
    if (category === "grains") return "🌾";

    return "🍽️";
}


/* CREATE INVENTORY ROW */

function createInventoryRow(item) {

    const inventoryList =
        document.querySelector(".inventory-list");

    if (!inventoryList) return;


    const row =
        document.createElement("div");

    row.className = "inventory-row saved-inventory-item";


    const categoryName =
        item.category.charAt(0).toUpperCase() +
        item.category.slice(1);


    row.innerHTML = `
        <div class="food-name">

            <div class="food-icon ${item.category}-bg">
                ${getInventoryIcon(item.category)}
            </div>

            <div>
                <strong>${item.name}</strong>
                <span>Added manually</span>
            </div>

        </div>


        <div>
            <span class="category-tag ${item.category}-tag">
                ${categoryName}
            </span>
        </div>


        <div class="quantity">
            <strong>${item.quantity}</strong>
            <span>${item.unit}</span>
        </div>


        <div class="expiration">
            <strong>${item.expiration || "—"}</strong>
        </div>


        <div>
            <span class="status-tag">
                ● In stock
            </span>
        </div>


        <button
            type="button"
            class="more-btn remove-inventory-item">
            ×
        </button>
    `;


    inventoryList.appendChild(row);


    /* REMOVE ITEM */

    const removeButton =
        row.querySelector(".remove-inventory-item");

    removeButton.addEventListener("click", function () {

        let savedItems =
            JSON.parse(
                localStorage.getItem("inventoryItems")
            ) || [];


        const index =
            savedItems.findIndex(function (savedItem) {

                return savedItem.id === item.id;

            });


        if (index !== -1) {

            savedItems.splice(index, 1);

            localStorage.setItem(
                "inventoryItems",
                JSON.stringify(savedItems)
            );

        }


        row.remove();

    });

}


/* SAVE NEW ITEM */

if (saveInventoryItem) {

    saveInventoryItem.addEventListener("click", function () {

        const name =
            inventoryItemName.value.trim();


        if (!name) {

            inventoryItemName.focus();
            return;

        }


        const newItem = {

            id: Date.now(),

            name: name,

            category:
                inventoryCategory.value,

            quantity:
                inventoryQuantity.value,

            unit:
                inventoryUnit.value,

            expiration:
                inventoryExpiration.value

        };


        let savedItems =
            JSON.parse(
                localStorage.getItem("inventoryItems")
            ) || [];


        savedItems.push(newItem);


        localStorage.setItem(
            "inventoryItems",
            JSON.stringify(savedItems)
        );


        createInventoryRow(newItem);


        /* RESET */

        inventoryItemName.value = "";

        inventoryQuantity.value = "1";

        inventoryExpiration.value = "";


        inventoryModal.classList.remove("show");

    });

}


/* RESTORE ITEMS AFTER REFRESH */

function restoreInventoryItems() {

    const savedItems =
        JSON.parse(
            localStorage.getItem("inventoryItems")
        ) || [];


    savedItems.forEach(function (item) {

        createInventoryRow(item);

    });

}


if (document.querySelector(".inventory-list")) {

    restoreInventoryItems();

}
/* ========================================
   NUTRITION - WATER TRACKER
======================================== */

const waterCount =
    document.getElementById("waterCount");

const addWaterBtn =
    document.getElementById("addWaterBtn");

const resetWaterBtn =
    document.getElementById("resetWaterBtn");


if (waterCount) {

    let savedWater =
        localStorage.getItem("waterGlasses");

    if (savedWater === null) {
        savedWater = 5;
    }

    waterCount.textContent = savedWater;


    if (addWaterBtn) {

        addWaterBtn.addEventListener("click", function () {

            let currentWater =
                Number(waterCount.textContent);

            if (currentWater < 8) {
                currentWater++;
            }

            waterCount.textContent =
                currentWater;

            localStorage.setItem(
                "waterGlasses",
                currentWater
            );

        });

    }


    if (resetWaterBtn) {

        resetWaterBtn.addEventListener("click", function () {

            waterCount.textContent = 0;

            localStorage.setItem(
                "waterGlasses",
                0
            );

        });

    }

}
/* ========================================
   SAVE + RESTORE PREFERENCES
======================================== */

const savePreferencesBtn =
    document.getElementById("savePreferences");

function saveUserPreferences() {

    const selectedAllergens = [];

    document
.querySelectorAll(".preference-chip.selected")        .forEach(function (chip) {
            selectedAllergens.push(
                chip.textContent.trim()
            );
        });


    const preferences = {

        firstName:
            document.getElementById("firstName")?.value || "",

        lastName:
            document.getElementById("lastName")?.value || "",

        email:
            document.getElementById("profileEmail")?.value || "",

        dietType:
            document.getElementById("dietType")?.value || "",

        nutritionGoal:
            document.getElementById("nutritionGoal")?.value || "",

        calorieGoal:
            document.getElementById("calorieGoal")?.value || "2000",

        budgetGoal:
            document.getElementById("budgetGoal")?.value || "100",

        mealsPerDay:
            document.getElementById("mealsPerDay")?.value || "",

        allergens:
            selectedAllergens
    };


    localStorage.setItem(
        "userPreferences",
        JSON.stringify(preferences)
    );
}


function restoreUserPreferences() {

    const preferences =
        JSON.parse(
            localStorage.getItem("userPreferences")
        );

    if (!preferences) return;


    const firstName =
        document.getElementById("firstName");

    const lastName =
        document.getElementById("lastName");

    const email =
        document.getElementById("profileEmail");

    const dietType =
        document.getElementById("dietType");

    const nutritionGoal =
        document.getElementById("nutritionGoal");

    const calorieGoal =
        document.getElementById("calorieGoal");

    const budgetGoal =
        document.getElementById("budgetGoal");

    const mealsPerDay =
        document.getElementById("mealsPerDay");


    if (firstName)
        firstName.value = preferences.firstName;

    if (lastName)
        lastName.value = preferences.lastName;

    if (email)
        email.value = preferences.email;

    if (dietType)
        dietType.value = preferences.dietType;

    if (nutritionGoal)
        nutritionGoal.value = preferences.nutritionGoal;

    if (calorieGoal)
        calorieGoal.value = preferences.calorieGoal;

    if (budgetGoal)
        budgetGoal.value = preferences.budgetGoal;

    if (mealsPerDay)
        mealsPerDay.value = preferences.mealsPerDay;


    document
        .querySelectorAll(".preference-chip")
        .forEach(function (chip) {

            const allergen =
                chip.textContent.trim();

            if (
                preferences.allergens &&
                preferences.allergens.includes(allergen)
            ) {
chip.classList.add("selected");            } else {
chip.classList.remove("selected");            }

        });
}

/* ========================================
   PREFERENCES - SAVE + RESTORE
======================================== */

if (document.getElementById("firstName")) {

    restoreUserPreferences();

    if (savePreferencesBtn) {

        savePreferencesBtn.addEventListener(
            "click",
            function () {

                saveUserPreferences();

                const originalText =
                    savePreferencesBtn.textContent;

                savePreferencesBtn.textContent =
                    "✓ Saved";

                setTimeout(function () {

                    savePreferencesBtn.textContent =
                        originalText;

                }, 1500);
            }
        );
    }
}
/* ========================================
   USER SESSION + DASHBOARD
======================================== */

const currentUser =
    JSON.parse(localStorage.getItem("mealPlanCurrentUser"));

const isLoggedIn =
    localStorage.getItem("mealPlanLoggedIn") === "true";

const isDashboard =
    document.getElementById("dashboardGreeting");


// Protect Dashboard
if (isDashboard && (!isLoggedIn || !currentUser)) {

    window.location.href = "index.html";

}


// Display logged-in user's information
if (isDashboard && currentUser) {

    const dashboardUserName =
        document.getElementById("dashboardUserName");

    const dashboardGreeting =
        document.getElementById("dashboardGreeting");

    const dashboardAvatar =
        document.getElementById("dashboardAvatar");


    // First name
    const firstName =
        currentUser.name.split(" ")[0];


    if (dashboardUserName) {
        dashboardUserName.textContent = currentUser.name;
    }


    if (dashboardGreeting) {

        const currentHour =
            new Date().getHours();

        let greeting = "Good evening";

        if (currentHour < 12) {
            greeting = "Good morning";
        } else if (currentHour < 17) {
            greeting = "Good afternoon";
        }

        dashboardGreeting.textContent =
            greeting + ", " + firstName + ".";
    }


    // Create initials automatically
    if (dashboardAvatar) {

        const initials =
            currentUser.name
                .split(" ")
                .map(function (name) {
                    return name.charAt(0);
                })
                .slice(0, 2)
                .join("")
                .toUpperCase();

        dashboardAvatar.textContent = initials;
    }
}
/* ========================================
   DASHBOARD - LIVE MEAL DATA
======================================== */

function updateDashboardMealData() {

    const caloriesElement =
        document.getElementById("dashboardCalories");

    const mealsElement =
        document.getElementById("dashboardMealsPlanned");

    const statusElement =
        document.getElementById("dashboardMealStatus");

    const progressElement =
        document.getElementById("dashboardCalorieProgress");

    const percentElement =
        document.getElementById("dashboardNutritionPercent");

    const goalElement =
        document.getElementById("dashboardCalorieGoal");


    // Only run on Dashboard
    if (!caloriesElement) return;


    const calendarMeals =
        JSON.parse(
            localStorage.getItem("calendarMeals")
        ) || [];


    const preferences =
        JSON.parse(
            localStorage.getItem("userPreferences")
        ) || {};


    const calorieGoal =
        Number(preferences.calorieGoal) || 2000;


    let totalCalories = 0;

    calendarMeals.forEach(function (meal) {

        totalCalories +=
            Number(meal.calories) || 0;

    });


    const mealCount =
        calendarMeals.length;


    let percentage =
        Math.round(
            (totalCalories / calorieGoal) * 100
        );


    if (percentage > 100) {
        percentage = 100;
    }


    caloriesElement.textContent =
        totalCalories.toLocaleString();


    mealsElement.textContent =
        mealCount;


    if (goalElement) {

        goalElement.textContent =
            calorieGoal.toLocaleString();

    }


    if (progressElement) {

        progressElement.style.width =
            percentage + "%";

    }


    if (percentElement) {

        percentElement.textContent =
            percentage + "%";

    }


    if (statusElement) {

        if (mealCount === 0) {

            statusElement.textContent =
                "No meals planned yet";

        } else if (mealCount === 1) {

            statusElement.textContent =
                "1 meal planned";

        } else {

            statusElement.textContent =
                mealCount + " meals planned";

        }

    }

}


updateDashboardMealData();
/* ========================================
   DASHBOARD - LIVE INVENTORY DATA
======================================== */

function updateDashboardInventory() {

    const pantryCount =
        document.getElementById("dashboardPantryCount");

    const pantryStatus =
        document.getElementById("dashboardPantryStatus");

    if (!pantryCount) return;


    const inventoryItems =
        JSON.parse(
            localStorage.getItem("inventoryItems")
        ) || [];


    pantryCount.textContent =
        inventoryItems.length;


    if (pantryStatus) {

        if (inventoryItems.length === 0) {

            pantryStatus.textContent =
                "No added items";

        } else if (inventoryItems.length === 1) {

            pantryStatus.textContent =
                "1 item in inventory";

        } else {

            pantryStatus.textContent =
                inventoryItems.length +
                " items in inventory";

        }
    }
}


updateDashboardInventory();
/* ========================================
   DASHBOARD - DISPLAY CALENDAR MEALS
======================================== */

function loadDashboardMeals() {

    const mealsList =
        document.getElementById("dashboardMealsList");

    if (!mealsList) return;


    const calendarMeals =
        JSON.parse(
            localStorage.getItem("calendarMeals")
        ) || [];


    if (calendarMeals.length === 0) {

        mealsList.innerHTML = `
            <div class="dashboard-empty-meals">

                <div class="meal-picture breakfast">
                    🍽️
                </div>

                <div class="meal-details">
                    <h3>No meals planned yet</h3>
                    <p>
                        Add meals to your calendar
                        to see them here.
                    </p>
                </div>

            </div>
        `;

        return;
    }


    mealsList.innerHTML = "";


    calendarMeals
        .slice(0, 3)
        .forEach(function (meal) {

            const mealItem =
                document.createElement("div");

            mealItem.className =
                "meal-item";


            let icon = "🍽️";

            if (meal.type === "breakfast") {
                icon = "🥣";
            }

            if (meal.type === "lunch") {
                icon = "🥗";
            }

            if (meal.type === "dinner") {
                icon = "🍽️";
            }

            if (meal.type === "snack") {
                icon = "🍎";
            }


            const dayName =
                meal.day
                    ? meal.day.charAt(0).toUpperCase() +
                      meal.day.slice(1)
                    : "Planned";


            mealItem.innerHTML = `

                <div class="meal-time">

                    <span>
                        ${meal.type.toUpperCase()}
                    </span>

                    <strong>
                        ${dayName}
                    </strong>

                </div>


                <div class="meal-picture ${meal.type}">
                    ${icon}
                </div>


                <div class="meal-details">

                    <h3>
                        ${meal.recipe}
                    </h3>

                    <p>
                        Added from your meal calendar
                    </p>

                </div>


                <div class="meal-calories">

                    <strong>
                        ${Number(meal.calories) || 0}
                    </strong>

                    <span>
                        kcal
                    </span>

                </div>
            `;


            mealsList.appendChild(mealItem);

        });

}


loadDashboardMeals();
/* ========================================
   DASHBOARD - BUDGET
======================================== */

function updateDashboardBudget() {

    const budgetAmount =
        document.getElementById("dashboardBudget");

    const budgetGoalElement =
        document.getElementById("dashboardBudgetGoal");

    const budgetProgress =
        document.getElementById("dashboardBudgetProgress");

    if (!budgetAmount) return;


    const preferences =
        JSON.parse(
            localStorage.getItem("userPreferences")
        ) || {};


    const budgetGoal =
        Number(preferences.budgetGoal) || 100;


    /*
        We do not have grocery spending connected yet,
        so actual spending starts at $0.
    */

    const amountSpent = 0;


    budgetAmount.textContent =
        "$" + amountSpent;


    if (budgetGoalElement) {

        budgetGoalElement.textContent =
            budgetGoal.toLocaleString();

    }


    if (budgetProgress) {

        const percentage =
            Math.min(
                (amountSpent / budgetGoal) * 100,
                100
            );

        budgetProgress.style.width =
            percentage + "%";

    }

}


updateDashboardBudget();
/* ========================================
   NUTRITION PAGE - LIVE DATA
======================================== */

function updateNutritionPage() {

    const calorieDisplay =
        document.getElementById("nutritionCalories");

    if (!calorieDisplay) return;


    const meals =
        JSON.parse(
            localStorage.getItem("calendarMeals")
        ) || [];


    const preferences =
        JSON.parse(
            localStorage.getItem("userPreferences")
        ) || {};


    const calorieGoal =
        Number(preferences.calorieGoal) || 2000;


    let calories = 0;

    meals.forEach(function(meal) {
        calories += Number(meal.calories) || 0;
    });


    const percentage =
        Math.round(
            (calories / calorieGoal) * 100
        );


    const remaining =
        Math.max(
            calorieGoal - calories,
            0
        );


    // CALORIES
    calorieDisplay.textContent =
        calories.toLocaleString();


    const goal =
        document.getElementById(
            "nutritionCalorieGoal"
        );

    if (goal) {
        goal.textContent =
            calorieGoal.toLocaleString();
    }


    const percent =
        document.getElementById(
            "nutritionCaloriesPercent"
        );

    if (percent) {
        percent.textContent =
            percentage + "%";
    }


    const progress =
        document.getElementById(
            "nutritionProgressBar"
        );

    if (progress) {
        progress.style.width =
            Math.min(percentage, 100) + "%";
    }


    const consumed =
        document.getElementById(
            "nutritionConsumed"
        );

    if (consumed) {
        consumed.textContent =
            calories.toLocaleString() +
            " consumed";
    }


    const remainingText =
        document.getElementById(
            "nutritionRemaining"
        );

    if (remainingText) {

        if (calories > calorieGoal) {

            remainingText.textContent =
                (
                    calories - calorieGoal
                ).toLocaleString() +
                " over goal";

        } else {

            remainingText.textContent =
                remaining.toLocaleString() +
                " remaining";
        }
    }


    // WEEKLY GOAL
    const weeklyGoal =
        document.getElementById(
            "weeklyCalorieGoal"
        );

    if (weeklyGoal) {
        weeklyGoal.textContent =
            calorieGoal.toLocaleString();
    }


    const todayChart =
        document.getElementById(
            "todayNutritionChart"
        );

    if (todayChart) {
        todayChart.style.height =
            Math.min(percentage, 100) + "%";
    }


    // MEALS
    const mealsList =
        document.getElementById(
            "nutritionMealsList"
        );

    if (mealsList) {

        if (meals.length === 0) {

            mealsList.innerHTML = `
                <div class="nutrition-meal-row">

                    <div class="
                        nutrition-meal-icon
                        breakfast-icon">
                        🍽️
                    </div>

                    <div class="nutrition-meal-info">
                        <span>MEALS</span>
                        <strong>
                            No meals planned yet
                        </strong>
                    </div>

                    <div class="nutrition-meal-macros">
                        <div>
                            <strong>0</strong>
                            <span>kcal</span>
                        </div>
                    </div>

                </div>
            `;

        } else {

            mealsList.innerHTML = "";


            meals
                .slice(0, 5)
                .forEach(function(meal) {

                    const row =
                        document.createElement("div");

                    row.className =
                        "nutrition-meal-row";


                    const type =
                        meal.type || "meal";


                    let icon = "🍽️";
                    let iconClass = "dinner-icon";


                    if (type === "breakfast") {
                        icon = "☀";
                        iconClass =
                            "breakfast-icon";
                    }

                    else if (type === "lunch") {
                        icon = "◐";
                        iconClass =
                            "lunch-icon";
                    }

                    else if (type === "snack") {
                        icon = "🍎";
                        iconClass =
                            "breakfast-icon";
                    }


                    row.innerHTML = `

                        <div class="
                            nutrition-meal-icon
                            ${iconClass}">
                            ${icon}
                        </div>

                        <div class="
                            nutrition-meal-info">

                            <span>
                                ${type.toUpperCase()}
                            </span>

                            <strong>
                                ${
                                    meal.recipe ||
                                    "Planned meal"
                                }
                            </strong>

                        </div>

                        <div class="
                            nutrition-meal-macros">

                            <div>
                                <strong>
                                    ${
                                        Number(
                                            meal.calories
                                        ) || 0
                                    }
                                </strong>

                                <span>kcal</span>
                            </div>

                        </div>
                    `;


                    mealsList.appendChild(row);

                });
        }
    }


    // USER
    const currentUser =
        JSON.parse(
            localStorage.getItem(
                "mealPlanCurrentUser"
            )
        );


    if (currentUser && currentUser.name) {

        const name =
            document.getElementById(
                "nutritionUserName"
            );

        const avatar =
            document.getElementById(
                "nutritionAvatar"
            );


        if (name) {
            name.textContent =
                currentUser.name;
        }


        if (avatar) {

            avatar.textContent =
                currentUser.name
                    .split(" ")
                    .map(function(part) {
                        return part.charAt(0);
                    })
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
        }
    }


    // DATE
    const date =
        document.getElementById(
            "nutritionDate"
        );


    if (date) {

        date.textContent =
            new Date().toLocaleDateString(
                "en-US",
                {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                }
            );
    }

}


updateNutritionPage();
/* ========================================
   GLOBAL SIDEBAR USER
======================================== */

function updateSidebarUser() {

    const loggedInUser =
        JSON.parse(
            localStorage.getItem("mealPlanCurrentUser")
        );

    if (!loggedInUser || !loggedInUser.name) {
        return;
    }

    const sidebarUser =
        document.querySelector(".sidebar-user");

    if (!sidebarUser) {
        return;
    }

    const nameElement =
        sidebarUser.querySelector(".user-info strong");

    const avatarElement =
        sidebarUser.querySelector(".user-avatar");


    /* FULL NAME */
    if (nameElement) {
        nameElement.textContent =
            loggedInUser.name;
    }


    /* INITIALS */
    if (avatarElement) {

        const initials =
            loggedInUser.name
                .split(" ")
                .filter(Boolean)
                .map(function (part) {
                    return part.charAt(0);
                })
                .slice(0, 2)
                .join("")
                .toUpperCase();

        avatarElement.textContent =
            initials;
    }
}

updateSidebarUser();
/* ========================================
   PREFERENCES - LOGGED IN USER
======================================== */

function updatePreferencesUser() {

    const user =
        JSON.parse(
            localStorage.getItem("mealPlanCurrentUser")
        );

    if (!user || !user.name) return;


    const profileName =
        document.getElementById(
            "preferencesProfileName"
        );

    const profileAvatar =
        document.getElementById(
            "preferencesProfileAvatar"
        );


    if (profileName) {
        profileName.textContent = user.name;
    }


    if (profileAvatar) {

        const initials =
            user.name
                .split(" ")
                .filter(Boolean)
                .map(function (part) {
                    return part.charAt(0);
                })
                .slice(0, 2)
                .join("")
                .toUpperCase();

        profileAvatar.textContent = initials;
    }
}

updatePreferencesUser();