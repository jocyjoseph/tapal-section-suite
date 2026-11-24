const AppStore = {
  apiUrl: localStorage.getItem(CONFIG.API_URL_KEY) || CONFIG.DEFAULT_API_URL,
  batches: [],
  barcodes: [],
  deliveries: [],
  addresses: [],
  onDataUpdatedCallbacks: [],

  init() {
    const cached = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      this.batches = data.batches || [];
      this.barcodes = data.barcodes || [];
      this.deliveries = data.deliveries || [];
      this.addresses = data.addresses && data.addresses.length ? data.addresses : [...SAMPLE_ADDRESSES];
    } else {
      this.addresses = [...SAMPLE_ADDRESSES];
    }
    this.notify();
    this.syncAll();
  },

  onUpdate(fn) {
    this.onDataUpdatedCallbacks.push(fn);
  },

  notify() {
    this.onDataUpdatedCallbacks.forEach(fn => fn());
  },

  saveCache() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      batches: this.batches,
      barcodes: this.barcodes,
      deliveries: this.deliveries,
      addresses: this.addresses
    }));
  },

  async syncAll() {
    const badge = document.getElementById("syncStatus");
    if (!this.apiUrl || this.apiUrl.includes("PASTE_YOUR")) {
      badge.textContent = "Local";
      badge.className = "badge offline";
      return;
    }

    try {
      badge.textContent = "Syncing...";
      await this.flushQueue();
      const res = await fetch(`${this.apiUrl}?action=getAllData`);
      const data = await res.json();
      if (data.status === "ok") {
        this.batches = data.batches || [];
        this.barcodes = data.barcodes || [];
        this.deliveries = (data.deliveries || []).map((t, idx) => ({
          Task_ID: String(t.Task_ID || `TASK-${idx + 1}`),
          Created_DateTime: String(t.Created_DateTime || ""),
          Office_Name: String(t.Office_Name || ""),
          Designation: String(t.Designation || ""),
          Section: String(t.Section || ""),
          Nature: String(t.Nature || "File"),
          Item_Count: Number(t.Item_Count || 1),
          Nature_Mode: String(t.Nature_Mode || "Same"),
          Items_JSON: typeof t.Items_JSON === "string" ? t.Items_JSON : JSON.stringify(t.Items_JSON || []),
          Items_Summary: String(t.Items_Summary || ""),
          Description: String(t.Description || ""),
          Has_Attachments: String(t.Has_Attachments || "No"),
          Attachment_Count: Number(t.Attachment_Count || 0),
          Attachments_JSON: typeof t.Attachments_JSON === "string" ? t.Attachments_JSON : JSON.stringify(t.Attachments_JSON || []),
          Planned_Delivery_DT: String(t.Planned_Delivery_DT || ""),
          Urgency: String(t.Urgency || "Normal"),
          Delivery_Status: String(t.Delivery_Status || ""),
          Not_Delivered_Reason: String(t.Not_Delivered_Reason || ""),
          Completed_DateTime: String(t.Completed_DateTime || ""),
          Stage2_Comments: String(t.Stage2_Comments || ""),
          Receipt_Given: String(t.Receipt_Given || ""),
          Receipt_No_Reason: String(t.Receipt_No_Reason || ""),
          Receiver_Name: String(t.Receiver_Name || ""),
          Reported_DateTime: String(t.Reported_DateTime || "")
        }));

        if (data.addresses && data.addresses.length) {
          this.addresses = data.addresses.map((a, idx) => ({
            District_Sl: String(a.District_Sl || ""),
            Code: String(a.Code || a.Address_ID || `ROW-${idx + 1}`),
            School: String(a.School || a.Office_Name || ""),
            Address_Line_1: String(a.Address_Line_1 || ""),
            Address_Line_2: String(a.Address_Line_2 || ""),
            District: String(a.District || a.District_Place || ""),
            PIN: String(a.PIN || a.PIN_Code || ""),
            Designation: String(a.Designation || "The Principal"),
            Principal_Name: String(a.Principal_Name || ""),
            Principal_Phone: String(a.Principal_Phone || ""),
            Clerk_Name: String(a.Clerk_Name || ""),
            Clerk_Phone: String(a.Clerk_Phone || "")
          }));
        }
        this.saveCache();
        this.notify();
        badge.textContent = "Synced ✓";
        badge.className = "badge online";
      }
    } catch (e) {
      badge.textContent = "Offline";
      badge.className = "badge offline";
    }
  },

  async pushAction(action, dataObj) {
    this.saveCache();
    this.notify();

    if (!this.apiUrl || this.apiUrl.includes("PASTE_YOUR")) return;

    const badge = document.getElementById("syncStatus");
    try {
      badge.textContent = "Saving...";
      await fetch(this.apiUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: dataObj })
      });
      badge.textContent = "Saved ✓";
      badge.className = "badge online";
    } catch (e) {
      const q = JSON.parse(localStorage.getItem(CONFIG.QUEUE_KEY) || "[]");
      q.push({ action, data: dataObj });
      localStorage.setItem(CONFIG.QUEUE_KEY, JSON.stringify(q));
      badge.textContent = "Queued";
      badge.className = "badge offline";
    }
  },

  async flushQueue() {
    const q = JSON.parse(localStorage.getItem(CONFIG.QUEUE_KEY) || "[]");
    if (!q.length) return;
    for (const item of q) {
      await fetch(this.apiUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });
    }
    localStorage.removeItem(CONFIG.QUEUE_KEY);
  },

  rankByFrequency(values, fallbackList = []) {
    const counts = {};
    fallbackList.forEach(v => { counts[v] = 0.1; });
    values.forEach((v, idx) => {
      if (!v) return;
      const clean = String(v).trim();
      if (!clean) return;
      counts[clean] = (counts[clean] || 0) + 1 + Math.max(0, (50 - idx) * 0.01);
    });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  },

  getNextSomSuggestion() {
    let maxNum = 0;
    let prefix = "";
    this.batches.forEach(b => {
      if (!b.SOM_Number) return;
      const match = String(b.SOM_Number).trim().match(/^(.*?)(\d+)$/);
      if (match) {
        const num = parseInt(match[2], 10);
        if (num > maxNum) {
          maxNum = num;
          prefix = match[1];
        }
      }
    });
    return maxNum > 0 ? `${prefix}${maxNum + 1}` : "101";
  }
};

const DateTimeHelper = {
  nowLocalISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  },

  enforceNoFuture(inputEl, notifyUser = false) {
    if (inputEl.dataset.allowFuture === "true") return;
    const maxISO = this.nowLocalISO();
    inputEl.max = maxISO;
    if (inputEl.value && inputEl.value > maxISO) {
      inputEl.value = maxISO;
      if (notifyUser) showToast("Future date or time is not allowed.");
    }
  },

  stepDays(inputEl, deltaDays) {
    const maxISO = this.nowLocalISO();
    let base = inputEl.value ? new Date(inputEl.value) : new Date();
    if (isNaN(base.getTime())) base = new Date();
    base.setDate(base.getDate() + deltaDays);

    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    if (local > maxISO && inputEl.dataset.allowFuture !== "true") {
      inputEl.value = maxISO;
      showToast("Cannot move past current date & time.");
    } else {
      inputEl.value = local;
    }
    if (inputEl.dataset.allowFuture !== "true") {
      inputEl.max = maxISO;
    }
  },

  formatShort(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
};

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 2800);
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.querySelectorAll(".module-view").forEach(v => v.classList.add("hidden"));
      document.getElementById(`view-${target}`).classList.remove("hidden");
    });
  });

  document.querySelectorAll("input[type='datetime-local']").forEach(inp => {
    inp.addEventListener("focus", () => DateTimeHelper.enforceNoFuture(inp, false));
    inp.addEventListener("change", () => DateTimeHelper.enforceNoFuture(inp, true));
  });

  document.addEventListener("click", (e) => {
    if (e.target.dataset.stepDt) {
      const inp = document.getElementById(e.target.dataset.stepDt);
      DateTimeHelper.stepDays(inp, parseInt(e.target.dataset.days, 10));
    }
    if (e.target.dataset.nowDt) {
      const inp = document.getElementById(e.target.dataset.nowDt);
      inp.value = DateTimeHelper.nowLocalISO();
      if (inp.dataset.allowFuture !== "true") {
        inp.max = inp.value;
      }
    }
  });

  document.getElementById("btnSettings").addEventListener("click", () => {
    document.getElementById("settingsApiUrl").value = AppStore.apiUrl.includes("PASTE_YOUR") ? "" : AppStore.apiUrl;
    document.getElementById("settingsModal").classList.remove("hidden");
  });
  document.getElementById("btnCloseSettings").addEventListener("click", () => {
    document.getElementById("settingsModal").classList.add("hidden");
  });
  document.getElementById("btnSaveSettings").addEventListener("click", () => {
    const val = document.getElementById("settingsApiUrl").value.trim();
    if (val) {
      AppStore.apiUrl = val;
      localStorage.setItem(CONFIG.API_URL_KEY, val);
      document.getElementById("settingsModal").classList.add("hidden");
      AppStore.syncAll();
    }
  });
  document.getElementById("btnSyncNow").addEventListener("click", () => AppStore.syncAll());

  AppStore.init();
});