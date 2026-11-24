// India Post Official S10 Barcode Format: E/B (Speed/Business) or R/C/V (Registered/Parcel/VPP) + 1 letter + 9 digits + IN
const POSTAL_BARCODE_REGEX = /^[ERCVB][A-Z]\d{9}IN$/;

const PostageModule = {
  currentBatch: null,
  speedBarcodes: [],
  regBarcodes: [],
  editingBarcode: null,
  scanner: null,
  scannerMode: null,
  lastScanCode: "",
  lastScanTime: 0,
  activeStage: 1,
  activeSubView: "entry",
  activeKeyword: null,
  historyFilter: "ALL",

  init() {
    this.bindEvents();
    this.startNewBatch(false);
    AppStore.onUpdate(() => this.refreshLearnedUI());
  },

  switchSubView(subName) {
    this.activeSubView = subName;
    if (this.scannerMode) this.stopScanner();

    document.querySelectorAll(".sub-nav-btn").forEach(b => b.classList.toggle("active", b.dataset.psub === subName));
    document.querySelectorAll(".psub-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(`psub-${subName}`).classList.remove("hidden");

    if (subName === "search") this.runSearchAndFilter();
    if (subName === "history") this.renderHistory();
  },

  startNewBatch(notify = true) {
    const rankedCounters = AppStore.rankByFrequency(
      AppStore.batches.map(b => b.Counter_Number),
      CONFIG.DEFAULT_COUNTERS
    );

    const nowISO = DateTimeHelper.nowLocalISO();
    const nextSom = AppStore.getNextSomSuggestion();

    this.currentBatch = {
      Batch_ID: "BATCH-" + Date.now(),
      Received_DateTime: nowISO,
      Delivered_DateTime: "",
      Counter_Number: rankedCounters[0] || "",
      Speed_Posts: 0,
      Registered_Parcels: 0,
      Ordinary_Posts: 0,
      Total_Posts: 0,
      SOM_Number: nextSom,
      SOM_Received: "",
      Receipt_Received: "",
      Given_To_Tapal: "",
      Given_DateTime: "",
      Received_By_Name: "",
      Comments: "",
      Speed_Barcodes: "",
      Registered_Barcodes: ""
    };
    this.speedBarcodes = [];
    this.regBarcodes = [];
    this.populateForm(this.currentBatch);
    this.collapseAllStages(false);
    this.refreshLearnedUI();

    const lastCode = this.getLastEnteredBarcode();
    if (lastCode) this.preFillBarcodeTemplate(lastCode, false);

    if (notify) showToast(`New Entry • SOM #${nextSom}`);
  },

  loadBatch(batchId) {
    const found = AppStore.batches.find(b => b.Batch_ID === batchId);
    if (!found) return;
    this.currentBatch = { ...found };
    this.speedBarcodes = found.Speed_Barcodes ? String(found.Speed_Barcodes).split(",").map(s => s.trim().toUpperCase()).filter(Boolean) : [];
    this.regBarcodes = found.Registered_Barcodes ? String(found.Registered_Barcodes).split(",").map(s => s.trim().toUpperCase()).filter(Boolean) : [];

    this.switchSubView("entry");
    this.populateForm(this.currentBatch);

    const s1Done = Boolean(found.Received_DateTime && found.SOM_Number && Number(found.Total_Posts) > 0);
    const s2Done = Boolean(found.Counter_Number && found.SOM_Received && found.Receipt_Received && found.Delivered_DateTime);

    if (!s1Done) this.openOnlyStage(1);
    else if (!s2Done) this.openOnlyStage(2);
    else this.openOnlyStage(3);

    this.refreshLearnedUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`Loaded SOM #${found.SOM_Number || "Draft"}`);
  },

  openOnlyStage(stageNum) {
    this.activeStage = stageNum;

    if (stageNum === 2) {
      const d2 = document.getElementById("pDeliveredDT");
      if (!d2.value) {
        d2.value = DateTimeHelper.nowLocalISO();
        d2.max = d2.value;
      }
    }
    if (stageNum === 3) {
      const d3 = document.getElementById("pGivenDT");
      if (!d3.value) {
        d3.value = DateTimeHelper.nowLocalISO();
        d3.max = d3.value;
      }
    }

    [1, 2, 3].forEach(n => {
      const body = document.getElementById(`pBody${n}`);
      const chev = document.getElementById(`pChev${n}`);
      const isOpen = n === stageNum;
      body.classList.toggle("collapsed", !isOpen);
      chev.textContent = isOpen ? "▼" : "▶";
    });

    document.getElementById("postageStageBadge").textContent = stageNum === 0 ? "Completed ✓" : `Stage ${stageNum}`;
  },

  collapseAllStages(isCompleted = true) {
    this.activeStage = 0;
    [1, 2, 3].forEach(n => {
      document.getElementById(`pBody${n}`).classList.add("collapsed");
      document.getElementById(`pChev${n}`).textContent = "▶";
    });
    document.getElementById("postageStageBadge").textContent = isCompleted ? "Completed ✓" : "Ready";
  },

  syncSomBannerTitle() {
    const val = document.getElementById("pSomNumber").value.trim();
    if (this.currentBatch) this.currentBatch.SOM_Number = val;
    document.getElementById("postageBannerTitle").textContent = val ? `SOM #${val}` : "New SOM";
  },

  populateForm(b) {
    document.getElementById("pReceivedDT").value = b.Received_DateTime || "";
    document.getElementById("pSomNumber").value = b.SOM_Number || "";
    this.syncSomBannerTitle();

    document.getElementById("pSpeedPosts").value = b.Speed_Posts || 0;
    document.getElementById("pRegParcels").value = b.Registered_Parcels || 0;
    document.getElementById("pOrdPosts").value = b.Ordinary_Posts || 0;
    this.recalcTotal();

    document.getElementById("pCounterNumber").value = b.Counter_Number || "";
    this.setToggle("pSomRecGroup", b.SOM_Received);
    this.setToggle("pRecRecGroup", b.Receipt_Received);
    document.getElementById("pDeliveredDT").value = b.Delivered_DateTime || "";

    this.setToggle("pTapalGroup", b.Given_To_Tapal);
    document.getElementById("pGivenDT").value = b.Given_DateTime || "";
    document.getElementById("pReceivedBy").value = b.Received_By_Name || "";

    const raw = String(b.Comments || "");
    const somMatch = raw.match(/\[SOM No:\s*([^\]]+)\]/);
    const recMatch = raw.match(/\[Receipt No:\s*([^\]]+)\]/);
    const tapalNoMatch = raw.match(/\[Tapal No:\s*([^\]]+)\]/);
    const poMatch = raw.match(/\[PO:\s*([^\]]+)\]/);
    const tapalMatch = raw.match(/\[Tapal:\s*([^\]]+)\]/);

    document.getElementById("pSomNoReason").value = somMatch ? somMatch[1] : "";
    document.getElementById("pRecNoReason").value = recMatch ? recMatch[1] : "";
    document.getElementById("pTapalNoReason").value = tapalNoMatch ? tapalNoMatch[1] : "";
    document.getElementById("pPoComments").value = poMatch ? poMatch[1] : "";

    const fallbackClean = raw
      .replace(/\[(SOM No|Receipt No|Tapal No|PO|Tapal):[^\]]+\]\s*\|?\s*/g, "")
      .trim();
    document.getElementById("pComments").value = tapalMatch ? tapalMatch[1] : fallbackClean;

    this.toggleNoBoxes();
    this.renderBarcodeChips();
    this.updateStageSummaries();
  },

  refreshLearnedUI() {
    const counters = AppStore.rankByFrequency(
      AppStore.batches.map(b => b.Counter_Number),
      CONFIG.DEFAULT_COUNTERS
    );
    const activeCounter = document.getElementById("pCounterNumber").value;
    document.getElementById("pCounterPills").innerHTML = counters.map(c =>
      `<button type="button" class="pill-btn ${String(c) === String(activeCounter) ? "selected" : ""}" data-pcounter="${c}">${c}</button>`
    ).join("");

    const names = AppStore.rankByFrequency(AppStore.batches.map(b => b.Received_By_Name)).slice(0, 6);
    document.getElementById("pNameChips").innerHTML = names.map((n, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-fill="pReceivedBy" data-val="${n}">${n}</button>`
    ).join("");

    const poComments = [];
    const tapalComments = [];
    AppStore.batches.forEach(b => {
      const c = String(b.Comments || "");
      const pm = c.match(/\[PO:\s*([^\]]+)\]/);
      const tm = c.match(/\[Tapal:\s*([^\]]+)\]/);
      if (pm) poComments.push(pm[1]);
      if (tm) tapalComments.push(tm[1]);
    });

    document.getElementById("pPoCommentChips").innerHTML = AppStore.rankByFrequency(poComments).slice(0, 4).map(txt =>
      `<button type="button" class="smart-chip" data-fill="pPoComments" data-val="${txt}">${txt}</button>`
    ).join("");

    document.getElementById("pCommentChips").innerHTML = AppStore.rankByFrequency(tapalComments).slice(0, 4).map(txt =>
      `<button type="button" class="smart-chip" data-fill="pComments" data-val="${txt}">${txt}</button>`
    ).join("");

    this.renderChipList("pSomNoChips", "pSomNoReason", CONFIG.DEFAULT_SOM_NO_REASONS);
    this.renderChipList("pRecNoChips", "pRecNoReason", CONFIG.DEFAULT_REC_NO_REASONS);
    this.renderChipList("pTapalNoChips", "pTapalNoReason", CONFIG.DEFAULT_TAPAL_NO_REASONS);

    this.renderPendingBar();
    if (this.activeSubView === "history") this.renderHistory();
    if (this.activeSubView === "search") this.runSearchAndFilter();
  },

  renderChipList(wrapId, inputId, list) {
    document.getElementById(wrapId).innerHTML = list.map(r =>
      `<button type="button" class="smart-chip" data-fill="${inputId}" data-val="${r}">${r}</button>`
    ).join("");
  },

  readFormAndValidate(stageToValidate) {
    const b = this.currentBatch;
    b.Received_DateTime = document.getElementById("pReceivedDT").value;
    b.SOM_Number = document.getElementById("pSomNumber").value.trim();

    if (b.SOM_Number) {
      const duplicateSom = AppStore.batches.find(
        existing =>
          existing.Batch_ID !== b.Batch_ID &&
          String(existing.SOM_Number || "").trim().toUpperCase() === b.SOM_Number.toUpperCase()
      );
      if (duplicateSom) {
        showToast(`SOM #${b.SOM_Number} already exists! Change SOM Number.`);
        this.openOnlyStage(1);
        document.getElementById("pSomNumber").focus();
        return null;
      }
    }

    b.Speed_Posts = parseInt(document.getElementById("pSpeedPosts").value || "0", 10);
    b.Registered_Parcels = parseInt(document.getElementById("pRegParcels").value || "0", 10);
    b.Ordinary_Posts = parseInt(document.getElementById("pOrdPosts").value || "0", 10);
    b.Total_Posts = b.Speed_Posts + b.Registered_Parcels + b.Ordinary_Posts;

    b.Counter_Number = document.getElementById("pCounterNumber").value.trim();
    b.SOM_Received = this.getToggle("pSomRecGroup");
    b.Receipt_Received = this.getToggle("pRecRecGroup");
    b.Delivered_DateTime = document.getElementById("pDeliveredDT").value;

    b.Given_To_Tapal = this.getToggle("pTapalGroup");
    b.Given_DateTime = document.getElementById("pGivenDT").value;
    b.Received_By_Name = document.getElementById("pReceivedBy").value.trim();

    const somReason = document.getElementById("pSomNoReason").value.trim();
    const recReason = document.getElementById("pRecNoReason").value.trim();
    const tapalReason = document.getElementById("pTapalNoReason").value.trim();

    if (stageToValidate === 2 || stageToValidate === 0) {
      if (b.SOM_Received === "No" && !somReason) {
        showToast("Enter reason why SOM was not received");
        document.getElementById("pSomNoReason").focus();
        return null;
      }
      if (b.Receipt_Received === "No" && !recReason) {
        showToast("Enter reason why Receipt was not received");
        document.getElementById("pRecNoReason").focus();
        return null;
      }
    }
    if ((stageToValidate === 3 || stageToValidate === 0) && b.Given_To_Tapal === "No" && !tapalReason) {
      showToast("Enter reason why not given to Tapal");
      document.getElementById("pTapalNoReason").focus();
      return null;
    }

    const poNote = document.getElementById("pPoComments").value.trim();
    const tapalNote = document.getElementById("pComments").value.trim();

    const parts = [];
    if (b.SOM_Received === "No" && somReason) parts.push(`[SOM No: ${somReason}]`);
    if (b.Receipt_Received === "No" && recReason) parts.push(`[Receipt No: ${recReason}]`);
    if (poNote) parts.push(`[PO: ${poNote}]`);
    if (b.Given_To_Tapal === "No" && tapalReason) parts.push(`[Tapal No: ${tapalReason}]`);
    if (tapalNote) parts.push(`[Tapal: ${tapalNote}]`);

    b.Comments = parts.join(" | ");
    b.Speed_Barcodes = this.speedBarcodes.join(", ");
    b.Registered_Barcodes = this.regBarcodes.join(", ");
    return b;
  },

  updateStageSummaries() {
    const b = this.currentBatch;
    const s1Done = Boolean(b.Received_DateTime && b.SOM_Number && Number(b.Total_Posts) > 0);
    const s2Done = Boolean(b.Counter_Number && b.SOM_Received && b.Receipt_Received && b.Delivered_DateTime);
    const s3Done = Boolean(b.Given_To_Tapal && b.Given_DateTime && (b.Given_To_Tapal === "No" || b.Received_By_Name));

    document.getElementById("pSummary1").textContent = s1Done
      ? `SOM #${b.SOM_Number} • ${b.Total_Posts} Posts (S:${b.Speed_Posts} R:${b.Registered_Parcels} O:${b.Ordinary_Posts})`
      : "Stage 1";
    document.getElementById("pCard1").classList.toggle("completed", s1Done);

    document.getElementById("pSummary2").textContent = s2Done
      ? `Counter ${b.Counter_Number} • SOM:${b.SOM_Received} • Rec:${b.Receipt_Received}`
      : "Stage 2";
    document.getElementById("pCard2").classList.toggle("completed", s2Done);

    document.getElementById("pSummary3").textContent = s3Done
      ? `Tapal: ${b.Given_To_Tapal}${b.Received_By_Name ? " (" + b.Received_By_Name + ")" : ""}`
      : "Stage 3";
    document.getElementById("pCard3").classList.toggle("completed", s3Done);

    this.syncSomBannerTitle();
  },

  toggleNoBoxes() {
    document.getElementById("pSomNoBox").classList.toggle("hidden", this.getToggle("pSomRecGroup") !== "No");
    document.getElementById("pRecNoBox").classList.toggle("hidden", this.getToggle("pRecRecGroup") !== "No");
    document.getElementById("pTapalNoBox").classList.toggle("hidden", this.getToggle("pTapalGroup") !== "No");
  },

  // =========================================================
  // BARCODE VALIDATION, CAMERA SCANNER & EDIT/REPLACE MODAL
  // =========================================================
  validatePostalBarcode(rawCode, selectedType = "AUTO") {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!POSTAL_BARCODE_REGEX.test(code)) {
      return {
        valid: false,
        reason: "Invalid format. Must be 13 chars: E/R/C/V/B + Letter + 9 digits + IN (e.g. CL502656420IN)"
      };
    }

    const detectedType = (code.startsWith("E") || code.startsWith("B")) ? "SPEED" : "REG";
    if (selectedType !== "AUTO" && selectedType !== detectedType) {
      const expectedLabel = detectedType === "SPEED"
        ? "Speed Post (starts with E or B)"
        : "Registered Parcel (starts with R, C, or V)";
      return {
        valid: false,
        reason: `Prefix mismatch: ${code} is a ${expectedLabel}`
      };
    }

    return { valid: true, code, type: detectedType };
  },

  async startScanner(mode) {
    if (this.scannerMode === mode) {
      await this.stopScanner();
      return;
    }
    if (this.scannerMode) {
      await this.stopScanner();
    }

    this.scannerMode = mode;
    const targetId = mode === "SEARCH" ? "searchQrBox" : "qrReaderBox";
    const box = document.getElementById(targetId);
    box.classList.remove("hidden");

    if (mode === "BATCH") {
      document.getElementById("scanBtnText").textContent = "Stop";
      document.getElementById("btnToggleBatchScanner").classList.add("btn-danger");
    } else {
      document.getElementById("btnScanSearch").classList.add("btn-danger");
    }

    const handleDetected = (rawText) => {
      const clean = String(rawText || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!clean) return;

      const now = Date.now();
      if (clean === this.lastScanCode && now - this.lastScanTime < 2200) return;
      this.lastScanCode = clean;
      this.lastScanTime = now;

      if (navigator.vibrate) navigator.vibrate(80);

      if (this.scannerMode === "SEARCH") {
        this.stopScanner();
        document.getElementById("postageSearchInput").value = clean;
        this.runSearchAndFilter();
      } else {
        document.getElementById("manualBarcodeText").value = clean;
        const added = this.addBarcode(clean, "AUTO");
        if (added) {
          this.preFillBarcodeTemplate(clean, false);
        }
      }
    };

    const supportedFormats = typeof Html5QrcodeSupportedFormats !== "undefined" ? [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.CODABAR
    ] : undefined;

    this.scanner = new Html5Qrcode(
      targetId,
      {
        formatsToSupport: supportedFormats,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false
      }
    );

    try {
      await this.scanner.start(
        { facingMode: "environment" },
        {
          fps: 20,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: "continuous"
          }
        },
        handleDetected,
        () => {}
      );
    } catch (e) {
      try {
        await this.scanner.start(
          { facingMode: "environment" },
          { fps: 15 },
          handleDetected,
          () => {}
        );
      } catch (err2) {
        showToast("Camera permission denied or unavailable");
        await this.stopScanner();
      }
    }
  },

  async stopScanner() {
    if (this.scanner) {
      try {
        if (this.scanner.isScanning) await this.scanner.stop();
        await this.scanner.clear();
      } catch (e) {}
      this.scanner = null;
    }
    document.getElementById("qrReaderBox").innerHTML = "";
    document.getElementById("searchQrBox").innerHTML = "";
    document.getElementById("qrReaderBox").classList.add("hidden");
    document.getElementById("searchQrBox").classList.add("hidden");
    document.getElementById("scanBtnText").textContent = "Scan";
    document.getElementById("btnToggleBatchScanner").classList.remove("btn-danger");
    document.getElementById("btnScanSearch").classList.remove("btn-danger");
    this.scannerMode = null;
  },

  addBarcode(rawCode, selectedType) {
    const check = this.validatePostalBarcode(rawCode, selectedType);
    if (!check.valid) {
      showToast(check.reason);
      return false;
    }

    if (this.speedBarcodes.includes(check.code) || this.regBarcodes.includes(check.code)) {
      showToast(`Duplicate barcode on this SOM: ${check.code}`);
      return false;
    }

    if (check.type === "SPEED") {
      this.speedBarcodes.push(check.code);
      this.stepCount("pSpeedPosts", 1);
      showToast(`Added Speed Post: ${check.code}`);
    } else {
      this.regBarcodes.push(check.code);
      this.stepCount("pRegParcels", 1);
      showToast(`Added Registered Parcel: ${check.code}`);
    }

    this.renderBarcodeChips();
    return true;
  },

  getLastEnteredBarcode() {
    if (this.speedBarcodes.length) return this.speedBarcodes[this.speedBarcodes.length - 1];
    if (this.regBarcodes.length) return this.regBarcodes[this.regBarcodes.length - 1];
    for (const b of AppStore.batches) {
      const s = String(b.Speed_Barcodes || "").split(",").map(x => x.trim()).filter(Boolean);
      if (s.length) return s[s.length - 1];
      const r = String(b.Registered_Barcodes || "").split(",").map(x => x.trim()).filter(Boolean);
      if (r.length) return r[r.length - 1];
    }
    return "";
  },

  preFillBarcodeTemplate(code, shouldFocus = true) {
    const inp = document.getElementById("manualBarcodeText");
    if (!inp || !code) return;
    const clean = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    inp.value = clean;
    if (shouldFocus) {
      inp.focus();
      if (clean.length === 13 && clean.endsWith("IN")) {
        inp.setSelectionRange(8, 11);
      } else {
        inp.setSelectionRange(clean.length, clean.length);
      }
    }
  },

  renderBarcodeChips() {
    document.getElementById("scannedBarcodeList").innerHTML = [
      ...this.speedBarcodes.map((c, i) =>
        `<span class="b-chip speed" data-edit-btype="SPEED" data-edit-bidx="${i}" title="Tap to edit, replace, or delete">${c} ✎</span>`
      ),
      ...this.regBarcodes.map((c, i) =>
        `<span class="b-chip reg" data-edit-btype="REG" data-edit-bidx="${i}" title="Tap to edit, replace, or delete">${c} ✎</span>`
      )
    ].join("");
  },

  openBarcodeEditModal(type, index) {
    const oldCode = type === "SPEED" ? this.speedBarcodes[index] : this.regBarcodes[index];
    if (!oldCode) return;
    this.editingBarcode = { type, index, code: oldCode };
    document.getElementById("editBarcodeInput").value = oldCode;
    document.getElementById("editBarcodeModal").classList.remove("hidden");
    document.getElementById("editBarcodeInput").focus();
  },

  replaceEditedBarcode() {
    if (!this.editingBarcode) return;
    const newRaw = document.getElementById("editBarcodeInput").value;
    const check = this.validatePostalBarcode(newRaw, "AUTO");
    if (!check.valid) {
      showToast(check.reason);
      return;
    }

    const { type, index, code: oldCode } = this.editingBarcode;
    if (check.code !== oldCode && (this.speedBarcodes.includes(check.code) || this.regBarcodes.includes(check.code))) {
      showToast(`Duplicate barcode on this SOM: ${check.code}`);
      return;
    }

    if (type === "SPEED") {
      this.speedBarcodes.splice(index, 1);
      this.stepCount("pSpeedPosts", -1);
    } else {
      this.regBarcodes.splice(index, 1);
      this.stepCount("pRegParcels", -1);
    }

    if (check.type === "SPEED") {
      this.speedBarcodes.push(check.code);
      this.stepCount("pSpeedPosts", 1);
    } else {
      this.regBarcodes.push(check.code);
      this.stepCount("pRegParcels", 1);
    }

    this.renderBarcodeChips();
    document.getElementById("editBarcodeModal").classList.add("hidden");
    this.editingBarcode = null;
    showToast(`Replaced with ${check.code}`);
  },

  deleteEditedBarcode() {
    if (!this.editingBarcode) return;
    const { type, index, code } = this.editingBarcode;
    if (type === "SPEED") {
      this.speedBarcodes.splice(index, 1);
      this.stepCount("pSpeedPosts", -1);
    } else {
      this.regBarcodes.splice(index, 1);
      this.stepCount("pRegParcels", -1);
    }
    this.renderBarcodeChips();
    document.getElementById("editBarcodeModal").classList.add("hidden");
    this.editingBarcode = null;
    showToast(`Deleted ${code}`);
  },

  // =========================================================
  // SEARCH VIEW (ONLY SHOWS RESULTS WHEN QUERY OR FILTER SET)
  // =========================================================
  runSearchAndFilter() {
    const query = document.getElementById("postageSearchInput").value.trim().toUpperCase();
    const kw = this.activeKeyword;
    const container = document.getElementById("postageSearchResults");

    if (!query && !kw) {
      container.innerHTML = "";
      return;
    }

    let results = [...AppStore.batches];

    if (kw === "PENDING_PO") results = results.filter(b => !b.Receipt_Received && !b.Delivered_DateTime);
    if (kw === "PENDING_TAPAL") results = results.filter(b => !b.Given_To_Tapal);
    if (kw === "COMPLETED") results = results.filter(b => Boolean(b.Given_To_Tapal));
    if (kw === "NO_ISSUE") results = results.filter(b => b.SOM_Received === "No" || b.Receipt_Received === "No" || b.Given_To_Tapal === "No");
    if (kw === "SPEED") results = results.filter(b => Number(b.Speed_Posts) > 0);
    if (kw === "REG") results = results.filter(b => Number(b.Registered_Parcels) > 0);

    if (query) {
      results = results.filter(b =>
        String(b.SOM_Number).toUpperCase().includes(query) ||
        String(b.Speed_Barcodes).toUpperCase().includes(query) ||
        String(b.Registered_Barcodes).toUpperCase().includes(query) ||
        String(b.Received_By_Name).toUpperCase().includes(query) ||
        String(b.Comments).toUpperCase().includes(query)
      );
    }

    if (!results.length) {
      container.innerHTML = `<div class="card muted small">No matching records found.</div>`;
      return;
    }

    container.innerHTML = results.slice(0, 20).map(b => this.renderBatchCardHTML(b, query)).join("");
  },

  track(code) {
    navigator.clipboard?.writeText(code);
    showToast(`Copied ${code}`);
    window.open("https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx", "_blank");
  },

  renderPendingBar() {
    const pending = AppStore.batches.filter(b => !b.Given_To_Tapal).slice(0, 8);
    document.getElementById("pendingBatchesBar").innerHTML = pending.map(b => `
      <button type="button" class="batch-chip ${this.currentBatch?.Batch_ID === b.Batch_ID ? "active" : ""}" onclick="PostageModule.loadBatch('${b.Batch_ID}')" title="Resume SOM #${b.SOM_Number}">
        #${b.SOM_Number || "Draft"}
      </button>
    `).join("");
  },

  renderHistory() {
    let list = AppStore.batches.slice(0, 10);
    if (this.historyFilter === "PENDING") list = list.filter(b => !b.Given_To_Tapal);
    if (this.historyFilter === "DONE") list = list.filter(b => Boolean(b.Given_To_Tapal));

    const wrap = document.getElementById("postageHistoryList");
    if (!list.length) {
      wrap.innerHTML = `<div class="card muted small">No records.</div>`;
      return;
    }
    wrap.innerHTML = list.map(b => this.renderBatchCardHTML(b, "")).join("");
  },

  renderBatchCardHTML(b, highlightQuery) {
    const barcodes = [
      ...(b.Speed_Barcodes ? String(b.Speed_Barcodes).split(",").map(s => ({ code: s.trim(), type: "Speed" })) : []),
      ...(b.Registered_Barcodes ? String(b.Registered_Barcodes).split(",").map(s => ({ code: s.trim(), type: "Reg" })) : [])
    ].filter(x => x.code);

    const exceptions = (String(b.Comments || "").match(/\[(SOM No|Receipt No|Tapal No):[^\]]+\]/g) || [])
      .map(tag => `<span class="exception-pill">${tag.replace(/[\[\]]/g, "")}</span>`).join(" ");

    const autoExpandBarcodes = highlightQuery && barcodes.some(x => x.code.toUpperCase().includes(highlightQuery));

    return `
      <div class="history-item">
        <div class="row-between">
          <strong>SOM #${b.SOM_Number || "N/A"} • ${b.Total_Posts || 0} Posts</strong>
          <button type="button" class="btn-mini accent" onclick="PostageModule.loadBatch('${b.Batch_ID}')" title="Open & Edit SOM">Edit</button>
        </div>
        <div class="small muted">S:${b.Speed_Posts || 0} • R:${b.Registered_Parcels || 0} • O:${b.Ordinary_Posts || 0} • ${DateTimeHelper.formatShort(b.Received_DateTime)}</div>
        <div class="small">Counter: ${b.Counter_Number || "-"} • Tapal: ${b.Given_To_Tapal || "Pending"} ${b.Received_By_Name ? "(" + b.Received_By_Name + ")" : ""}</div>
        ${b.Comments ? `<div class="small muted mt-6">${b.Comments}</div>` : ""}
        ${exceptions}
        ${barcodes.length ? `
          <details class="mt-6" ${autoExpandBarcodes ? "open" : ""}>
            <summary class="small" style="cursor:pointer; font-weight:700; color:var(--primary);">Barcodes (${barcodes.length})</summary>
            <div class="chip-wrap mt-6">
              ${barcodes.map(x => `<span class="b-chip ${x.type === "Speed" ? "speed" : "reg"}" onclick="PostageModule.track('${x.code}')" title="Tap to copy & track on India Post">${x.code} ↗</span>`).join("")}
            </div>
          </details>` : ""}
      </div>`;
  },

  async saveBatchRecord(stageCode, successMsg) {
    const batch = this.readFormAndValidate(stageCode);
    if (!batch) return;

    const idx = AppStore.batches.findIndex(x => x.Batch_ID === batch.Batch_ID);
    if (idx !== -1) AppStore.batches[idx] = { ...batch };
    else AppStore.batches.unshift({ ...batch });

    AppStore.barcodes = AppStore.barcodes.filter(x => x.Batch_ID !== batch.Batch_ID);
    const st = batch.Given_To_Tapal === "Yes" ? "3. Given to Tapal" : (batch.Receipt_Received === "Yes" ? "2. Delivered at PO" : "1. At Office");
    this.speedBarcodes.forEach(c => AppStore.barcodes.unshift({ Barcode: c, Post_Type: "Speed Post", SOM_Number: batch.SOM_Number, Batch_ID: batch.Batch_ID, Dispatch_Date: batch.Received_DateTime, Status: st }));
    this.regBarcodes.forEach(c => AppStore.barcodes.unshift({ Barcode: c, Post_Type: "Registered Parcel", SOM_Number: batch.SOM_Number, Batch_ID: batch.Batch_ID, Dispatch_Date: batch.Received_DateTime, Status: st }));

    this.updateStageSummaries();

    if (stageCode === 1) this.openOnlyStage(2);
    else if (stageCode === 2) this.openOnlyStage(3);
    else if (stageCode === 3 || stageCode === 0) this.collapseAllStages();

    await AppStore.pushAction("saveBatch", batch);
    showToast(successMsg);
  },

  stepCount(id, delta) {
    const el = document.getElementById(id);
    el.value = Math.max(0, parseInt(el.value || "0", 10) + delta);
    this.recalcTotal();
  },

  recalcTotal() {
    const s = parseInt(document.getElementById("pSpeedPosts").value || "0", 10);
    const r = parseInt(document.getElementById("pRegParcels").value || "0", 10);
    const o = parseInt(document.getElementById("pOrdPosts").value || "0", 10);
    document.getElementById("pTotalDisplay").textContent = s + r + o;
  },

  setToggle(groupId, val) {
    document.querySelectorAll(`#${groupId} button`).forEach(b => b.classList.toggle("selected", b.dataset.val === val));
  },

  getToggle(groupId) {
    const sel = document.querySelector(`#${groupId} button.selected`);
    return sel ? sel.dataset.val : "";
  },

  bindEvents() {
    document.querySelectorAll(".sub-nav-btn").forEach(btn => {
      btn.addEventListener("click", () => this.switchSubView(btn.dataset.psub));
    });

    document.querySelectorAll("[data-pstage]").forEach(hdr => {
      hdr.addEventListener("click", () => {
        const n = parseInt(hdr.dataset.pstage, 10);
        const body = document.getElementById(`pBody${n}`);
        if (!body.classList.contains("collapsed")) {
          body.classList.add("collapsed");
          document.getElementById(`pChev${n}`).textContent = "▶";
        } else {
          this.openOnlyStage(n);
        }
      });
    });

    document.querySelectorAll("[data-save-pstage]").forEach(btn => {
      btn.addEventListener("click", () => {
        const st = parseInt(btn.dataset.savePstage, 10);
        this.saveBatchRecord(st, `Stage ${st} Saved`);
      });
    });

    document.getElementById("btnSaveAllPostage").addEventListener("click", () => {
      this.saveBatchRecord(0, "All Stages Saved");
    });

    document.getElementById("pSomNumber").addEventListener("input", () => this.syncSomBannerTitle());
    document.getElementById("btnSomPlus").addEventListener("click", () => this.stepSom(1));
    document.getElementById("btnSomMinus").addEventListener("click", () => this.stepSom(-1));

    document.querySelectorAll("[data-count-target]").forEach(btn => {
      btn.addEventListener("click", () => this.stepCount(btn.dataset.countTarget, parseInt(btn.dataset.delta, 10)));
    });
    ["pSpeedPosts", "pRegParcels", "pOrdPosts"].forEach(id => {
      document.getElementById(id).addEventListener("input", () => this.recalcTotal());
    });

    ["pSomRecGroup", "pRecRecGroup", "pTapalGroup"].forEach(gid => {
      document.querySelectorAll(`#${gid} button`).forEach(btn => {
        btn.addEventListener("click", () => {
          this.setToggle(gid, btn.dataset.val);
          this.toggleNoBoxes();
        });
      });
    });

    document.getElementById("view-postage").addEventListener("click", (e) => {
      if (e.target.dataset.pcounter) {
        document.getElementById("pCounterNumber").value = e.target.dataset.pcounter;
        document.querySelectorAll("[data-pcounter]").forEach(b => b.classList.toggle("selected", b === e.target));
      }
      if (e.target.dataset.fill) {
        document.getElementById(e.target.dataset.fill).value = e.target.dataset.val;
      }
      const chip = e.target.closest("[data-edit-btype]");
      if (chip) {
        this.openBarcodeEditModal(chip.dataset.editBtype, Number(chip.dataset.editBidx));
      }
      if (e.target.dataset.kw) {
        const clickedKw = e.target.dataset.kw;
        if (this.activeKeyword === clickedKw) {
          this.activeKeyword = null;
          e.target.classList.remove("top-rank");
        } else {
          document.querySelectorAll("[data-kw]").forEach(b => b.classList.remove("top-rank"));
          e.target.classList.add("top-rank");
          this.activeKeyword = clickedKw;
        }
        this.runSearchAndFilter();
      }
    });

    document.getElementById("btnToggleBatchScanner").addEventListener("click", () => {
      this.startScanner("BATCH");
    });

    // Enforce uppercase letters and digits only while typing in barcode inputs
    ["manualBarcodeText", "editBarcodeInput"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", () => {
          const pos = el.selectionStart;
          const cleaned = el.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (el.value !== cleaned) {
            el.value = cleaned;
            el.setSelectionRange(pos, pos);
          }
        });
      }
    });

    document.getElementById("btnAddManualBarcode").addEventListener("click", () => {
      const inp = document.getElementById("manualBarcodeText");
      const type = document.getElementById("manualBarcodeType").value;
      const entered = inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (this.addBarcode(entered, type)) {
        this.preFillBarcodeTemplate(entered, true);
      }
    });

    document.getElementById("manualBarcodeText").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btnAddManualBarcode").click();
      }
    });

    document.getElementById("btnReplaceBarcodeSave").addEventListener("click", () => this.replaceEditedBarcode());
    document.getElementById("btnDeleteBarcodeConfirm").addEventListener("click", () => this.deleteEditedBarcode());
    document.getElementById("btnCancelBarcodeEdit").addEventListener("click", () => {
      document.getElementById("editBarcodeModal").classList.add("hidden");
      this.editingBarcode = null;
    });

    document.getElementById("postageSearchInput").addEventListener("input", () => this.runSearchAndFilter());
    document.getElementById("btnScanSearch").addEventListener("click", () => {
      this.startScanner("SEARCH");
    });
    document.getElementById("btnClearSearch").addEventListener("click", () => {
      document.getElementById("postageSearchInput").value = "";
      this.activeKeyword = null;
      document.querySelectorAll("[data-kw]").forEach(b => b.classList.remove("top-rank"));
      this.runSearchAndFilter();
    });

    document.getElementById("btnNewBatch").addEventListener("click", () => this.startNewBatch(true));

    document.querySelectorAll("[data-pfilter]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-pfilter]").forEach(b => b.classList.remove("active-filter"));
        btn.classList.add("active-filter");
        this.historyFilter = btn.dataset.pfilter;
        this.renderHistory();
      });
    });
  },

  stepSom(delta) {
    const el = document.getElementById("pSomNumber");
    const m = el.value.trim().match(/^(.*?)(\d+)$/);
    if (m) {
      el.value = m[1] + Math.max(1, parseInt(m[2], 10) + delta);
    } else {
      el.value = "101";
    }
    this.syncSomBannerTitle();
  }
};

document.addEventListener("DOMContentLoaded", () => PostageModule.init());