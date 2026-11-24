/* GearTrack — sports equipment monitoring & management
   Storage: browser localStorage (the web equivalent of the C++ file handling:
   records are saved permanently and reloaded whenever the system is opened). */
"use strict";

const ACCOUNTS_KEY = "geartrack_accounts";
const DATA_KEY = u => "geartrack_data_" + u;
const SESSION_KEY = "geartrack_session";
const STATUSES = ["Available", "Borrowed", "Damaged", "Missing"];

const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
(() => { const w = document.getElementById("jsWarn"); if (w) w.remove(); })();
let currentUser = null;
let items = [];
let editingId = null;
let sortDir = 1;          // 1 = ascending, -1 = descending
let statusFilter = "";

/* ---------- storage helpers ---------- */
const memStore = {};      // fallback if the browser blocks localStorage
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return key in memStore ? JSON.parse(memStore[key]) : fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { memStore[key] = JSON.stringify(value); toast("Browser storage is blocked, data will not persist."); }
  return true;
}
const saveItems = () => save(DATA_KEY(currentUser), items);

/* ---------- fixed login (shared by the group) ---------- */
const USERNAME = "geartrack";
const PASSWORD = "group7";

on("loginForm", "submit", e => {
  e.preventDefault();
  const user = $("loginUser").value.trim().toLowerCase();
  if (user !== USERNAME || $("loginPass").value !== PASSWORD)
    return $("loginMsg").textContent = "Wrong username or password.";
  $("loginMsg").textContent = "";
  try { enter(USERNAME); e.target.reset(); }
  catch (err) { $("loginMsg").textContent = "Error opening the system: " + err.message; }
});

function enter(key) {
  currentUser = key;
  try { sessionStorage.setItem(SESSION_KEY, key); } catch {}
  items = load(DATA_KEY(key), []);
  $("whoami").textContent = key;
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("search").value = ""; statusFilter = ""; $("filterStatus").value = "";
  render();
}

on("logoutBtn", "click", () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  currentUser = null; items = [];
  $("app").classList.add("hidden");
  $("auth").classList.remove("hidden");
});

/* ---------- render: stats, search, sort, table ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderStats() {
  const total = items.reduce((n, i) => n + i.quantity, 0);
  const by = s => items.filter(i => i.status === s).reduce((n, i) => n + i.quantity, 0);
  const cards = [["", "Total units", total], ...STATUSES.map(s => [s, s, by(s)])];
  $("stats").innerHTML = cards.map(([val, label, n]) =>
    `<button class="stat" data-status="${val}"><b>${n}</b><small>${label}</small></button>`).join("");
  $("stats").querySelectorAll(".stat").forEach(b => b.addEventListener("click", () => {
    statusFilter = b.dataset.status; $("filterStatus").value = statusFilter; render();
  }));
}

function visibleItems() {
  const q = $("search").value.trim().toLowerCase();
  const key = $("sortBy").value;
  return items
    .filter(i => !statusFilter || i.status === statusFilter)
    .filter(i => !q || [i.name, i.category, i.condition, i.status].some(v => v.toLowerCase().includes(q)))
    .sort((a, b) => {
      const r = key === "quantity" ? a.quantity - b.quantity
        : a[key].localeCompare(b[key], undefined, { sensitivity: "base" });
      return (r || a.name.localeCompare(b.name)) * sortDir;
    });
}

function render() {
  renderStats();
  const list = visibleItems();
  $("rows").innerHTML = list.map(i => `
    <tr>
      <td class="name">${esc(i.name)}</td>
      <td>${esc(i.category)}</td>
      <td class="num">${i.quantity}</td>
      <td><span class="pill c-${i.condition}">${i.condition}</span></td>
      <td><span class="pill s-${i.status}">${i.status}</span></td>
      <td class="actions-cell">
        <button class="btn sm" data-edit="${i.id}">Edit</button>
        <button class="btn sm" data-del="${i.id}">Delete</button>
      </td>
    </tr>`).join("");
  $("empty").classList.toggle("hidden", list.length > 0);
  $("empty").textContent = items.length ? "No equipment matches your search." : "No equipment yet — add your first item.";
  $("sortDir").textContent = sortDir === 1
    ? ($("sortBy").value === "quantity" ? "1 → 9" : "A → Z")
    : ($("sortBy").value === "quantity" ? "9 → 1" : "Z → A");
}

["input", "change"].forEach(ev => {
  on("search", ev, render);
  on("sortBy", ev, render);
});
on("filterStatus", "change", e => { statusFilter = e.target.value; render(); });
on("sortDir", "click", () => { sortDir *= -1; render(); });

/* ---------- add / update / delete ---------- */
function openItem(item) {
  editingId = item ? item.id : null;
  $("dialogTitle").textContent = item ? "Edit equipment" : "Add equipment";
  $("fName").value = item?.name ?? "";
  $("fCategory").value = item?.category ?? "";
  $("fQty").value = item?.quantity ?? 1;
  $("fCondition").value = item?.condition ?? "Good";
  $("fStatus").value = item?.status ?? "Available";
  $("itemMsg").textContent = "";
  $("itemDialog").showModal();
  $("fName").focus();
}
on("addBtn", "click", () => openItem(null));
on("cancelItem", "click", () => $("itemDialog").close());

on("itemForm", "submit", e => {
  e.preventDefault();
  const name = $("fName").value.trim();
  const category = $("fCategory").value.trim();
  const quantity = parseInt($("fQty").value, 10);
  if (!name || !category) return $("itemMsg").textContent = "Name and category are required.";
  if (!Number.isInteger(quantity) || quantity < 0) return $("itemMsg").textContent = "Quantity must be 0 or more.";
  const data = { name, category, quantity, condition: $("fCondition").value, status: $("fStatus").value };
  if (editingId) {
    Object.assign(items.find(i => i.id === editingId), data);
    toast("Equipment updated");
  } else {
    items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data });
    toast("Equipment added");
  }
  saveItems(); render();
  $("itemDialog").close();
});

let deleteId = null;
on("rows", "click", e => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) openItem(items.find(i => i.id === ed.dataset.edit));
  if (del) {
    deleteId = del.dataset.del;
    $("delText").textContent = `"${items.find(i => i.id === deleteId).name}" will be removed permanently.`;
    $("delDialog").showModal();
  }
});
on("delDialog", "close", () => {
  if ($("delDialog").returnValue === "ok" && deleteId) {
    items = items.filter(i => i.id !== deleteId);
    saveItems(); render(); toast("Equipment deleted");
  }
  deleteId = null; $("delDialog").returnValue = "";
});

/* ---------- backup: copy / paste / file (move an inventory between devices) ---------- */
on("backupBtn", "click", () => {
  $("backupText").value = JSON.stringify(items, null, 2);
  $("backupDialog").showModal();
});
on("closeBackup", "click", () => $("backupDialog").close());
on("copyBackup", "click", async () => {
  const t = $("backupText"); t.select();
  try { await navigator.clipboard.writeText(t.value); toast("Copied"); }
  catch { try { document.execCommand("copy"); toast("Copied"); } catch { toast("Press Ctrl+C to copy"); } }
});
on("downloadBackup", "click", () => {
  const blob = new Blob([$("backupText").value], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `geartrack-${currentUser}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
});
on("fileBackup", "click", () => $("importFile").click());
on("importFile", "change", async e => {
  const file = e.target.files[0]; e.target.value = "";
  if (file) $("backupText").value = await file.text();
  toast("File read. Press Load to add it.");
});
on("loadBackup", "click", () => {
  try {
    const data = JSON.parse($("backupText").value);
    if (!Array.isArray(data)) throw 0;
    const clean = data.filter(d => d && d.name && d.category && Number.isInteger(+d.quantity))
      .map(d => ({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: String(d.name).slice(0, 60), category: String(d.category).slice(0, 30),
        quantity: Math.max(0, +d.quantity),
        condition: ["Good", "Fair", "Poor"].includes(d.condition) ? d.condition : "Good",
        status: STATUSES.includes(d.status) ? d.status : "Available"
      }));
    items = items.concat(clean); saveItems(); render();
    $("backupDialog").close(); toast(`Loaded ${clean.length} item(s)`);
  } catch { toast("That text isn't a valid GearTrack backup."); }
});

/* ---------- toast & startup ---------- */
let toastTimer;
function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

(function init() {
  let s = null;
  try { s = sessionStorage.getItem(SESSION_KEY); } catch {}
  if (s === USERNAME) enter(s);
})();