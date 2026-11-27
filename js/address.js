const AddressModule = {
  selectedDistrict: "ALL",
  queue: [],
  checkedQueueKeys: new Set(),
  largeList: [],
  largeIdx: 0,
  largeFontSize: 24,
  editingAddrCode: null,
  pendingAddrUpdate: null,

  init() {
    try {
      const savedQ = JSON.parse(localStorage.getItem("tapal_addr_queue_v2") || "[]");
      this.queue = savedQ;
      savedQ.forEach(item => this.checkedQueueKeys.add(item._qKey));
    } catch (e) {}

    this.bindEvents();
    AppStore.onUpdate(() => {
      this.renderDistrictFilters();
      this.renderDirectory();
      this.renderQueue();
    });
  },

  saveQueueState() {
    localStorage.setItem("tapal_addr_queue_v2", JSON.stringify(this.queue));
    this.updateBadges();
  },

  updateBadges() {
    const count = this.queue.length;
    const navPill = document.getElementById("printCountBadge");
    if (navPill) {
      navPill.textContent = count;
      navPill.classList.toggle("hidden", count === 0);
    }
    const tabCount = document.getElementById("queueTabCount");
    if (tabCount) tabCount.textContent = count;
    const btnCount = document.getElementById("btnPrintCount");
    if (btnCount) btnCount.textContent = count;
    const chkCount = document.getElementById("checkedQueueCount");
    if (chkCount) chkCount.textContent = this.checkedQueueKeys.size;
  },

  switchSubView(subName) {
    document.querySelectorAll("[data-asub]").forEach(b => b.classList.toggle("active", b.dataset.asub === subName));
    document.querySelectorAll(".asub-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(`asub-${subName}`).classList.remove("hidden");
    if (subName === "search") this.renderDirectory();
    if (subName === "queue") this.renderQueue();
  },

  normalizePhonetic(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/zh/g, "l")
      .replace(/sh/g, "s")
      .replace(/ch/g, "c")
      .replace(/th/g, "t")
      .replace(/dh/g, "d")
      .replace(/bh/g, "b")
      .replace(/ph/g, "f")
      .replace(/v/g, "w")
      .replace(/z/g, "s")
      .replace(/k/g, "c")
      .replace(/q/g, "c")
      .replace(/ee/g, "i")
      .replace(/oo/g, "u")
      .replace(/([a-z0-9])\1+/g, "$1");
  },

  getFilteredAddresses() {
    const rawQuery = document.getElementById("addrSearchInput").value.trim().toLowerCase();
    const phoneticQuery = this.normalizePhonetic(rawQuery);
    const list = AppStore.addresses || [];

    return list.filter(a => {
      if (this.selectedDistrict !== "ALL" && String(a.District || "").trim() !== this.selectedDistrict) {
        return false;
      }
      if (!rawQuery) return true;

      const haystack = [
        a.Code, a.School, a.Address_Line_1, a.Address_Line_2,
        a.District, a.PIN, a.Principal_Name, a.Principal_Phone,
        a.Clerk_Name, a.Clerk_Phone
      ].filter(Boolean).join(" ").toLowerCase();

      if (haystack.includes(rawQuery)) return true;
      if (phoneticQuery.length >= 2 && this.normalizePhonetic(haystack).includes(phoneticQuery)) return true;
      return false;
    });
  },

  renderDistrictFilters() {
    const sel = document.getElementById("addrDistrictSelect");
    if (!sel) return;
    const districts = [...new Set((AppStore.addresses || []).map(a => String(a.District || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    sel.innerHTML = `<option value="ALL">District: All</option>` +
      districts.map(d => `<option value="${d}">${d}</option>`).join("");

    if (this.selectedDistrict !== "ALL" && districts.includes(this.selectedDistrict)) {
      sel.value = this.selectedDistrict;
    } else {
      this.selectedDistrict = "ALL";
      sel.value = "ALL";
    }
  },

  formatAddressLines(a) {
    return [a.School, a.Address_Line_1, a.Address_Line_2, a.District, a.PIN ? `PIN: ${a.PIN}` : ""].filter(Boolean);
  },

  renderDirectory() {
    const filtered = this.getFilteredAddresses();
    const limit = 100;
    const shown = filtered.slice(0, limit);

    document.getElementById("addrResultCountLabel").textContent =
      filtered.length > limit
        ? `Showing first ${limit} of ${filtered.length} matching records`
        : `${filtered.length} record(s) found`;

    const wrap = document.getElementById("addressDirectoryList");
    if (!shown.length) {
      wrap.innerHTML = `<div class="card muted small">No matching address found. Try another spelling or add a new contact.</div>`;
      return;
    }

    wrap.innerHTML = shown.map(a => {
      const queuedCount = this.queue.filter(q => String(q.Code) === String(a.Code)).length;
      const addrSummary = [a.Address_Line_1, a.Address_Line_2, a.District, a.PIN ? `PIN ${a.PIN}` : ""].filter(Boolean).join(", ");

      const prinRow = a.Principal_Phone
        ? `<div class="contact-line-row">
             <span><strong>Principal:</strong> ${a.Principal_Phone}${a.Principal_Name ? ` (${a.Principal_Name})` : ""}</span>
             <a href="tel:${a.Principal_Phone}" class="btn-call-pill">📞 Call</a>
           </div>`
        : `<div class="contact-line-row">
             <span class="muted"><strong>Principal:</strong> —</span>
             <button type="button" class="link-add-phone" data-edit-addr="${a.Code}">+ Add</button>
           </div>`;

      const clerkRow = a.Clerk_Phone
        ? `<div class="contact-line-row">
             <span><strong>Clerk:</strong> ${a.Clerk_Phone}${a.Clerk_Name ? ` (${a.Clerk_Name})` : ""}</span>
             <a href="tel:${a.Clerk_Phone}" class="btn-call-pill">📞 Call</a>
           </div>`
        : `<div class="contact-line-row">
             <span class="muted"><strong>Clerk:</strong> —</span>
             <button type="button" class="link-add-phone" data-edit-addr="${a.Code}">+ Add</button>
           </div>`;

      return `
        <div class="history-item">
          <div class="row-between">
            <div>
              ${a.Code ? `<span class="badge primary">${a.Code}</span>` : ""}
              <strong style="margin-left:4px;">${a.School}</strong>
            </div>
            <button type="button" class="btn-mini" data-edit-addr="${a.Code}" title="View or Edit Address & Phone Numbers">✎ Details</button>
          </div>

          <div class="small muted mt-6">${addrSummary || "No street line entered"}</div>

          <div class="contact-strip">
            ${prinRow}
            ${clerkRow}
          </div>

          <div class="row-between mt-8">
            <button type="button" class="btn-mini" data-large-single="${a.Code}">👁️ Enlarge</button>
            <button type="button" class="btn-mini ${queuedCount ? "active-filter" : "accent"}" data-queue-addr="${a.Code}">
              ${queuedCount ? `✓ In Queue (${queuedCount}) +` : "+ Add to Queue"}
            </button>
          </div>
        </div>`;
    }).join("");
  },

  addToQueue(addrObj, customDesig = "") {
    const qKey = "Q-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const entry = {
      ...addrObj,
      _qKey: qKey,
      Recipient_Designation: customDesig || ""
    };
    this.queue.push(entry);
    this.checkedQueueKeys.add(qKey);
    this.saveQueueState();
    this.renderDirectory();
    this.renderQueue();
  },

  renderQueue() {
    this.updateBadges();
    const desigs = AppStore.rankByFrequency(
      this.queue.map(q => q.Recipient_Designation),
      CONFIG.DEFAULT_DESIGNATIONS
    ).slice(0, 6);

    document.getElementById("bulkDesigPills").innerHTML = desigs.map(d =>
      `<button type="button" class="smart-chip" data-pick-desig="${d}">${d}</button>`
    ).join("");

    const wrap = document.getElementById("dispatchQueueList");
    if (!this.queue.length) {
      wrap.innerHTML = `<div class="card muted small">Print Queue is empty. Add contacts from the Directory or Add Contact tab.</div>`;
      return;
    }

    wrap.innerHTML = this.queue.map((item, idx) => {
      const checked = this.checkedQueueKeys.has(item._qKey);
      return `
        <div class="history-item ${checked ? "checked" : ""}">
          <div class="row-between">
            <label class="row-gap" style="margin:0; cursor:pointer; flex:1;">
              <input type="checkbox" data-qchk="${item._qKey}" ${checked ? "checked" : ""} style="width:18px; height:18px;" />
              <div>
                <strong>${idx + 1}. ${item.School}</strong>
                <div class="small muted">${item.District || ""} ${item.PIN ? "• PIN: " + item.PIN : ""}</div>
              </div>
            </label>
            <button type="button" class="btn-mini" data-rm-q="${item._qKey}" title="Remove from queue">×</button>
          </div>
          <div class="row-gap mt-8">
            <span class="small muted" style="min-width:34px;">To:</span>
            <input type="text" class="q-desig-input" data-qdesig="${item._qKey}" value="${item.Recipient_Designation || ""}" placeholder="No designation (prints School/Office name first)" />
          </div>
        </div>`;
    }).join("");
  },

  openEditAddressModal(code) {
    const addr = AppStore.addresses.find(a => String(a.Code) === String(code));
    if (!addr) return;
    this.editingAddrCode = code;

    document.getElementById("edCode").value = addr.Code || "";
    document.getElementById("edSchool").value = addr.School || "";
    document.getElementById("edLine1").value = addr.Address_Line_1 || "";
    document.getElementById("edLine2").value = addr.Address_Line_2 || "";
    document.getElementById("edDistrict").value = addr.District || "";
    document.getElementById("edPin").value = addr.PIN || "";
    document.getElementById("edPrinName").value = addr.Principal_Name || "";
    document.getElementById("edPrinPhone").value = addr.Principal_Phone || "";
    document.getElementById("edClerkName").value = addr.Clerk_Name || "";
    document.getElementById("edClerkPhone").value = addr.Clerk_Phone || "";

    this.setEditFieldsDisabled(true);
    document.getElementById("addrLockBanner").classList.remove("hidden");
    document.getElementById("editAddrFooterBtns").classList.add("hidden");
    document.getElementById("addrDiffConfirmBox").classList.add("hidden");
    document.getElementById("editAddressModal").classList.remove("hidden");
  },

  setEditFieldsDisabled(disabled) {
    ["edSchool", "edLine1", "edLine2", "edDistrict", "edPin", "edPrinName", "edPrinPhone", "edClerkName", "edClerkPhone"].forEach(id => {
      document.getElementById(id).disabled = disabled;
    });
  },

  reviewAddressChanges() {
    const orig = AppStore.addresses.find(a => String(a.Code) === String(this.editingAddrCode));
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

    const fieldLabels = {
      School: "Name",
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
    Object.keys(fieldLabels).forEach(k => {
      if (String(orig[k] || "") !== String(updated[k] || "")) {
        diffs.push(`<div><strong>${fieldLabels[k]}:</strong> "${orig[k] || "empty"}" → <strong>"${updated[k] || "empty"}"</strong></div>`);
      }
    });

    if (!diffs.length) {
      showToast("No changes were made.");
      return;
    }

    this.pendingAddrUpdate = updated;
    document.getElementById("addrDiffSummary").innerHTML = diffs.join("");
    document.getElementById("editAddrFooterBtns").classList.add("hidden");
    document.getElementById("addrDiffConfirmBox").classList.remove("hidden");
  },

  async confirmSaveAddressUpdate() {
    if (!this.pendingAddrUpdate) return;
    const idx = AppStore.addresses.findIndex(a => String(a.Code) === String(this.pendingAddrUpdate.Code));
    if (idx !== -1) AppStore.addresses[idx] = { ...this.pendingAddrUpdate };

    this.queue = this.queue.map(q =>
      String(q.Code) === String(this.pendingAddrUpdate.Code)
        ? { ...this.pendingAddrUpdate, _qKey: q._qKey, Recipient_Designation: q.Recipient_Designation }
        : q
    );
    this.saveQueueState();

    document.getElementById("editAddressModal").classList.add("hidden");
    await AppStore.pushAction("saveAddress", this.pendingAddrUpdate);
    this.pendingAddrUpdate = null;
    this.renderDistrictFilters();
    this.renderDirectory();
    this.renderQueue();
    showToast("Contact updated & synced ✓");
  },

  openLargeReader(items, startIndex = 0) {
    if (!items.length) {
      showToast("No addresses to display.");
      return;
    }
    this.largeList = items;
    this.largeIdx = startIndex;
    this.renderLargeReaderCard();
    document.getElementById("largeReaderModal").classList.remove("hidden");
  },

  renderLargeReaderCard() {
    const item = this.largeList[this.largeIdx];
    document.getElementById("largeReaderIndex").textContent = `${this.largeIdx + 1} of ${this.largeList.length}`;
    const body = document.getElementById("largeReaderBody");
    body.style.fontSize = `${this.largeFontSize}px`;

    const lines = [
      item.Recipient_Designation ? `To: ${item.Recipient_Designation}` : "",
      ...this.formatAddressLines(item)
    ].filter(Boolean);

    body.innerHTML = lines.map((l, i) =>
      `<div style="${i === 0 ? "font-weight:800; color:#0f4c81;" : ""}">${l}</div>`
    ).join("");
  },

  openPrintPreview(items) {
    if (!items.length) {
      showToast("Add at least 1 contact to print.");
      return;
    }
    this.largeList = items;
    document.getElementById("printPreviewModal").classList.remove("hidden");
    this.renderPrintSheet();
  },

  renderPrintSheet() {
    const sheet = document.getElementById("printableSheet");
    const gridClass = document.getElementById("labelGridSelect").value;
    const startSlot = Math.max(1, parseInt(document.getElementById("labelStartSlot").value || "1", 10));
    const topTag = document.getElementById("labelTagSelect").value;
    const showCode = document.getElementById("chkShowCodeOnLabel").checked;

    sheet.className = `a4-sheet ${gridClass}`;
    const slots = [];

    for (let s = 1; s < startSlot; s++) {
      slots.push(`<div class="sticker-cell empty"></div>`);
    }

    this.largeList.forEach(item => {
      const lines = this.formatAddressLines(item);
      slots.push(`
        <div class="sticker-cell">
          ${topTag ? `<div class="sticker-tag">${topTag}</div>` : ""}
          ${showCode && item.Code ? `<div class="sticker-code">Code: ${item.Code}</div>` : ""}
          ${item.Recipient_Designation ? `<div class="sticker-desig">To: ${item.Recipient_Designation}</div>` : ""}
          <div class="sticker-body">
            ${lines.map((l, idx) => `<div class="${idx === 0 ? "sticker-school" : ""}">${l}</div>`).join("")}
          </div>
        </div>
      `);
    });

    sheet.innerHTML = slots.join("");
    document.getElementById("printSummaryLabel").textContent = `${this.largeList.length} label(s) • Starting at slot #${startSlot}`;
  },

  bindEvents() {
    document.querySelectorAll("[data-asub]").forEach(btn => {
      btn.addEventListener("click", () => this.switchSubView(btn.dataset.asub));
    });

    document.getElementById("addrSearchInput").addEventListener("input", () => this.renderDirectory());
    document.getElementById("addrDistrictSelect").addEventListener("change", (e) => {
      this.selectedDistrict = e.target.value;
      this.renderDirectory();
    });
    document.getElementById("btnClearAddrSearch").addEventListener("click", () => {
      document.getElementById("addrSearchInput").value = "";
      this.selectedDistrict = "ALL";
      document.getElementById("addrDistrictSelect").value = "ALL";
      this.renderDirectory();
    });

    document.getElementById("view-address").addEventListener("click", (e) => {
      if (e.target.dataset.queueAddr) {
        const found = AppStore.addresses.find(a => String(a.Code) === String(e.target.dataset.queueAddr));
        if (found) {
          this.addToQueue(found);
          showToast(`Added ${found.School} to Print Queue`);
        }
      }
      if (e.target.dataset.largeSingle) {
        const found = AppStore.addresses.find(a => String(a.Code) === String(e.target.dataset.largeSingle));
        if (found) this.openLargeReader([found], 0);
      }
      if (e.target.dataset.editAddr) {
        this.openEditAddressModal(e.target.dataset.editAddr);
      }
      if (e.target.dataset.rmQ) {
        this.queue = this.queue.filter(q => q._qKey !== e.target.dataset.rmQ);
        this.checkedQueueKeys.delete(e.target.dataset.rmQ);
        this.saveQueueState();
        this.renderDirectory();
        this.renderQueue();
      }
      if (e.target.dataset.pickDesig) {
        document.getElementById("bulkDesigInput").value = e.target.dataset.pickDesig;
      }
    });

    document.getElementById("dispatchQueueList").addEventListener("change", (e) => {
      if (e.target.dataset.qchk) {
        if (e.target.checked) this.checkedQueueKeys.add(e.target.dataset.qchk);
        else this.checkedQueueKeys.delete(e.target.dataset.qchk);
        this.renderQueue();
      }
    });
    document.getElementById("dispatchQueueList").addEventListener("input", (e) => {
      if (e.target.dataset.qdesig) {
        const item = this.queue.find(q => q._qKey === e.target.dataset.qdesig);
        if (item) {
          item.Recipient_Designation = e.target.value;
          this.saveQueueState();
        }
      }
    });

    document.getElementById("btnCheckAllQueue").addEventListener("click", () => {
      this.queue.forEach(q => this.checkedQueueKeys.add(q._qKey));
      this.renderQueue();
    });
    document.getElementById("btnUncheckAllQueue").addEventListener("click", () => {
      this.checkedQueueKeys.clear();
      this.renderQueue();
    });
    document.getElementById("btnApplyBulkDesig").addEventListener("click", () => {
      const val = document.getElementById("bulkDesigInput").value.trim();
      if (!this.checkedQueueKeys.size) {
        showToast("Check at least 1 item in the queue.");
        return;
      }
      this.queue.forEach(q => {
        if (this.checkedQueueKeys.has(q._qKey)) q.Recipient_Designation = val;
      });
      this.saveQueueState();
      this.renderQueue();
      showToast(val ? `Assigned "${val}" to ${this.checkedQueueKeys.size} item(s)` : "Cleared designation on selected items");
    });

    document.getElementById("btnClearQueue").addEventListener("click", () => {
      this.queue = [];
      this.checkedQueueKeys.clear();
      this.saveQueueState();
      this.renderDirectory();
      this.renderQueue();
      showToast("Print Queue cleared");
    });

    const getPrintItems = () => this.queue.length ? this.queue : this.getFilteredAddresses().slice(0, 30);
    document.getElementById("btnQuickLargeView").addEventListener("click", () => this.openLargeReader(getPrintItems(), 0));
    document.getElementById("btnQueueLargeView").addEventListener("click", () => this.openLargeReader(this.queue, 0));
    document.getElementById("btnQuickPrint").addEventListener("click", () => this.openPrintPreview(getPrintItems()));
    document.getElementById("btnQueuePrint").addEventListener("click", () => this.openPrintPreview(this.queue));

    const saveNewContact = async (permanent) => {
      const school = document.getElementById("newAddrSchool").value.trim();
      if (!school) {
        showToast("Enter Name / Office / Institution.");
        return;
      }
      const code = document.getElementById("newAddrCode").value.trim() || ("CUSTOM-" + Date.now().toString().slice(-5));
      const newObj = {
        District_Sl: "",
        Code: code,
        School: school,
        Address_Line_1: document.getElementById("newAddrLine1").value.trim(),
        Address_Line_2: document.getElementById("newAddrLine2").value.trim(),
        District: document.getElementById("newAddrDistrict").value.trim(),
        PIN: document.getElementById("newAddrPin").value.trim(),
        Designation: "",
        Principal_Name: document.getElementById("newAddrPrinName").value.trim(),
        Principal_Phone: document.getElementById("newAddrPrinPhone").value.trim(),
        Clerk_Name: document.getElementById("newAddrClerkName").value.trim(),
        Clerk_Phone: document.getElementById("newAddrClerkPhone").value.trim()
      };

      if (permanent) {
        AppStore.addresses.unshift(newObj);
        await AppStore.pushAction("saveAddress", newObj);
      }

      this.addToQueue(newObj);
      ["newAddrCode", "newAddrSchool", "newAddrLine1", "newAddrLine2", "newAddrDistrict", "newAddrPin", "newAddrPrinName", "newAddrPrinPhone", "newAddrClerkName", "newAddrClerkPhone"].forEach(id => {
        document.getElementById(id).value = "";
      });
      this.renderDistrictFilters();
      this.switchSubView("queue");
      showToast(permanent ? "Saved & added to Print Queue ✓" : "Added to today's Print Queue");
    };

    document.getElementById("btnSaveNewAddrPerm").addEventListener("click", () => saveNewContact(true));
    document.getElementById("btnSaveNewAddrTemp").addEventListener("click", () => saveNewContact(false));

    document.getElementById("btnCloseEditAddrModal").addEventListener("click", () => document.getElementById("editAddressModal").classList.add("hidden"));
    document.getElementById("btnUnlockAddrEdit").addEventListener("click", () => {
      this.setEditFieldsDisabled(false);
      document.getElementById("addrLockBanner").classList.add("hidden");
      document.getElementById("editAddrFooterBtns").classList.remove("hidden");
    });
    document.getElementById("btnReviewAddrChanges").addEventListener("click", () => this.reviewAddressChanges());
    document.getElementById("btnCancelAddrDiff").addEventListener("click", () => {
      document.getElementById("addrDiffConfirmBox").classList.add("hidden");
      document.getElementById("editAddrFooterBtns").classList.remove("hidden");
    });
    document.getElementById("btnConfirmAddrUpdateFinal").addEventListener("click", () => this.confirmSaveAddressUpdate());

    document.getElementById("btnCloseLargeReader").addEventListener("click", () => document.getElementById("largeReaderModal").classList.add("hidden"));
    document.getElementById("btnFontPlus").addEventListener("click", () => {
      this.largeFontSize = Math.min(44, this.largeFontSize + 4);
      this.renderLargeReaderCard();
    });
    document.getElementById("btnFontMinus").addEventListener("click", () => {
      this.largeFontSize = Math.max(16, this.largeFontSize - 4);
      this.renderLargeReaderCard();
    });
    document.getElementById("btnLargePrev").addEventListener("click", () => {
      this.largeIdx = (this.largeIdx - 1 + this.largeList.length) % this.largeList.length;
      this.renderLargeReaderCard();
    });
    document.getElementById("btnLargeNext").addEventListener("click", () => {
      this.largeIdx = (this.largeIdx + 1) % this.largeList.length;
      this.renderLargeReaderCard();
    });

    ["labelGridSelect", "labelStartSlot", "labelTagSelect", "chkShowCodeOnLabel"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => this.renderPrintSheet());
    });
    document.getElementById("btnTriggerBrowserPrint").addEventListener("click", () => window.print());
    document.getElementById("btnClosePrintPreview").addEventListener("click", () => document.getElementById("printPreviewModal").classList.add("hidden"));
  }
};

document.addEventListener("DOMContentLoaded", () => AddressModule.init());
