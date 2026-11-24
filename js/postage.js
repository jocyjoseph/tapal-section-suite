const PostageModule = {
  currentBatch: null,
  activeStage: 0,
  batchScanner: null,
  searchScanner: null,
  editingBarcodeCtx: null,
  historyFilter: "ALL",

  init() {
    this.bindEvents();
    this.startNewEntry(false);
    AppStore.onUpdate(() => {
      this.refreshLearnedChips();
      this.renderPendingBar();
      this.renderHistory();
      this.renderSearchResults();
      if (!this.currentBatch.SOM_Number && AppStore.batches.length) {
        this.currentBatch.SOM_Number = AppStore.getNextSomSuggestion();
        this.populateForm(this.currentBatch);
      }
    });
  },

  switchSubView(subName) {
    document.querySelectorAll("[data-psub]").forEach(b => b.classList.toggle("active", b.dataset.psub === subName));
    document.querySelectorAll(".psub-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(`psub-${subName}`).classList.remove("hidden");
    if (subName !== "entry") this.stopBatchScanner();
    if (subName !== "search") this.stopSearchScanner();
    if (subName === "search") this.renderSearchResults();
    if (subName === "history") this.renderHistory();
  },

  // =========================================================
  // BATCH STATE & STAGE ACCORDIONS
  // =========================================================
  startNewEntry(notify = true) {
    this.stopBatchScanner();
    const nextSom = AppStore.getNextSomSuggestion();
    this.currentBatch = {
      Batch_ID: "SOM-" + Date.now(),
      SOM_Number: nextSom,
      Received_DateTime: "",
      Speed_Posts: 0,
      Registered_Parcels: 0,
      Ordinary_Posts: 0,
      Total_Articles: 0,
      Speed_Barcodes: "",
      Registered_Barcodes: "",
      Counter_Number: "",
      SOM_Received: "",
      SOM_No_Reason: "",
      Receipt_Received: "",
      Receipt_No_Reason: "",
      Delivered_DateTime: "",
      PO_Comments: "",
      Given_To_Tapal: "",
      Tapal_No_Reason: "",
      Given_DateTime: "",
      Received_By_Name: "",
      Comments: ""
    };
    this.populateForm(this.currentBatch);
    this.collapseAllStages();
    if (notify) showToast(`Ready for SOM #${nextSom}`);
  },

  loadBatch(batchId, targetStage = 1) {
    const found = AppStore.batches.find(b => String(b.Batch_ID) === String(batchId));
    if (!found) return;
    this.stopBatchScanner();
    this.currentBatch = { ...found };
    this.switchSubView("entry");
    this.populateForm(this.currentBatch);
    this.openStage(targetStage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  openStage(stageNum) {
    this.activeStage = stageNum;

    if (stageNum === 1) {
      const inp = document.getElementById("pReceivedDT");
      if (!inp.value) {
        inp.value = DateTimeHelper.nowLocalISO();
        inp.max = inp.value;
      }
    }
    if (stageNum === 2) {
      const inp = document.getElementById("pDeliveredDT");
      if (!inp.value) {
        inp.value = DateTimeHelper.nowLocalISO();
        inp.max = inp.value;
      }
    }
    if (stageNum === 3) {
      const inp = document.getElementById("pGivenDT");
      if (!inp.value) {
        inp.value = DateTimeHelper.nowLocalISO();
        inp.max = inp.value;
      }
    }

    [1, 2, 3].forEach(n => {
      const open = n === stageNum;
      document.getElementById(`pBody${n}`).classList.toggle("collapsed", !open);
      document.getElementById(`pChev${n}`).textContent = open ? "▼" : "▶";
    });
  },

  collapseAllStages() {
    this.activeStage = 0;
    [1, 2, 3].forEach(n => {
      document.getElementById(`pBody${n}`).classList.add("collapsed");
      document.getElementById(`pChev${n}`).textContent = "▶";
    });
  },

  populateForm(b) {
    document.getElementById("postageBannerTitle").textContent = `SOM #${b.SOM_Number || "—"}`;
    document.getElementById("pReceivedDT").value = b.Received_DateTime || "";
    document.getElementById("pSomNumber").value = b.SOM_Number || "";
    document.getElementById("pSpeedPosts").value = b.Speed_Posts || 0;
    document.getElementById("pRegParcels").value = b.Registered_Parcels || 0;
    document.getElementById("pOrdPosts").value = b.Ordinary_Posts || 0;
    this.recalcTotal();
    this.renderScannedBarcodes();

    document.getElementById("pCounterNumber").value = b.Counter_Number || "";
    this.setToggle("pSomRecGroup", b.SOM_Received || "");
    document.getElementById("pSomNoBox").classList.toggle("hidden", b.SOM_Received !== "No");
    document.getElementById("pSomNoReason").value = b.SOM_No_Reason || "";

    this.setToggle("pRecRecGroup", b.Receipt_Received || "");
    document.getElementById("pRecNoBox").classList.toggle("hidden", b.Receipt_Received !== "No");
    document.getElementById("pRecNoReason").value = b.Receipt_No_Reason || "";

    document.getElementById("pDeliveredDT").value = b.Delivered_DateTime || "";
    document.getElementById("pPoComments").value = b.PO_Comments || "";

    this.setToggle("pTapalGroup", b.Given_To_Tapal || "");
    document.getElementById("pTapalNoBox").classList.toggle("hidden", b.Given_To_Tapal !== "No");
    document.getElementById("pTapalNoReason").value = b.Tapal_No_Reason || "";

    document.getElementById("pGivenDT").value = b.Given_DateTime || "";
    document.getElementById("pReceivedBy").value = b.Received_By_Name || "";
    document.getElementById("pComments").value = b.Comments || "";

    this.updateStageSummaries();
    this.refreshLearnedChips();
  },

  recalcTotal() {
    const s = parseInt(document.getElementById("pSpeedPosts").value || "0", 10);
    const r = parseInt(document.getElementById("pRegParcels").value || "0", 10);
    const o = parseInt(document.getElementById("pOrdPosts").value || "0", 10);
    document.getElementById("pTotalDisplay").textContent = s + r + o;
  },

  // =========================================================
  // HIGH-SPEED 1D CODE-128 BARCODE SCANNER (LOMAG-STYLE AIM)
  // =========================================================
  getPostalScannerConfig() {
    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const w = Math.min(Math.floor(viewfinderWidth * 0.88), 340);
        const h = Math.min(Math.floor(viewfinderHeight * 0.42), 120);
        return { width: Math.max(w, 220), height: Math.max(h, 90) };
      },
      aspectRatio: 1.777778,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      },
      videoConstraints: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    if (typeof Html5QrcodeSupportedFormats !== "undefined") {
      config.formatsToSupport = [Html5QrcodeSupportedFormats.CODE_128];
    }
    return config;
  },

  classifyBarcode(rawCode, overrideType = "AUTO") {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!code) return null;
    if (overrideType === "SPEED") return { code, type: "SPEED" };
    if (overrideType === "REG") return { code, type: "REG" };
    if (code.startsWith("R")) return { code, type: "REG" };
    return { code, type: "SPEED" };
  },

  getBarcodeArrays() {
    const speed = this.currentBatch.Speed_Barcodes
      ? String(this.currentBatch.Speed_Barcodes).split(",").map(s => s.trim()).filter(Boolean)
      : [];
    const reg = this.currentBatch.Registered_Barcodes
      ? String(this.currentBatch.Registered_Barcodes).split(",").map(s => s.trim()).filter(Boolean)
      : [];
    return { speed, reg };
  },

  addBarcodeToCurrentBatch(rawCode, overrideType = "AUTO") {
    const parsed = this.classifyBarcode(rawCode, overrideType);
    if (!parsed) return false;

    const { speed, reg } = this.getBarcodeArrays();
    if (speed.includes(parsed.code) || reg.includes(parsed.code)) {
      showToast(`Already scanned: ${parsed.code}`);
      return false;
    }

    if (parsed.type === "SPEED") {
      speed.push(parsed.code);
      this.currentBatch.Speed_Barcodes = speed.join(", ");
      const spInp = document.getElementById("pSpeedPosts");
      if (parseInt(spInp.value || "0", 10) < speed.length) spInp.value = speed.length;
    } else {
      reg.push(parsed.code);
      this.currentBatch.Registered_Barcodes = reg.join(", ");
      const rgInp = document.getElementById("pRegParcels");
      if (parseInt(rgInp.value || "0", 10) < reg.length) rgInp.value = reg.length;
    }

    if (navigator.vibrate) navigator.vibrate(60);
    this.recalcTotal();
    this.renderScannedBarcodes();
    showToast(`Added ${parsed.type === "SPEED" ? "Speed" : "Registered"}: ${parsed.code}`);
    return true;
  },

  renderScannedBarcodes() {
    const { speed, reg } = this.getBarcodeArrays();
    const wrap = document.getElementById("scannedBarcodeList");
    const chips = [
      ...speed.map((c, idx) => `<button type="button" class="b-chip speed" data-edit-btype="SPEED" data-edit-bidx="${idx}" title="Tap to edit or delete">⚡ ${c}</button>`),
      ...reg.map((c, idx) => `<button type="button" class="b-chip reg" data-edit-btype="REG" data-edit-bidx="${idx}" title="Tap to edit or delete">📦 ${c}</button>`)
    ];
    wrap.innerHTML = chips.join("");
  },

  async toggleBatchScanner() {
    const box = document.getElementById("qrReaderBox");
    const btnText = document.getElementById("scanBtnText");

    if (this.batchScanner) {
      await this.stopBatchScanner();
      return;
    }

    if (typeof Html5Qrcode === "undefined") {
      showToast("Scanner library offline — type or paste barcode.");
      return;
    }

    box.classList.remove("hidden");
    btnText.textContent = "Stop";
    this.batchScanner = new Html5Qrcode("qrReaderBox");

    try {
      await this.batchScanner.start(
        { facingMode: "environment" },
        this.getPostalScannerConfig(),
        (decodedText) => {
          this.addBarcodeToCurrentBatch(decodedText, "AUTO");
        },
        () => {}
      );
    } catch (err) {
      box.classList.add("hidden");
      btnText.textContent = "Scan";
      this.batchScanner = null;
      showToast("Camera permission denied or unavailable.");
    }
  },

  async stopBatchScanner() {
    const box = document.getElementById("qrReaderBox");
    const btnText = document.getElementById("scanBtnText");
    if (this.batchScanner) {
      try {
        await this.batchScanner.stop();
        this.batchScanner.clear();
      } catch (e) {}
      this.batchScanner = null;
    }
    if (box) box.classList.add("hidden");
    if (btnText) btnText.textContent = "Scan";
  },

  async toggleSearchScanner() {
    const box = document.getElementById("searchQrBox");
    if (this.searchScanner) {
      await this.stopSearchScanner();
      return;
    }

    if (typeof Html5Qrcode === "undefined") {
      showToast("Scanner library offline.");
      return;
    }

    box.classList.remove("hidden");
    this.searchScanner = new Html5Qrcode("searchQrBox");

    try {
      await this.searchScanner.start(
        { facingMode: "environment" },
        this.getPostalScannerConfig(),
        async (decodedText) => {
          const clean = decodedText.trim().toUpperCase();
          if (navigator.vibrate) navigator.vibrate(60);
          document.getElementById("postageSearchInput").value = clean;
          this.renderSearchResults();
          await this.stopSearchScanner();
          showToast(`Found: ${clean}`);
        },
        () => {}
      );
    } catch (err) {
      box.classList.add("hidden");
      this.searchScanner = null;
      showToast("Camera unavailable.");
    }
  },

  async stopSearchScanner() {
    const box = document.getElementById("searchQrBox");
    if (this.searchScanner) {
      try {
        await this.searchScanner.stop();
        this.searchScanner.clear();
      } catch (e) {}
      this.searchScanner = null;
    }
    if (box) box.classList.add("hidden");
  },

  // =========================================================
  // BARCODE EDIT / DELETE MODAL
  // =========================================================
  openBarcodeEditModal(type, index) {
    const { speed, reg } = this.getBarcodeArrays();
    const list = type === "SPEED" ? speed : reg;
    const currentVal = list[index];
    if (!currentVal) return;

    this.editingBarcodeCtx = { type, index };
    document.getElementById("editBarcodeInput").value = currentVal;
    document.getElementById("editBarcodeModal").classList.remove("hidden");
  },

  saveBarcodeEdit() {
    if (!this.editingBarcodeCtx) return;
    const { type, index } = this.editingBarcodeCtx;
    const newVal = document.getElementById("editBarcodeInput").value.trim().toUpperCase();
    if (!newVal) {
      showToast("Barcode cannot be empty.");
      return;
    }
    const { speed, reg } = this.getBarcodeArrays();
    if (type === "SPEED") {
      speed[index] = newVal;
      this.currentBatch.Speed_Barcodes = speed.join(", ");
    } else {
      reg[index] = newVal;
      this.currentBatch.Registered_Barcodes = reg.join(", ");
    }
    document.getElementById("editBarcodeModal").classList.add("hidden");
    this.editingBarcodeCtx = null;
    this.renderScannedBarcodes();
    showToast("Barcode updated");
  },

  deleteBarcodeEdit() {
    if (!this.editingBarcodeCtx) return;
    const { type, index } = this.editingBarcodeCtx;
    const { speed, reg } = this.getBarcodeArrays();
    if (type === "SPEED") {
      speed.splice(index, 1);
      this.currentBatch.Speed_Barcodes = speed.join(", ");
    } else {
      reg.splice(index, 1);
      this.currentBatch.Registered_Barcodes = reg.join(", ");
    }
    document.getElementById("editBarcodeModal").classList.add("hidden");
    this.editingBarcodeCtx = null;
    this.renderScannedBarcodes();
    showToast("Barcode removed");
  },

  // =========================================================
  // SAVE STAGES WITH DUPLICATE SOM GUARD
  // =========================================================
  collectStage1() {
    const som = document.getElementById("pSomNumber").value.trim();
    if (!som) {
      showToast("Enter SOM Number.");
      return false;
    }

    // Duplicate SOM check against all other batches
    const duplicate = AppStore.batches.find(
      b => String(b.SOM_Number).trim().toLowerCase() === som.toLowerCase() &&
           String(b.Batch_ID) !== String(this.currentBatch.Batch_ID)
    );
    if (duplicate) {
      showToast(`SOM #${som} already exists! Use a unique SOM number.`);
      document.getElementById("pSomNumber").focus();
      return false;
    }

    const s = Math.max(0, parseInt(document.getElementById("pSpeedPosts").value || "0", 10));
    const r = Math.max(0, parseInt(document.getElementById("pRegParcels").value || "0", 10));
    const o = Math.max(0, parseInt(document.getElementById("pOrdPosts").value || "0", 10));

    this.currentBatch.Received_DateTime = document.getElementById("pReceivedDT").value || DateTimeHelper.nowLocalISO();
    this.currentBatch.SOM_Number = som;
    this.currentBatch.Speed_Posts = s;
    this.currentBatch.Registered_Parcels = r;
    this.currentBatch.Ordinary_Posts = o;
    this.currentBatch.Total_Articles = s + r + o;
    return true;
  },

  collectStage2() {
    const somRec = this.getToggle("pSomRecGroup");
    const recRec = this.getToggle("pRecRecGroup");
    const somReason = document.getElementById("pSomNoReason").value.trim();
    const recReason = document.getElementById("pRecNoReason").value.trim();

    if (somRec === "No" && !somReason) {
      showToast("Enter reason why SOM was not received.");
      document.getElementById("pSomNoReason").focus();
      return false;
    }
    if (recRec === "No" && !recReason) {
      showToast("Enter reason why Receipt was not received.");
      document.getElementById("pRecNoReason").focus();
      return false;
    }

    this.currentBatch.Counter_Number = document.getElementById("pCounterNumber").value.trim();
    this.currentBatch.SOM_Received = somRec;
    this.currentBatch.SOM_No_Reason = somRec === "No" ? somReason : "";
    this.currentBatch.Receipt_Received = recRec;
    this.currentBatch.Receipt_No_Reason = recRec === "No" ? recReason : "";
    this.currentBatch.Delivered_DateTime = document.getElementById("pDeliveredDT").value || DateTimeHelper.nowLocalISO();
    this.currentBatch.PO_Comments = document.getElementById("pPoComments").value.trim();
    return true;
  },

  collectStage3() {
    const given = this.getToggle("pTapalGroup");
    const tapalReason = document.getElementById("pTapalNoReason").value.trim();

    if (given === "No" && !tapalReason) {
      showToast("Enter reason why not given to Tapal.");
      document.getElementById("pTapalNoReason").focus();
      return false;
    }

    this.currentBatch.Given_To_Tapal = given;
    this.currentBatch.Tapal_No_Reason = given === "No" ? tapalReason : "";
    this.currentBatch.Given_DateTime = document.getElementById("pGivenDT").value || DateTimeHelper.nowLocalISO();
    this.currentBatch.Received_By_Name = document.getElementById("pReceivedBy").value.trim();
    this.currentBatch.Comments = document.getElementById("pComments").value.trim();
    return true;
  },

  async saveStage(stageNum) {
    if (stageNum === 1 && !this.collectStage1()) return;
    if (stageNum === 2) {
      if (!this.currentBatch.SOM_Number && !this.collectStage1()) return;
      if (!this.collectStage2()) return;
    }
    if (stageNum === 3) {
      if (!this.currentBatch.SOM_Number && !this.collectStage1()) return;
      if (!this.collectStage3()) return;
    }

    this.upsertLocalBatch(this.currentBatch);
    this.updateStageSummaries();
    this.renderPendingBar();
    await AppStore.pushAction("saveBatch", this.currentBatch);
    showToast(`SOM #${this.currentBatch.SOM_Number} Stage ${stageNum} Saved ✓`);

    if (stageNum === 1) this.openStage(2);
    else if (stageNum === 2) this.openStage(3);
    else this.collapseAllStages();
  },

  async saveAllStages() {
    if (!this.collectStage1()) return;
    if (!this.collectStage2()) return;
    if (!this.collectStage3()) return;

    this.upsertLocalBatch(this.currentBatch);
    this.updateStageSummaries();
    this.renderPendingBar();
    await AppStore.pushAction("saveBatch", this.currentBatch);
    showToast(`SOM #${this.currentBatch.SOM_Number} All Stages Saved ✓`);
    this.collapseAllStages();
  },

  upsertLocalBatch(batchObj) {
    const idx = AppStore.batches.findIndex(b => String(b.Batch_ID) === String(batchObj.Batch_ID));
    if (idx !== -1) AppStore.batches[idx] = { ...batchObj };
    else AppStore.batches.unshift({ ...batchObj });
  },

  // =========================================================
  // SUMMARIES, CHIPS, PENDING BAR, SEARCH & HISTORY
  // =========================================================
  updateStageSummaries() {
    const b = this.currentBatch;
    document.getElementById("postageBannerTitle").textContent = `SOM #${b.SOM_Number || "—"}`;

    const s1Done = Boolean(b.SOM_Number && b.Received_DateTime);
    document.getElementById("pSummary1").textContent = s1Done
      ? `SOM #${b.SOM_Number} • ${b.Total_Articles} articles (${DateTimeHelper.formatShort(b.Received_DateTime)})`
      : "Stage 1";
    document.getElementById("pCard1").classList.toggle("completed", s1Done);

    const s2Done = Boolean(b.SOM_Received || b.Receipt_Received || b.Counter_Number);
    document.getElementById("pSummary2").textContent = s2Done
      ? `Counter ${b.Counter_Number || "-"} • SOM: ${b.SOM_Received || "-"} | Rec: ${b.Receipt_Received || "-"}`
      : "Stage 2";
    document.getElementById("pCard2").classList.toggle("completed", s2Done);

    const s3Done = b.Given_To_Tapal === "Yes";
    document.getElementById("pSummary3").textContent = b.Given_To_Tapal
      ? `Tapal: ${b.Given_To_Tapal}${b.Received_By_Name ? " (" + b.Received_By_Name + ")" : ""}`
      : "Stage 3";
    document.getElementById("pCard3").classList.toggle("completed", s3Done);

    const badge = document.getElementById("postageStageBadge");
    if (s3Done) badge.textContent = "Completed";
    else if (s2Done) badge.textContent = "Stage 2 Done";
    else if (s1Done) badge.textContent = "Stage 1 Done";
    else badge.textContent = "Ready";
  },

  refreshLearnedChips() {
    const counters = AppStore.rankByFrequency(AppStore.batches.map(b => b.Counter_Number), CONFIG.DEFAULT_COUNTERS).slice(0, 6);
    document.getElementById("pCounterPills").innerHTML = counters.map(c =>
      `<button type="button" class="pill-btn ${document.getElementById("pCounterNumber").value === c ? "selected" : ""}" data-pfill="pCounterNumber" data-pval="${c}">${c}</button>`
    ).join("");

    const somReasons = AppStore.rankByFrequency(AppStore.batches.map(b => b.SOM_No_Reason), CONFIG.DEFAULT_SOM_NO_REASONS).slice(0, 5);
    document.getElementById("pSomNoChips").innerHTML = somReasons.map(r =>
      `<button type="button" class="smart-chip" data-pfill="pSomNoReason" data-pval="${r}">${r}</button>`
    ).join("");

    const recReasons = AppStore.rankByFrequency(AppStore.batches.map(b => b.Receipt_No_Reason), CONFIG.DEFAULT_REC_NO_REASONS).slice(0, 5);
    document.getElementById("pRecNoChips").innerHTML = recReasons.map(r =>
      `<button type="button" class="smart-chip" data-pfill="pRecNoReason" data-pval="${r}">${r}</button>`
    ).join("");

    const tapalReasons = AppStore.rankByFrequency(AppStore.batches.map(b => b.Tapal_No_Reason), CONFIG.DEFAULT_TAPAL_NO_REASONS).slice(0, 5);
    document.getElementById("pTapalNoChips").innerHTML = tapalReasons.map(r =>
      `<button type="button" class="smart-chip" data-pfill="pTapalNoReason" data-pval="${r}">${r}</button>`
    ).join("");

    const poComments = AppStore.rankByFrequency(AppStore.batches.map(b => b.PO_Comments)).slice(0, 5);
    document.getElementById("pPoCommentChips").innerHTML = poComments.map(c =>
      `<button type="button" class="smart-chip" data-pfill="pPoComments" data-pval="${c}">${c}</button>`
    ).join("");

    const staff = AppStore.rankByFrequency(AppStore.batches.map(b => b.Received_By_Name)).slice(0, 6);
    document.getElementById("pNameChips").innerHTML = staff.map((n, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-pfill="pReceivedBy" data-pval="${n}">${n}</button>`
    ).join("");

    const comments = AppStore.rankByFrequency(AppStore.batches.map(b => b.Comments)).slice(0, 5);
    document.getElementById("pCommentChips").innerHTML = comments.map(c =>
      `<button type="button" class="smart-chip" data-pfill="pComments" data-pval="${c}">${c}</button>`
    ).join("");
  },

  renderPendingBar() {
    const pending = AppStore.batches.filter(b => b.Given_To_Tapal !== "Yes").slice(0, 8);
    const bar = document.getElementById("pendingBatchesBar");
    bar.innerHTML = pending.map(b => {
      const nextStage = !(b.SOM_Received || b.Receipt_Received) ? 2 : 3;
      const active = this.currentBatch && String(this.currentBatch.Batch_ID) === String(b.Batch_ID);
      return `<button type="button" class="batch-chip ${active ? "active" : ""}" data-load-batch="${b.Batch_ID}" data-next-stage="${nextStage}">SOM #${b.SOM_Number} (S${nextStage})</button>`;
    }).join("");
  },

  renderSearchResults(keywordPreset = null) {
    const q = document.getElementById("postageSearchInput").value.trim().toLowerCase();
    let results = [...AppStore.batches];

    if (keywordPreset === "PENDING_PO") {
      results = results.filter(b => !b.SOM_Received && !b.Receipt_Received);
    } else if (keywordPreset === "PENDING_TAPAL") {
      results = results.filter(b => b.Given_To_Tapal !== "Yes");
    } else if (keywordPreset === "COMPLETED") {
      results = results.filter(b => b.Given_To_Tapal === "Yes");
    } else if (keywordPreset === "NO_ISSUE") {
      results = results.filter(b => b.SOM_Received === "No" || b.Receipt_Received === "No" || b.Given_To_Tapal === "No");
    } else if (keywordPreset === "SPEED") {
      results = results.filter(b => Number(b.Speed_Posts) > 0 || Boolean(b.Speed_Barcodes));
    } else if (keywordPreset === "REG") {
      results = results.filter(b => Number(b.Registered_Parcels) > 0 || Boolean(b.Registered_Barcodes));
    }

    if (q) {
      results = results.filter(b => {
        const hay = [
          b.SOM_Number, b.Speed_Barcodes, b.Registered_Barcodes,
          b.Received_By_Name, b.PO_Comments, b.Comments,
          b.SOM_No_Reason, b.Receipt_No_Reason, b.Tapal_No_Reason
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    const wrap = document.getElementById("postageSearchResults");
    if (!results.length) {
      wrap.innerHTML = `<div class="card muted small">No matching SOM or barcode found.</div>`;
      return;
    }

    wrap.innerHTML = results.slice(0, 25).map(b => this.buildBatchCardHTML(b)).join("");
  },

  renderHistory() {
    let list = [...AppStore.batches];
    if (this.historyFilter === "PENDING") list = list.filter(b => b.Given_To_Tapal !== "Yes");
    if (this.historyFilter === "DONE") list = list.filter(b => b.Given_To_Tapal === "Yes");

    const wrap = document.getElementById("postageHistoryList");
    if (!list.length) {
      wrap.innerHTML = `<div class="card muted small">No SOM records yet.</div>`;
      return;
    }

    wrap.innerHTML = list.slice(0, 10).map(b => this.buildBatchCardHTML(b)).join("");
  },

  buildBatchCardHTML(b) {
    const done = b.Given_To_Tapal === "Yes";
    const codes = [b.Speed_Barcodes, b.Registered_Barcodes].filter(Boolean).join(", ");
    const issues = [
      b.SOM_Received === "No" ? `SOM No: ${b.SOM_No_Reason}` : "",
      b.Receipt_Received === "No" ? `Receipt No: ${b.Receipt_No_Reason}` : "",
      b.Given_To_Tapal === "No" ? `Tapal No: ${b.Tapal_No_Reason}` : ""
    ].filter(Boolean);

    return `
      <div class="history-item">
        <div class="row-between">
          <strong>SOM #${b.SOM_Number} • ${b.Total_Articles || 0} pcs</strong>
          <div class="row-gap">
            <span class="badge ${done ? "online" : "offline"}">${done ? "Done" : "Pending"}</span>
            <button type="button" class="btn-mini accent" data-load-batch="${b.Batch_ID}" data-next-stage="1">Open</button>
          </div>
        </div>
        <div class="small muted mt-6">
          Speed: ${b.Speed_Posts || 0} | Reg: ${b.Registered_Parcels || 0} | Ord: ${b.Ordinary_Posts || 0} • ${DateTimeHelper.formatShort(b.Received_DateTime)}
        </div>
        ${codes ? `<div class="small mt-6" style="word-break:break-all;">Barcodes: <strong>${codes}</strong></div>` : ""}
        ${b.Received_By_Name ? `<div class="small muted mt-6">Tapal Receiver: <strong>${b.Received_By_Name}</strong></div>` : ""}
        ${issues.map(i => `<span class="exception-pill">${i}</span>`).join(" ")}
      </div>`;
  },

  setToggle(groupId, val) {
    document.querySelectorAll(`#${groupId} button`).forEach(b => b.classList.toggle("selected", b.dataset.val === val));
  },

  getToggle(groupId) {
    const sel = document.querySelector(`#${groupId} button.selected`);
    return sel ? sel.dataset.val : "";
  },

  bindEvents() {
    document.querySelectorAll("[data-psub]").forEach(btn => {
      btn.addEventListener("click", () => this.switchSubView(btn.dataset.psub));
    });

    document.querySelectorAll("[data-pstage]").forEach(hdr => {
      hdr.addEventListener("click", () => {
        const n = parseInt(hdr.dataset.pstage, 10);
        const body = document.getElementById(`pBody${n}`);
        if (!body.classList.contains("collapsed")) {
          this.collapseAllStages();
        } else {
          this.openStage(n);
        }
      });
    });

    document.getElementById("btnNewBatch").addEventListener("click", () => {
      this.startNewEntry(true);
      this.openStage(1);
    });

    document.getElementById("btnSomPlus").addEventListener("click", () => {
      const inp = document.getElementById("pSomNumber");
      const m = String(inp.value || "100").trim().match(/^(.*?)(\d+)$/);
      inp.value = m ? `${m[1]}${parseInt(m[2], 10) + 1}` : "101";
      document.getElementById("postageBannerTitle").textContent = `SOM #${inp.value}`;
    });
    document.getElementById("btnSomMinus").addEventListener("click", () => {
      const inp = document.getElementById("pSomNumber");
      const m = String(inp.value || "101").trim().match(/^(.*?)(\d+)$/);
      if (m && parseInt(m[2], 10) > 1) inp.value = `${m[1]}${parseInt(m[2], 10) - 1}`;
      document.getElementById("postageBannerTitle").textContent = `SOM #${inp.value}`;
    });
    document.getElementById("pSomNumber").addEventListener("input", (e) => {
      document.getElementById("postageBannerTitle").textContent = `SOM #${e.target.value || "—"}`;
    });

    document.querySelectorAll("[data-count-target]").forEach(btn => {
      btn.addEventListener("click", () => {
        const inp = document.getElementById(btn.dataset.countTarget);
        const next = Math.max(0, parseInt(inp.value || "0", 10) + parseInt(btn.dataset.delta, 10));
        inp.value = next;
        this.recalcTotal();
      });
    });
    ["pSpeedPosts", "pRegParcels", "pOrdPosts"].forEach(id => {
      document.getElementById(id).addEventListener("input", () => this.recalcTotal());
    });

    // Scanner & Manual / Paste Barcode Controls
    document.getElementById("btnToggleBatchScanner").addEventListener("click", () => this.toggleBatchScanner());
    document.getElementById("btnAddManualBarcode").addEventListener("click", () => {
      const inp = document.getElementById("manualBarcodeText");
      const type = document.getElementById("manualBarcodeType").value;
      if (this.addBarcodeToCurrentBatch(inp.value, type)) inp.value = "";
    });

    // Support pasting one or multiple barcodes (e.g. from LoMag Barcode Scanner)
    document.getElementById("manualBarcodeText").addEventListener("paste", (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData("text");
      const codes = pasted.toUpperCase().match(/[A-Z]{2}\d{9}IN/g);
      if (codes && codes.length > 0) {
        e.preventDefault();
        let added = 0;
        codes.forEach(code => {
          if (this.addBarcodeToCurrentBatch(code, "AUTO")) added++;
        });
        if (added > 0) showToast(`Added ${added} barcode(s)`);
      }
    });

    // Stage 2 & 3 Conditional Toggles
    document.querySelectorAll("#pSomRecGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("pSomRecGroup", btn.dataset.val);
        document.getElementById("pSomNoBox").classList.toggle("hidden", btn.dataset.val !== "No");
      });
    });
    document.querySelectorAll("#pRecRecGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("pRecRecGroup", btn.dataset.val);
        document.getElementById("pRecNoBox").classList.toggle("hidden", btn.dataset.val !== "No");
      });
    });
    document.querySelectorAll("#pTapalGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("pTapalGroup", btn.dataset.val);
        document.getElementById("pTapalNoBox").classList.toggle("hidden", btn.dataset.val !== "No");
      });
    });

    // Save Stage Buttons
    document.querySelectorAll("[data-save-pstage]").forEach(btn => {
      btn.addEventListener("click", () => this.saveStage(parseInt(btn.dataset.savePstage, 10)));
    });
    document.getElementById("btnSaveAllPostage").addEventListener("click", () => this.saveAllStages());

    // Delegated Clicks inside Module 1
    document.getElementById("view-postage").addEventListener("click", (e) => {
      if (e.target.dataset.pfill) {
        document.getElementById(e.target.dataset.pfill).value = e.target.dataset.pval;
        this.refreshLearnedChips();
      }
      if (e.target.dataset.editBtype) {
        this.openBarcodeEditModal(e.target.dataset.editBtype, parseInt(e.target.dataset.editBidx, 10));
      }
      if (e.target.dataset.loadBatch) {
        this.loadBatch(e.target.dataset.loadBatch, parseInt(e.target.dataset.nextStage || "1", 10));
      }
      if (e.target.dataset.kw) {
        this.renderSearchResults(e.target.dataset.kw);
      }
      if (e.target.dataset.pfilter) {
        document.querySelectorAll("[data-pfilter]").forEach(b => b.classList.remove("active-filter"));
        e.target.classList.add("active-filter");
        this.historyFilter = e.target.dataset.pfilter;
        this.renderHistory();
      }
    });

    // Barcode Edit Modal Listeners
    document.getElementById("btnReplaceBarcodeSave").addEventListener("click", () => this.saveBarcodeEdit());
    document.getElementById("btnDeleteBarcodeConfirm").addEventListener("click", () => this.deleteBarcodeEdit());
    document.getElementById("btnCancelBarcodeEdit").addEventListener("click", () => {
      document.getElementById("editBarcodeModal").classList.add("hidden");
      this.editingBarcodeCtx = null;
    });

    // Search View Listeners
    document.getElementById("postageSearchInput").addEventListener("input", () => this.renderSearchResults());
    document.getElementById("btnScanSearch").addEventListener("click", () => this.toggleSearchScanner());
    document.getElementById("btnClearSearch").addEventListener("click", () => {
      document.getElementById("postageSearchInput").value = "";
      this.renderSearchResults();
    });
  }
};

document.addEventListener("DOMContentLoaded", () => PostageModule.init());
