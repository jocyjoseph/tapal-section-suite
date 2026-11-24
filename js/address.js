const AddressModule = {
  // Each item in queue: { queueId, checked, Code, School, Address_Line_1, Address_Line_2, District, PIN, Designation, Principal_Name, Principal_Phone, Clerk_Name, Clerk_Phone, isTemp }
  dispatchQueue: [],
  tempAddresses: [],
  activeDistrict: "ALL",
  largeReaderList: [],
  largeReaderIdx: 0,
  largeFontSize: 24,
  editingAddrCode: null,
  pendingEditPayload: null,

  init() {
    this.renderDesignationPills();
    this.renderDistrictFilters();
    this.bindEvents();
    AppStore.onUpdate(() => {
      this.renderDistrictFilters();
      this.renderDirectory();
    });
    this.renderDirectory();
    this.updateQueueBadges();
  },

  switchSubView(subName) {
    document.querySelectorAll("[data-asub]").forEach(b => b.classList.toggle("active", b.dataset.asub === subName));
    document.querySelectorAll(".asub-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(`asub-${subName}`).classList.remove("hidden");
    if (subName === "queue") this.renderQueue();
  },

  isDisplayableCode(code) {
    const c = String(code || "").trim();
    if (!c) return false;
    return !c.startsWith("ID-") && !c.startsWith("TMP-") && !c.startsWith("ROW-");
  },

  // =========================================================
  // MALAYALAM-ENGLISH PHONETIC + FUZZY SEARCH ENGINE
  // =========================================================
  phoneticNormalize(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/zh/g, "l")
      .replace(/th/g, "t")
      .replace(/dh/g, "d")
      .replace(/bh/g, "b")
      .replace(/ph/g, "f")
      .replace(/sh/g, "s")
      .replace(/ch/g, "c")
      .replace(/([a-z])\1+/g, "$1")
      .replace(/oo/g, "u")
      .replace(/ee/g, "i")
      .replace(/aa/g, "a")
      .replace(/ou/g, "u")
      .replace(/y\b/g, "i")
      .trim();
  },

  levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  },

  matchesFuzzy(record, rawQuery) {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return true;

    const fullText = [
      record.Code,
      record.School,
      record.Address_Line_1,
      record.Address_Line_2,
      record.District,
      record.PIN,
      record.Principal_Name,
      record.Principal_Phone,
      record.Clerk_Name,
      record.Clerk_Phone
    ].filter(Boolean).join(" ").toLowerCase();

    if (fullText.includes(q)) return true;

    const phonFull = this.phoneticNormalize(fullText);
    const fullTokens = phonFull.split(/\s+/).filter(Boolean);
    const queryWords = q.split(/\s+/).filter(Boolean);

    return queryWords.every(word => {
      if (fullText.includes(word)) return true;
      const phonWord = this.phoneticNormalize(word);
      if (phonFull.includes(phonWord)) return true;

      if (phonWord.length >= 4) {
        const maxDist = phonWord.length >= 7 ? 2 : 1;
        return fullTokens.some(tok => Math.abs(tok.length - phonWord.length) <= maxDist && this.levenshtein(tok, phonWord) <= maxDist);
      }
      return false;
    });
  },

  getAllAddresses() {
    return [...this.tempAddresses, ...AppStore.addresses];
  },

  renderDistrictFilters() {
    const districts = ["ALL", ...new Set(this.getAllAddresses().map(a => a.District).filter(Boolean))];
    document.getElementById("districtFilterScroll").innerHTML = districts.map(d =>
      `<button type="button" class="batch-chip ${this.activeDistrict === d ? "active" : ""}" data-dist-filter="${d}">${d === "ALL" ? "All Districts" : d}</button>`
    ).join("");
  },

  renderDesignationPills() {
    document.getElementById("bulkDesigPills").innerHTML = [
      `<button type="button" class="smart-chip" data-bulk-desig="">(No Designation)</button>`,
      ...CONFIG.DEFAULT_DESIGNATIONS.map(d => `<button type="button" class="smart-chip" data-bulk-desig="${d}">${d}</button>`)
    ].join("");
  },

  // Helper to build clean Principal & Clerk contact HTML for both Directory & Large View
  buildContactsHTML(a, isLargeView = false) {
    const prinText = [a.Principal_Name, a.Principal_Phone].filter(Boolean).join(" • ");
    const clerkText = [a.Clerk_Name, a.Clerk_Phone].filter(Boolean).join(" • ");
    const hasAnyPhone = Boolean(String(a.Principal_Phone || "").trim() || String(a.Clerk_Phone || "").trim());

    if (isLargeView) {
      const rows = [];
      if (prinText) {
        rows.push(`<div><strong>Principal:</strong> ${a.Principal_Name || ""}${a.Principal_Phone ? ` • <a href="tel:${a.Principal_Phone}">${a.Principal_Phone}</a>` : ""}</div>`);
      }
      if (clerkText) {
        rows.push(`<div><strong>Clerk:</strong> ${a.Clerk_Name || ""}${a.Clerk_Phone ? ` • <a href="tel:${a.Clerk_Phone}">${a.Clerk_Phone}</a>` : ""}</div>`);
      }
      if (!hasAnyPhone) {
        rows.push(`
          <div class="mt-6">
            <button type="button" class="btn-mini accent" data-large-add-phone="${a.Code}">+ Add phone number if available</button>
          </div>
        `);
      }
      return rows.length ? `<div class="large-reader-contacts">${rows.join("")}</div>` : "";
    }

    // Directory card pills
    const pills = [];
    if (prinText) {
      const label = `Principal: ${[a.Principal_Name, a.Principal_Phone ? "(" + a.Principal_Phone + ")" : ""].filter(Boolean).join(" ")}`;
      pills.push(a.Principal_Phone
        ? `<a class="contact-pill" href="tel:${a.Principal_Phone}">${label}</a>`
        : `<span class="contact-pill">${label}</span>`
      );
    }
    if (clerkText) {
      const label = `Clerk: ${[a.Clerk_Name, a.Clerk_Phone ? "(" + a.Clerk_Phone + ")" : ""].filter(Boolean).join(" ")}`;
      pills.push(a.Clerk_Phone
        ? `<a class="contact-pill" href="tel:${a.Clerk_Phone}">${label}</a>`
        : `<span class="contact-pill">${label}</span>`
      );
    }
    if (!hasAnyPhone) {
      pills.push(`<button type="button" class="btn-mini" style="margin-top:4px;" data-edit-addr="${a.Code}">+ Add phone number</button>`);
    }

    return pills.length ? `<div class="mt-6">${pills.join(" ")}</div>` : "";
  },

  renderDirectory() {
    const query = document.getElementById("addrSearchInput").value;
    let list = this.getAllAddresses();

    if (this.activeDistrict !== "ALL") {
      list = list.filter(a => String(a.District).toLowerCase() === this.activeDistrict.toLowerCase());
    }
    if (query.trim()) {
      list = list.filter(a => this.matchesFuzzy(a, query));
    }

    document.getElementById("addrResultCountLabel").textContent = `${list.length} address(es)`;
    const wrap = document.getElementById("addressDirectoryList");

    if (!list.length) {
      wrap.innerHTML = `<div class="card muted small">No matching address. Use "+ Add Address" to add a school, office, institution, or individual.</div>`;
      return;
    }

    wrap.innerHTML = list.slice(0, 60).map(a => {
      const queuedCount = this.dispatchQueue.filter(q => String(q.Code) === String(a.Code)).length;
      const addrParts = [a.Address_Line_1, a.Address_Line_2, a.District].filter(Boolean).join(", ");
      const fullAddrLine = [addrParts, a.PIN ? "PIN - " + a.PIN : ""].filter(Boolean).join(", ");
      const showBadge = this.isDisplayableCode(a.Code);

      return `
        <div class="history-item ${queuedCount > 0 ? "checked" : ""}" style="${queuedCount > 0 ? "border-left:4px solid var(--success); background:#f0fdf4;" : ""}">
          <div class="row-between">
            <div>
              ${showBadge ? `<span class="badge primary" style="margin-right:4px;">${a.Code}</span>` : ""}
              <strong>${a.School}</strong>
              ${a.isTemp ? `<span class="badge offline">Today</span>` : ""}
            </div>
            <div class="row-gap">
              <button type="button" class="btn-mini" data-view-large="${a.Code}" title="Large font view to copy by hand">👁️</button>
              <button type="button" class="btn-mini" data-edit-addr="${a.Code}" title="View or edit address & phone numbers">✎</button>
            </div>
          </div>

          ${fullAddrLine ? `<div class="small mt-6">${fullAddrLine}</div>` : ""}

          ${this.buildContactsHTML(a, false)}

          <div class="row-between mt-8">
            <span class="small muted">${queuedCount > 0 ? `✓ In Queue (${queuedCount} label${queuedCount > 1 ? "s" : ""})` : "Not selected"}</span>
            <div class="row-gap">
              ${queuedCount > 0 ? `<button type="button" class="btn-mini" data-remove-one="${a.Code}" title="Remove 1 copy from queue">−</button>` : ""}
              <button type="button" class="btn-mini accent" data-add-queue="${a.Code}" title="Add to queue">
                ${queuedCount > 0 ? "+ Another Recipient" : "+ Select"}
              </button>
            </div>
          </div>
        </div>`;
    }).join("");
  },

  // =========================================================
  // MULTI-RECIPIENT DISPATCH QUEUE (FLEXIBLE DESIGNATION)
  // =========================================================
  addToQueue(code) {
    const addr = this.getAllAddresses().find(a => String(a.Code) === String(code));
    if (!addr) return;

    // Start with blank Designation so the user has full flexibility to address anyone at this address
    this.dispatchQueue.push({
      ...addr,
      queueId: "Q-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      checked: true,
      Designation: ""
    });

    this.updateQueueBadges();
    this.renderDirectory();
    showToast(`Added ${addr.School} to Queue`);
  },

  removeOneFromQueueByCode(code) {
    for (let i = this.dispatchQueue.length - 1; i >= 0; i--) {
      if (String(this.dispatchQueue[i].Code) === String(code)) {
        this.dispatchQueue.splice(i, 1);
        break;
      }
    }
    this.updateQueueBadges();
    this.renderDirectory();
  },

  updateQueueBadges() {
    const count = this.dispatchQueue.length;
    const checkedCount = this.dispatchQueue.filter(q => q.checked).length;

    document.getElementById("btnPrintCount").textContent = count;
    document.getElementById("queueTabCount").textContent = count;
    const checkedSpan = document.getElementById("checkedQueueCount");
    if (checkedSpan) checkedSpan.textContent = checkedCount;

    const navBadge = document.getElementById("printCountBadge");
    navBadge.textContent = count;
    navBadge.classList.toggle("hidden", count === 0);
  },

  renderQueue() {
    this.updateQueueBadges();
    const wrap = document.getElementById("dispatchQueueList");
    if (!this.dispatchQueue.length) {
      wrap.innerHTML = `<div class="card muted small">Queue is empty. Select addresses from Directory or "+ Add Address".</div>`;
      return;
    }

    wrap.innerHTML = this.dispatchQueue.map((item, idx) => {
      const isStandardDesig = CONFIG.DEFAULT_DESIGNATIONS.includes(item.Designation);
      const customTextVal = isStandardDesig ? "" : (item.Designation || "");
      const codeTag = this.isDisplayableCode(item.Code) ? ` (${item.Code})` : "";

      return `
        <div class="queue-card" style="${item.checked ? "" : "opacity:0.75; border-left-color:#94a3b8;"}">
          <div class="row-between">
            <label class="row-gap" style="margin:0; cursor:pointer; flex:1;">
              <input type="checkbox" data-qcheck="${item.queueId}" ${item.checked ? "checked" : ""} style="width:18px; height:18px;" />
              <span>#${idx + 1} • ${item.School}${codeTag}</span>
            </label>
            <div class="row-gap">
              <button type="button" class="btn-mini accent" data-dup-qid="${item.queueId}" title="Duplicate for another recipient at this address">+ Copy</button>
              <button type="button" class="btn-mini" data-rm-qid="${item.queueId}" title="Remove from queue">×</button>
            </div>
          </div>
          <div class="small muted mt-6">${[item.Address_Line_1, item.District, item.PIN].filter(Boolean).join(", ")}</div>
          <div class="row-gap mt-8">
            <select data-qdesig-select="${item.queueId}" style="max-width:175px;" title="Optional: Choose recipient designation">
              <option value="">-- Designation --</option>
              ${CONFIG.DEFAULT_DESIGNATIONS.map(d => `<option value="${d}" ${item.Designation === d ? "selected" : ""}>${d}</option>`).join("")}
            </select>
            <input type="text" data-qdesig-input="${item.queueId}" value="${customTextVal}" placeholder="Or type specific name..." />
          </div>
        </div>`;
    }).join("");
  },

  // =========================================================
  // ADD NEW ADDRESS (PURE PHYSICAL ADDRESS + CONTACTS)
  // =========================================================
  async saveNewAddress(permanent) {
    const school = document.getElementById("newAddrSchool").value.trim();
    const district = document.getElementById("newAddrDistrict").value.trim();
    const pin = document.getElementById("newAddrPin").value.trim();

    if (!school) {
      showToast("Name / Office / Institution is required.");
      return;
    }

    const rawCode = document.getElementById("newAddrCode").value.trim();
    const code = rawCode || (permanent ? "ID-" + Date.now().toString().slice(-6) : "TMP-" + Date.now().toString().slice(-6));

    const newRecord = {
      District_Sl: rawCode ? "NEW" : "GEN",
      Code: code,
      School: school,
      Address_Line_1: document.getElementById("newAddrLine1").value.trim(),
      Address_Line_2: document.getElementById("newAddrLine2").value.trim(),
      District: district,
      PIN: pin,
      Designation: "",
      Principal_Name: document.getElementById("newAddrPrinName").value.trim(),
      Principal_Phone: document.getElementById("newAddrPrinPhone").value.trim(),
      Clerk_Name: document.getElementById("newAddrClerkName").value.trim(),
      Clerk_Phone: document.getElementById("newAddrClerkPhone").value.trim(),
      isTemp: !permanent
    };

    if (permanent) {
      AppStore.addresses.unshift(newRecord);
      await AppStore.pushAction("saveAddress", newRecord);
      showToast(`Saved ${school} permanently & queued!`);
    } else {
      this.tempAddresses.unshift(newRecord);
      showToast(`Added ${school} for today's queue!`);
    }

    this.addToQueue(code);
    ["newAddrCode", "newAddrSchool", "newAddrLine1", "newAddrLine2", "newAddrDistrict", "newAddrPin", "newAddrPrinName", "newAddrPrinPhone", "newAddrClerkName", "newAddrClerkPhone"].forEach(id => {
      document.getElementById(id).value = "";
    });
    this.renderDistrictFilters();
    this.switchSubView("queue");
  },

  // =========================================================
  // 3-STEP WARNING GUARD FOR EDITING EXISTING ADDRESSES
  // =========================================================
  openEditAddressModal(code) {
    const addr = this.getAllAddresses().find(a => String(a.Code) === String(code));
    if (!addr) return;
    this.editingAddrCode = code;
    this.pendingEditPayload = null;

    document.getElementById("edCode").value = this.isDisplayableCode(addr.Code) ? addr.Code : "(No Code)";
    document.getElementById("edSchool").value = addr.School || "";
    document.getElementById("edLine1").value = addr.Address_Line_1 || "";
    document.getElementById("edLine2").value = addr.Address_Line_2 || "";
    document.getElementById("edDistrict").value = addr.District || "";
    document.getElementById("edPin").value = addr.PIN || "";
    document.getElementById("edPrinName").value = addr.Principal_Name || "";
    document.getElementById("edPrinPhone").value = addr.Principal_Phone || "";
    document.getElementById("edClerkName").value = addr.Clerk_Name || "";
    document.getElementById("edClerkPhone").value = addr.Clerk_Phone || "";

    document.querySelectorAll("#editAddrFieldsWrap input").forEach(inp => inp.disabled = true);
    document.getElementById("addrLockBanner").classList.remove("hidden");
    document.getElementById("editAddrFooterBtns").classList.add("hidden");
    document.getElementById("addrDiffConfirmBox").classList.add("hidden");

    document.getElementById("editAddressModal").classList.remove("hidden");
  },

  unlockAddressFields() {
    document.querySelectorAll("#editAddrFieldsWrap input").forEach(inp => {
      if (inp.id !== "edCode") inp.disabled = false;
    });
    document.getElementById("addrLockBanner").classList.add("hidden");
    document.getElementById("editAddrFooterBtns").classList.remove("hidden");
    showToast("Unlocked — edit carefully");
  },

  reviewAddressDiff() {
    const orig = this.getAllAddresses().find(a => String(a.Code) === String(this.editingAddrCode));
    if (!orig) return;

    const updated = {
      ...orig,
      School: document.getElementById("edSchool").value.trim(),
      Address_Line_1: document.getElementById("edLine1").value.trim(),
      Address_Line_2: document.getElementById("edLine2").value.trim(),
      District: document.getElementById("edDistrict").value.trim(),
      PIN: document.getElementById("edPin").value.trim(),
      Principal_Name: document.getElementById("edPrinName").value.trim(),
      Principal_Phone: document.getElementById("edPrinPhone").value.trim(),
      Clerk_Name: document.getElementById("edClerkName").value.trim(),
      Clerk_Phone: document.getElementById("edClerkPhone").value.trim()
    };

    const labels = {
      School: "Name / Office / School",
      Address_Line_1: "Address Line 1",
      Address_Line_2: "Address Line 2",
      District: "District",
      PIN: "PIN",
      Principal_Name: "Principal Name",
      Principal_Phone: "Principal Phone",
      Clerk_Name: "Clerk Name",
      Clerk_Phone: "Clerk Phone"
    };

    const diffs = [];
    Object.keys(labels).forEach(k => {
      if (String(orig[k] || "") !== String(updated[k] || "")) {
        diffs.push(`<div><strong>${labels[k]}:</strong> <span style="text-decoration:line-through;color:#b91c1c;">${orig[k] || "(empty)"}</span> → <span style="color:#15803d;font-weight:700;">${updated[k] || "(empty)"}</span></div>`);
      }
    });

    if (!diffs.length) {
      showToast("No changes detected.");
      return;
    }

    this.pendingEditPayload = updated;
    document.getElementById("addrDiffSummary").innerHTML = diffs.join("");
    document.getElementById("addrDiffConfirmBox").classList.remove("hidden");
    document.getElementById("editAddrFooterBtns").classList.add("hidden");
  },

  async commitAddressUpdate() {
    if (!this.pendingEditPayload) return;
    const updated = this.pendingEditPayload;

    const idx = AppStore.addresses.findIndex(a => String(a.Code) === String(updated.Code));
    if (idx !== -1) AppStore.addresses[idx] = updated;
    else {
      const tIdx = this.tempAddresses.findIndex(a => String(a.Code) === String(updated.Code));
      if (tIdx !== -1) this.tempAddresses[tIdx] = updated;
    }

    this.dispatchQueue.forEach(q => {
      if (String(q.Code) === String(updated.Code)) {
        const keepDesig = q.Designation;
        Object.assign(q, updated);
        q.Designation = keepDesig;
      }
    });

    if (!updated.isTemp) {
      await AppStore.pushAction("saveAddress", updated);
    }

    document.getElementById("editAddressModal").classList.add("hidden");
    this.renderDirectory();
    this.renderQueue();
    showToast("Address & contacts updated ✓");
  },

  // =========================================================
  // LARGE-FONT "COPY BY HAND" READER
  // =========================================================
  openLargeReader(singleCode = null) {
    if (singleCode) {
      const found = this.getAllAddresses().find(a => String(a.Code) === String(singleCode));
      if (!found) return;
      // Opening directly from Directory shows pure physical address (Designation blank)
      this.largeReaderList = [{ ...found, Designation: "" }];
    } else if (this.dispatchQueue.length) {
      this.largeReaderList = [...this.dispatchQueue];
    } else {
      showToast("Select addresses or tap 👁️ on any entry.");
      return;
    }

    this.largeReaderIdx = 0;
    this.renderLargeReaderSlide();
    document.getElementById("largeReaderModal").classList.remove("hidden");
  },

  renderLargeReaderSlide() {
    const item = this.largeReaderList[this.largeReaderIdx];
    if (!item) return;

    document.getElementById("largeReaderIndex").textContent = `${this.largeReaderIdx + 1} of ${this.largeReaderList.length}`;
    const body = document.getElementById("largeReaderBody");
    body.style.fontSize = `${this.largeFontSize}px`;

    const codeSuffix = this.isDisplayableCode(item.Code) ? ` (${item.Code})` : "";
    const districtPin = [item.District, item.PIN ? "PIN - " + item.PIN : ""].filter(Boolean).join(", ");

    const lines = [
      `<div style="font-weight:700;">To,</div>`,
      item.Designation ? `<div>${item.Designation},</div>` : "",
      `<div>${item.School}${codeSuffix}</div>`,
      item.Address_Line_1 ? `<div>${item.Address_Line_1}</div>` : "",
      item.Address_Line_2 ? `<div>${item.Address_Line_2}</div>` : "",
      districtPin ? `<div>${districtPin}</div>` : ""
    ].filter(Boolean).join("");

    body.innerHTML = lines + this.buildContactsHTML(item, true);
  },

  // =========================================================
  // A4 STICKER SHEET PRINT PREVIEW
  // =========================================================
  openPrintPreview() {
    if (!this.dispatchQueue.length) {
      showToast("Add at least 1 address to the Queue first.");
      return;
    }
    document.getElementById("printPreviewModal").classList.remove("hidden");
    this.renderStickerSheet();
  },

  renderStickerSheet() {
    const gridClass = document.getElementById("labelGridSelect").value;
    const tagText = document.getElementById("labelTagSelect").value;
    const startSlot = Math.max(1, parseInt(document.getElementById("labelStartSlot").value || "1", 10));
    const showCode = document.getElementById("chkShowCodeOnLabel").checked;

    document.getElementById("printSummaryLabel").textContent = `${this.dispatchQueue.length} label(s) • Start #${startSlot}`;
    const sheet = document.getElementById("printableSheet");
    sheet.className = `a4-sheet ${gridClass}`;

    const blanks = Array.from({ length: startSlot - 1 }, () => `<div class="sticker-cell"></div>`);

    const labels = this.dispatchQueue.map(a => {
      const codePart = (showCode && this.isDisplayableCode(a.Code)) ? ` (${a.Code})` : "";
      const districtPin = [a.District, a.PIN ? "PIN - " + a.PIN : ""].filter(Boolean).join(", ");
      return `
        <div class="sticker-cell">
          ${tagText ? `<div class="sticker-tag">${tagText}</div>` : ""}
          <div class="sticker-to">To,</div>
          ${a.Designation ? `<div class="sticker-line">${a.Designation},</div>` : ""}
          <div class="sticker-line">${a.School}${codePart}</div>
          ${a.Address_Line_1 ? `<div class="sticker-line">${a.Address_Line_1}</div>` : ""}
          ${a.Address_Line_2 ? `<div class="sticker-line">${a.Address_Line_2}</div>` : ""}
          ${districtPin ? `<div class="sticker-line">${districtPin}</div>` : ""}
        </div>
      `;
    });

    sheet.innerHTML = [...blanks, ...labels].join("");
  },

  bindEvents() {
    document.querySelectorAll("[data-asub]").forEach(btn => {
      btn.addEventListener("click", () => this.switchSubView(btn.dataset.asub));
    });

    document.getElementById("addrSearchInput").addEventListener("input", () => this.renderDirectory());
    document.getElementById("btnClearAddrSearch").addEventListener("click", () => {
      document.getElementById("addrSearchInput").value = "";
      this.activeDistrict = "ALL";
      this.renderDistrictFilters();
      this.renderDirectory();
    });

    document.getElementById("view-address").addEventListener("click", (e) => {
      if (e.target.dataset.distFilter) {
        this.activeDistrict = e.target.dataset.distFilter;
        this.renderDistrictFilters();
        this.renderDirectory();
      }
      if (e.target.dataset.addQueue) this.addToQueue(e.target.dataset.addQueue);
      if (e.target.dataset.removeOne) this.removeOneFromQueueByCode(e.target.dataset.removeOne);
      if (e.target.dataset.viewLarge) this.openLargeReader(e.target.dataset.viewLarge);
      if (e.target.dataset.editAddr) this.openEditAddressModal(e.target.dataset.editAddr);

      if (e.target.dataset.bulkDesig !== undefined) {
        document.getElementById("bulkDesigInput").value = e.target.dataset.bulkDesig;
      }
      if (e.target.dataset.dupQid) {
        const item = this.dispatchQueue.find(q => q.queueId === e.target.dataset.dupQid);
        if (item) this.addToQueue(item.Code);
        this.renderQueue();
      }
      if (e.target.dataset.rmQid) {
        this.dispatchQueue = this.dispatchQueue.filter(q => q.queueId !== e.target.dataset.rmQid);
        this.updateQueueBadges();
        this.renderQueue();
        this.renderDirectory();
      }
    });

    document.getElementById("dispatchQueueList").addEventListener("change", (e) => {
      if (e.target.dataset.qcheck) {
        const item = this.dispatchQueue.find(q => q.queueId === e.target.dataset.qcheck);
        if (item) item.checked = e.target.checked;
        this.renderQueue();
        return;
      }
      const qid = e.target.dataset.qdesigSelect;
      if (qid) {
        const item = this.dispatchQueue.find(q => q.queueId === qid);
        if (item) item.Designation = e.target.value;
        this.renderQueue();
      }
    });

    document.getElementById("dispatchQueueList").addEventListener("input", (e) => {
      const qid = e.target.dataset.qdesigInput;
      if (qid) {
        const item = this.dispatchQueue.find(q => q.queueId === qid);
        if (item) {
          item.Designation = e.target.value;
          const sel = document.querySelector(`[data-qdesig-select="${qid}"]`);
          if (sel) sel.value = "";
        }
      }
    });

    document.getElementById("btnCheckAllQueue").addEventListener("click", () => {
      this.dispatchQueue.forEach(q => { q.checked = true; });
      this.renderQueue();
    });
    document.getElementById("btnUncheckAllQueue").addEventListener("click", () => {
      this.dispatchQueue.forEach(q => { q.checked = false; });
      this.renderQueue();
    });

    document.getElementById("btnApplyBulkDesig").addEventListener("click", () => {
      const checkedItems = this.dispatchQueue.filter(q => q.checked);
      if (!checkedItems.length) {
        showToast("Check at least 1 address in the Queue first.");
        return;
      }
      const val = document.getElementById("bulkDesigInput").value.trim();
      checkedItems.forEach(q => { q.Designation = val; });
      this.renderQueue();
      showToast(val ? `Applied "${val}" to ${checkedItems.length} checked item(s)` : `Cleared designation for ${checkedItems.length} item(s)`);
    });

    document.getElementById("btnClearQueue").addEventListener("click", () => {
      this.dispatchQueue = [];
      this.updateQueueBadges();
      this.renderQueue();
      this.renderDirectory();
    });

    document.getElementById("btnSaveNewAddrPerm").addEventListener("click", () => this.saveNewAddress(true));
    document.getElementById("btnSaveNewAddrTemp").addEventListener("click", () => this.saveNewAddress(false));

    document.getElementById("btnCloseEditAddrModal").addEventListener("click", () => {
      document.getElementById("editAddressModal").classList.add("hidden");
    });
    document.getElementById("btnUnlockAddrEdit").addEventListener("click", () => this.unlockAddressFields());
    document.getElementById("btnReviewAddrChanges").addEventListener("click", () => this.reviewAddressDiff());
    document.getElementById("btnCancelAddrDiff").addEventListener("click", () => {
      document.getElementById("addrDiffConfirmBox").classList.add("hidden");
      document.getElementById("editAddrFooterBtns").classList.remove("hidden");
    });
    document.getElementById("btnConfirmAddrUpdateFinal").addEventListener("click", () => this.commitAddressUpdate());

    // Large Reader Modal & "+ Add phone number" shortcut inside Large Reader
    document.getElementById("largeReaderBody").addEventListener("click", (e) => {
      if (e.target.dataset.largeAddPhone) {
        const code = e.target.dataset.largeAddPhone;
        document.getElementById("largeReaderModal").classList.add("hidden");
        this.openEditAddressModal(code);
        this.unlockAddressFields();
      }
    });

    document.getElementById("btnQuickLargeView").addEventListener("click", () => this.openLargeReader(null));
    document.getElementById("btnQueueLargeView").addEventListener("click", () => this.openLargeReader(null));
    document.getElementById("btnCloseLargeReader").addEventListener("click", () => {
      document.getElementById("largeReaderModal").classList.add("hidden");
    });
    document.getElementById("btnFontPlus").addEventListener("click", () => {
      this.largeFontSize = Math.min(38, this.largeFontSize + 3);
      this.renderLargeReaderSlide();
    });
    document.getElementById("btnFontMinus").addEventListener("click", () => {
      this.largeFontSize = Math.max(18, this.largeFontSize - 3);
      this.renderLargeReaderSlide();
    });
    document.getElementById("btnLargePrev").addEventListener("click", () => {
      if (this.largeReaderIdx > 0) {
        this.largeReaderIdx--;
        this.renderLargeReaderSlide();
      }
    });
    document.getElementById("btnLargeNext").addEventListener("click", () => {
      if (this.largeReaderIdx < this.largeReaderList.length - 1) {
        this.largeReaderIdx++;
        this.renderLargeReaderSlide();
      }
    });

    document.getElementById("btnQuickPrint").addEventListener("click", () => this.openPrintPreview());
    document.getElementById("btnQueuePrint").addEventListener("click", () => this.openPrintPreview());
    document.getElementById("btnClosePrintPreview").addEventListener("click", () => {
      document.getElementById("printPreviewModal").classList.add("hidden");
    });
    ["labelGridSelect", "labelStartSlot", "labelTagSelect", "chkShowCodeOnLabel"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => this.renderStickerSheet());
    });
    document.getElementById("btnTriggerBrowserPrint").addEventListener("click", () => window.print());
  }
};

document.addEventListener("DOMContentLoaded", () => AddressModule.init());
