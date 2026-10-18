// Inventory page <-> PostgreSQL database (GET/POST/DELETE /api/inventory).
// Replaces the old localStorage code, so every item is stored per user in the shared database.
(function () {
    const rowsBox = document.getElementById("inventoryRows");
    if (!rowsBox) return;

    const ICONS = { produce: "🥬", protein: "🍗", dairy: "🥛", grains: "🌾", other: "🍽️" };
    const SOON_DAYS = 3;   // "expiring soon" = within 3 days
    const LOW_QTY = 1;     // "low stock" = quantity of 1 or less

    const $ = (id) => document.getElementById(id);
    let items = [];

    async function api(url, options) {
        const res = await fetch(url, Object.assign({ credentials: "same-origin" }, options));
        if (res.status === 401) { window.location.href = "index.html"; throw new Error("Please log in"); }
        let data = {};
        try { data = await res.json(); } catch (e) { /* empty body */ }
        if (!res.ok) {
            let msg = "Request failed (" + res.status + ")";
            if (typeof data.detail === "string") msg = data.detail;
            else if (Array.isArray(data.detail) && data.detail.length) msg = data.detail[0].msg;
            throw new Error(msg);
        }
        return data;
    }

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function daysUntil(isoDate) {
        if (!isoDate) return null;
        const [y, m, d] = isoDate.split("-").map(Number);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return Math.round((new Date(y, m - 1, d) - today) / 86400000);
    }

    function statusOf(item) {
        const days = daysUntil(item.expiration_date);
        if (days !== null && days < 0) return { cls: "expiring", label: "● Expired" };
        if (days !== null && days <= SOON_DAYS) return { cls: "expiring", label: "● Expiring soon" };
        if (item.quantity <= LOW_QTY) return { cls: "low-stock", label: "● Low stock" };
        return { cls: "good", label: "● Good" };
    }

    function formatDate(isoDate) {
        if (!isoDate) return "—";
        const [y, m, d] = isoDate.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    function buildRow(item) {
        const cat = ["produce", "protein", "dairy", "grains"].includes(item.category) ? item.category : "other";
        const st = statusOf(item);
        const row = el("div", "inventory-row");

        const food = el("div", "food-name");
        food.append(el("div", "food-icon " + cat + "-bg", ICONS[cat]));
        const nameBox = el("div");
        nameBox.append(el("strong", null, item.name), el("span", null, "Saved to your account"));
        food.append(nameBox);

        const catCell = el("div");
        catCell.append(el("span", "category-tag " + cat + "-tag", cat.charAt(0).toUpperCase() + cat.slice(1)));

        const qty = el("div", "quantity");
        qty.append(el("strong", null, String(Number(item.quantity))), el("span", null, item.unit));

        const exp = el("div", "expiration");
        exp.append(el("strong", null, formatDate(item.expiration_date)));

        const statusCell = el("div");
        statusCell.append(el("span", "status-tag " + st.cls, st.label));

        const del = el("button", "more-btn remove-inventory-item", "×");
        del.type = "button";
        del.setAttribute("aria-label", "Remove " + item.name);
        del.addEventListener("click", async () => {
            try {
                await api("/api/inventory/" + item.item_id, { method: "DELETE" });
                await refresh();
            } catch (e) { alert(e.message); }
        });

        row.append(food, catCell, qty, exp, statusCell, del);
        return row;
    }

    function render() {
        rowsBox.replaceChildren();
        if (!items.length) {
            const empty = el("div", "inventory-row");
            const msg = el("div", null, "Your pantry is empty. Click “+ Add item” to add your first ingredient.");
            msg.style.fontSize = "13px";
            msg.style.color = "#6c746f";
            msg.style.gridColumn = "1 / -1";
            empty.append(msg);
            rowsBox.append(empty);
        }
        items.forEach((item) => rowsBox.append(buildRow(item)));

        const expiring = items.filter((i) => {
            const d = daysUntil(i.expiration_date);
            return d !== null && d <= SOON_DAYS;
        });
        const low = items.filter((i) => i.quantity <= LOW_QTY);
        $("invTotal").textContent = items.length;
        $("invExpiring").textContent = expiring.length;
        $("invLow").textContent = low.length;
        $("invCategories").textContent = new Set(items.map((i) => i.category)).size;
        $("invTip").textContent = expiring.length
            ? "You have " + expiring.length + " ingredient" + (expiring.length === 1 ? "" : "s") +
              " expiring soon. Add them to this week's meal plan so they don't go to waste."
            : items.length ? "Nothing is expiring soon. Nice work!"
            : "Add your first pantry item to get started.";
    }

    async function refresh() {
        items = await api("/api/inventory");
        render();
    }

    // ---- modal: open / close ----
    const modal = $("inventoryModal");
    const saveBtn = $("saveInventoryItem");
    let errorBox = null;

    $("addInventoryBtn").addEventListener("click", () => {
        modal.classList.add("show");
        $("inventoryItemName").focus();
    });
    $("closeInventoryModal").addEventListener("click", () => modal.classList.remove("show"));
    modal.addEventListener("click", (event) => {
        if (event.target === modal) modal.classList.remove("show");
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") modal.classList.remove("show");
    });

    function showError(message) {
        if (!errorBox) {
            errorBox = el("p", "error-message");
            errorBox.style.color = "#b73a3a";
            errorBox.style.fontSize = "13px";
            saveBtn.parentNode.insertBefore(errorBox, saveBtn);
        }
        errorBox.textContent = message;
    }

    saveBtn.addEventListener("click", async () => {
        const name = $("inventoryItemName").value.trim();
        if (!name) { $("inventoryItemName").focus(); return; }
        const qty = Number($("inventoryQuantity").value);
        if (!(qty > 0)) { showError("Quantity must be greater than 0."); return; }
        saveBtn.disabled = true;
        showError("");
        try {
            await api("/api/inventory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name,
                    category: $("inventoryCategory").value,
                    quantity: qty,
                    unit: $("inventoryUnit").value,
                    expiration_date: $("inventoryExpiration").value || null
                })
            });
            $("inventoryItemName").value = "";
            $("inventoryQuantity").value = "1";
            $("inventoryExpiration").value = "";
            modal.classList.remove("show");
            await refresh();
        } catch (e) {
            showError(e.message);
        } finally {
            saveBtn.disabled = false;
        }
    });

    refresh().catch((e) => {
        rowsBox.replaceChildren();
        const err = el("div", "inventory-row");
        err.append(el("div", null, "Could not load inventory: " + e.message));
        rowsBox.append(err);
    });
})();
