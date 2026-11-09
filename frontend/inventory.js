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
        const edit = el("button", "more-btn", "✎");
        edit.type = "button";
        edit.title = "Edit quantity or expiration";
        edit.setAttribute("aria-label", "Edit " + item.name);
        edit.addEventListener("click", () => editItem(item));
        statusCell.append(edit);

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

    function editItem(item) {
        const m = MM.modal('<h2>Edit ' + MM.esc(item.name) + '</h2><div class="s4-sub">Changes are saved to your pantry.</div>' +
            '<div class="s4-row"><label class="s4-field">Quantity<input id="eiQty" type="number" min="0" step="0.01" value="' + Number(item.quantity) + '"></label>' +
            '<label class="s4-field">Unit<input id="eiUnit" maxlength="20" value="' + MM.esc(item.unit) + '"></label>' +
            '<label class="s4-field">Expires<input id="eiExp" type="date" value="' + (item.expiration_date || "") + '"></label></div>' +
            '<div class="s4-err" id="eiErr"></div><button class="s4-btn" id="eiGo">Save</button>');
        m.querySelector("#eiGo").onclick = async () => {
            const body = { quantity: Number(m.querySelector("#eiQty").value), unit: m.querySelector("#eiUnit").value.trim() };
            const ex = m.querySelector("#eiExp").value; if (ex) body.expiration_date = ex;
            try {
                await api("/api/inventory/" + item.item_id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                m.close(); await refresh();
            } catch (e) { m.querySelector("#eiErr").textContent = e.message; }
        };
    }

    let activeCategory = "all";
    let searchText = "";

    function visibleItems() {
        return items.filter((i) =>
            (activeCategory === "all" || i.category === activeCategory) &&
            (!searchText || i.name.toLowerCase().includes(searchText)));
    }

    function render() {
        rowsBox.replaceChildren();
        const shown = visibleItems();
        if (!shown.length) {
            const empty = el("div", "inventory-row");
            const msg = el("div", null, items.length ? "No items match this filter. Try another category or clear the search." : "Your pantry is empty. Click “+ Add item” to add your first ingredient.");
            msg.style.fontSize = "13px";
            msg.style.color = "#6c746f";
            msg.style.gridColumn = "1 / -1";
            empty.append(msg);
            rowsBox.append(empty);
        }
        shown.forEach((item) => rowsBox.append(buildRow(item)));

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
              " expiring soon. Get meal ideas that use them up before they go to waste."
            : items.length ? "Get meal ideas based on the " + items.length + " item" + (items.length === 1 ? "" : "s") + " in your pantry."
            : "Add your first pantry item to get started.";
    }

    document.querySelectorAll(".filter-btn").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        activeCategory = b.dataset.category;
        render();
    }));
    const searchBox = $("inventorySearch");
    if (searchBox) searchBox.addEventListener("input", () => { searchText = searchBox.value.trim().toLowerCase(); render(); });

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
