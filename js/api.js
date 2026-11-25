const AppStore = {
  apiUrl: "",
  batches: [],
  barcodes: [],
  deliveries: [],
  addresses: [],
  onDataUpdatedCallbacks: [],
  isSyncing: false,
  UNSYNCED_KEYS_STORAGE: "tapal_unsynced_records_v1",

  init() {
    const hardcoded = (CONFIG.DEFAULT_API_URL && !CONFIG.DEFAULT_API_URL.includes("PASTE_YOUR"))
      ? CONFIG.DEFAULT_API_URL.trim()
      : "";
    const saved = localStorage.getItem(CONFIG.API_URL_KEY) || "";
    this.apiUrl = hardcoded || saved;

    const cached = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        this.batches = data.batches || [];
        this.barcodes = data.barcodes || [];
        this.deliveries = data.deliveries || [];
        this.addresses = (data.addresses && data.addresses.length) ? data.addresses : [...SAMPLE_ADDRESSES];
      } catch (e) {
        this.addresses = [...SAMPLE_ADDRESSES];
      }
    } else {
      this.addresses = [...SAMPLE_ADDRESSES];
    }

    this.notify();
    this.syncAll();

    setInterval(() => {
      if (!document.hidden) this.syncAll(true);
    }, 20000);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.syncAll(true);
    });
  },

  onUpdate(fn) {
    this.onDataUpdatedCallbacks.push(fn);
  },

  notify() {
    this.onDataUpdatedCallbacks.forEach(fn => {
      try { fn(); } catch (err) { console.error(err); }
    });
  },

  saveCache() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      batches: this.batches,
      barcodes: this.barcodes,
      deliveries: this.deliveries,
      addresses: this.addresses
    }));
  },

  getUnsyncedRegistry() {
    try {
      return JSON.parse(localStorage.getItem(this.UNSYNCED_KEYS_STORAGE) || '{"batches":{},"deliveries":{},"deletedBatches":[],"deletedDeliveries":[]}');
    } catch (e) {
      return { batches: {}, deliveries: {}, deletedBatches: [], deletedDeliveries: [] };
    }
  },

  saveUnsyncedRegistry(reg) {
    localStorage.setItem(this.UNSYNCED_KEYS_STORAGE, JSON.stringify(reg));
  },

  recordLocalMutation(action, dataObj) {
    const reg = this.getUnsyncedRegistry();
    if (action === "saveBatch" && dataObj && dataObj.Batch_ID) {
      reg.batches[String(dataObj.Batch_ID)] = { ...dataObj };
      reg.deletedBatches = reg.deletedBatches.filter(id => id !== String(dataObj.Batch_ID));
    } else if (action === "deleteBatch" && dataObj && dataObj.Batch_ID) {
      delete reg.batches[String(dataObj.Batch_ID)];
      if (!reg.deletedBatches.includes(String(dataObj.Batch_ID))) {
        reg.deletedBatches.push(String(dataObj.Batch_ID));
      }
    } else if (action === "saveDelivery" && dataObj && dataObj.Task_ID) {
      reg.deliveries[String(dataObj.Task_ID)] = { ...dataObj };
      reg.deletedDeliveries = reg.deletedDeliveries.filter(id => id !== String(dataObj.Task_ID));
    } else if (action === "saveDeliveryBatch" && Array.isArray(dataObj)) {
      dataObj.forEach(item => {
        if (item && item.Task_ID) {
          reg.deliveries[String(item.Task_ID)] = { ...item };
          reg.deletedDeliveries = reg.deletedDeliveries.filter(id => id !== String(item.Task_ID));
        }
      });
    } else if (action === "deleteDelivery" && dataObj && dataObj.Task_ID) {
      delete reg.deliveries[String(dataObj.Task_ID)];
      if (!reg.deletedDeliveries.includes(String(dataObj.Task_ID))) {
        reg.deletedDeliveries.push(String(dataObj.Task_ID));
      }
    }
    this.saveUnsyncedRegistry(reg);
  },

  dedupeByKey(arr, key) {
    const seen = new Set();
    return arr.filter(item => {
      const id = String(item[key] || "").trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  },

  normalizeDeliveryRow(t, idx = 0) {
    return {
      Task_ID: String(t.Task_ID || `TASK-${idx + 1}`),
      Direction: String(t.Direction || "Outward"),
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
      Stage2_Receiver_Name: String(t.Stage2_Receiver_Name || ""),
      Stage2_Comments: String(t.Stage2_Comments || ""),
      Receipt_Given: String(t.Receipt_Given || ""),
      Receipt_No_Reason: String(t.Receipt_No_Reason || ""),
      Receiver_Name: String(t.Receiver_Name || ""),
      Reported_DateTime: String(t.Reported_DateTime || ""),
      Enquirer_Name: String(t.Enquirer_Name || ""),
      Enquiry_Text: String(t.Enquiry_Text || ""),
      Reply_Text: String(t.Reply_Text || ""),
      Reply_DateTime: String(t.Reply_DateTime || ""),
      Report_Status: String(t.Report_Status || ""),
      Report_Method: String(t.Report_Method || ""),
      RoundTrip_Purpose: String(t.RoundTrip_Purpose || ""),
      RoundTrip_Stops_JSON: typeof t.RoundTrip_Stops_JSON === "string" ? t.RoundTrip_Stops_JSON : JSON.stringify(t.RoundTrip_Stops_JSON || []),
      RoundTrip_Custody: String(t.RoundTrip_Custody || "With Me / In Transit")
    };
  },

  async syncAll(silent = false) {
    const badge = document.getElementById("syncStatus");
    if (!this.apiUrl || this.apiUrl.includes("PASTE_YOUR")) {
      if (badge) {
        badge.textContent = "Local";
        badge.className = "badge offline";
      }
      return;
    }

    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      if (!silent && badge) badge.textContent = "Syncing...";
      await this.flushQueue();

      const reg = this.getUnsyncedRegistry();
      for (const bId of Object.keys(reg.batches)) {
        await this.sendPostRaw("saveBatch", reg.batches[bId]);
      }
      for (const delBId of reg.deletedBatches) {
        await this.sendPostRaw("deleteBatch", { Batch_ID: delBId });
      }
      for (const tId of Object.keys(reg.deliveries)) {
        await this.sendPostRaw("saveDelivery", reg.deliveries[tId]);
      }
      for (const delTId of reg.deletedDeliveries) {
        await this.sendPostRaw("deleteDelivery", { Task_ID: delTId });
      }

      const sep = this.apiUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${this.apiUrl}${sep}action=getAllData&_t=${Date.now()}`, {
        cache: "no-store"
      });
      const data = await res.json();

      if (data.status === "ok") {
        const remoteBatchMap = new Map();
        (data.batches || []).forEach(b => {
          const id = String(b.Batch_ID || "").trim();
          if (id && !reg.deletedBatches.includes(id)) {
            remoteBatchMap.set(id, b);
            if (reg.batches[id]) delete reg.batches[id];
          }
        });
        reg.deletedBatches = reg.deletedBatches.filter(id =>
          (data.batches || []).some(b => String(b.Batch_ID || "").trim() === id)
        );
        Object.keys(reg.batches).forEach(id => {
          remoteBatchMap.set(id, reg.batches[id]);
        });
        this.batches = this.dedupeByKey(Array.from(remoteBatchMap.values()), "Batch_ID");

        this.barcodes = data.barcodes || [];

        const remoteDelivMap = new Map();
        (data.deliveries || []).forEach((t, idx) => {
          const norm = this.normalizeDeliveryRow(t, idx);
          const id = norm.Task_ID.trim();
          if (id && !reg.deletedDeliveries.includes(id)) {
            remoteDelivMap.set(id, norm);
            if (reg.deliveries[id]) delete reg.deliveries[id];
          }
        });
        reg.deletedDeliveries = reg.deletedDeliveries.filter(id =>
          (data.deliveries || []).some(t => String(t.Task_ID || "").trim() === id)
        );
        Object.keys(reg.deliveries).forEach(id => {
          remoteDelivMap.set(id, this.normalizeDeliveryRow(reg.deliveries[id]));
        });
        this.deliveries = this.dedupeByKey(Array.from(remoteDelivMap.values()), "Task_ID");

        this.saveUnsyncedRegistry(reg);

        if (data.addresses && data.addresses.length > 0) {
          this.addresses = data.addresses.map((a, idx) => ({
            District_Sl: String(a.District_Sl || ""),
            Code: String(a.Code || a.Address_ID || `ROW-${idx + 1}`),
            School: String(a.School || a.Office_Name || ""),
            Address_Line_1: String(a.Address_Line_1 || ""),
            Address_Line_2: String(a.Address_Line_2 || ""),
            District: String(a.District || a.District_Place || ""),
            PIN: String(a.PIN || a.PIN_Code || ""),
            Designation: String(a.Designation || ""),
            Principal_Name: String(a.Principal_Name || ""),
            Principal_Phone: String(a.Principal_Phone || ""),
            Clerk_Name: String(a.Clerk_Name || ""),
            Clerk_Phone: String(a.Clerk_Phone || "")
          }));
        } else if (!this.addresses.length) {
          this.addresses = [...SAMPLE_ADDRESSES];
        }

        this.saveCache();
        this.notify();
        if (badge) {
          badge.textContent = "Synced ✓";
          badge.className = "badge online";
        }
      }
    } catch (e) {
      if (badge) {
        badge.textContent = "Offline";
        badge.className = "badge offline";
      }
    } finally {
      this.isSyncing = false;
    }
  },

  async sendPostRaw(action, dataObj) {
    await fetch(this.apiUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, data: dataObj })
    });
  },

  async pushAction(action, dataObj) {
    this.recordLocalMutation(action, dataObj);
    this.saveCache();
    this.notify();

    if (!this.apiUrl || this.apiUrl.includes("PASTE_YOUR")) return;

    const badge = document.getElementById("syncStatus");
    try {
      if (badge) badge.textContent = "Saving...";
      await this.sendPostRaw(action, dataObj);
      if (badge) {
        badge.textContent = "Saved ✓";
        badge.className = "badge online";
      }
      setTimeout(() => this.syncAll(true), 2000);
    } catch (e) {
      const q = JSON.parse(localStorage.getItem(CONFIG.QUEUE_KEY) || "[]");
      q.push({ action, data: dataObj });
      localStorage.setItem(CONFIG.QUEUE_KEY, JSON.stringify(q));
      if (badge) {
        badge.textContent = "Queued";
        badge.className = "badge offline";
      }
    }
  },

  async flushQueue() {
    const q = JSON.parse(localStorage.getItem(CONFIG.QUEUE_KEY) || "[]");
    if (!q.length) return;
    for (const item of q) {
      await this.sendPostRaw(item.action, item.data);
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

  toDateTimeLocalValue(raw) {
    if (!raw) return "";
    const str = String(raw).trim();

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
      return str.slice(0, 16);
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    }
    return "";
  },

  timestampMs(raw, fallbackId = "") {
    if (raw) {
      const parsed = new Date(String(raw).trim());
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
    const idDigits = String(fallbackId || "").match(/(\d{10,13})/);
    return idDigits ? parseInt(idDigits[1], 10) : 0;
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
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 2800);
}

document.addEventListener("DOMContentLoaded", () => {
  const settingsModal = document.getElementById("settingsModal");
  if (settingsModal) settingsModal.classList.add("hidden");

  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.querySelectorAll(".module-view").forEach(v => v.classList.add("hidden"));
      const viewEl = document.getElementById(`view-${target}`);
      if (viewEl) viewEl.classList.remove("hidden");

      if (target === "address" && typeof AddressModule !== "undefined") {
        AddressModule.renderDistrictFilters();
        AddressModule.renderDirectory();
      }
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

  const btnSettings = document.getElementById("btnSettings");
  if (btnSettings) {
    btnSettings.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("settingsApiUrl").value = AppStore.apiUrl.includes("PASTE_YOUR") ? "" : AppStore.apiUrl;
      settingsModal.classList.remove("hidden");
    });
  }

  const btnCloseSettings = document.getElementById("btnCloseSettings");
  if (btnCloseSettings) {
    btnCloseSettings.addEventListener("click", () => settingsModal.classList.add("hidden"));
  }

  const btnSaveSettings = document.getElementById("btnSaveSettings");
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", () => {
      const val = document.getElementById("settingsApiUrl").value.trim();
      if (val) {
        AppStore.apiUrl = val;
        localStorage.setItem(CONFIG.API_URL_KEY, val);
        settingsModal.classList.add("hidden");
        AppStore.syncAll();
      }
    });
  }

  const btnSyncNow = document.getElementById("btnSyncNow");
  if (btnSyncNow) {
    btnSyncNow.addEventListener("click", () => AppStore.syncAll());
  }

  AppStore.init();
});
