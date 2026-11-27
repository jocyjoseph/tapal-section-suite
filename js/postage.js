const PostageModule = {
  currentBatch: null,
  activeStage: 0,
  editingBarcodeCtx: null,
  inspectingBatchId: null,
  historyFilter: "ALL",
  searchFilter: "ALL",

  init() {
    this.bindEvents();
    this.startNewEntry(false);
    AppStore.onUpdate(() => {
      this.refreshLearnedChips();
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
    if (subName === "search") this.renderSearchResults();
    if (subName === "history") this.renderHistory();
  },

  isSentBatch(b) {
    return Boolean(b.SOM_Received || b.Receipt_Received || b.Given_To_Tapal === "Yes");
  },

  isReportedBatch(b) {
    return b.Given_To_Tapal === "Yes";
  },

  startNewEntry(notify = true) {
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
    this.currentBatch = { ...found };
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "postage"));
    document.querySelectorAll(".module-view").forEach(v => v.classList.toggle("hidden", v.id !== "view-postage"));
    this.switchSubView("entry");
    this.populateForm(this.currentBatch);
    this.openStage(targetStage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  updateAutoLabels() {
    const som = document.getElementById("pSomNumber").value.trim() || "—";
    const rdt = document.getElementById("pReceivedDT").value;
    document.getElementById("pStage1AutoLabel").textContent = `SOM #${som} • ${rdt ? DateTimeHelper.formatShort(rdt) : "Now"}`;

    const ddt = document.getElementById("pDeliveredDT").value;
    document.getElementById("pDeliveredDTLabel").textContent = `Posting Time: ${ddt ? DateTimeHelper.formatShort(ddt) : "Now"}`;

    const gdt = document.getElementById("pGivenDT").value;
    document.getElementById("pGivenDTLabel").textContent = `Reporting Time: ${gdt ? DateTimeHelper.formatShort(gdt) : "Now"}`;
  },

  openStage(stageNum) {
    this.activeStage = stageNum;

    if (stageNum === 1) {
      const inp = document.getElementById("pReceivedDT");
      if (!inp.value) {
        const stored = DateTimeHelper.toDateTimeLocalValue(this.currentBatch.Received_DateTime);
        inp.value = stored || DateTimeHelper.nowLocalISO();
      }
      inp.max = DateTimeHelper.nowLocalISO();
      document.getElementById("pStage1AutoFields").classList.add("hidden");
    }
    if (stageNum === 2) {
      const inp = document.getElementById("pDeliveredDT");
      if (!inp.value) {
        const stored = DateTimeHelper.toDateTimeLocalValue(this.currentBatch.Delivered_DateTime);
        inp.value = stored || DateTimeHelper.nowLocalISO();
      }
      inp.max = DateTimeHelper.nowLocalISO();
      document.getElementById("pDeliveredDTWrap").classList.add("hidden");
    }
    if (stageNum === 3) {
      const inp = document.getElementById("pGivenDT");
      if (!inp.value) {
        const stored = DateTimeHelper.toDateTimeLocalValue(this.currentBatch.Given_DateTime);
        inp.value = stored || DateTimeHelper.nowLocalISO();
      }
      inp.max = DateTimeHelper.nowLocalISO();
      document.getElementById("pGivenDTWrap").classList.add("hidden");
    }

    this.updateAutoLabels();

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
    document.getElementById("pReceivedDT").value = DateTimeHelper.toDateTimeLocalValue(b.Received_DateTime);
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

    document.getElementById("pDeliveredDT").value = DateTimeHelper.toDateTimeLocalValue(b.Delivered_DateTime);
    document.getElementById("pPoComments").value = b.PO_Comments || "";

    this.setToggle("pTapalGroup", b.Given_To_Tapal || "");
    document.getElementById("pTapalNoBox").classList.toggle("hidden", b.Given_To_Tapal !== "No");
    document.getElementById("pTapalNoReason").value = b.Tapal_No_Reason || "";

    document.getElementById("pGivenDT").value = DateTimeHelper.toDateTimeLocalValue(b.Given_DateTime);
    document.getElementById("pReceivedBy").value = b.Received_By_Name || "";
    document.getElementById("pComments").value = b.Comments || "";

    this.updateAutoLabels();
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
  // LOMAG EXCEL IMPORT + MANUAL BARCODE ENTRY
  // =========================================================
  async handleLoMagFileImport(file) {
    if (!file) return;
    const fileName = file.name.toLowerCase();

    try {
      let extractedCodes = [];

      if ((fileName.endsWith(".xls") || fileName.endsWith(".xlsx")) && typeof XLSX !== "undefined") {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        let itemColIdx = -1;
        if (rows.length > 0 && Array.isArray(rows[0])) {
          itemColIdx = rows[0].findIndex(h => String(h).trim().toLowerCase() === "item code");
        }

        if (itemColIdx !== -1) {
          for (let r = 1; r < rows.length; r++) {
            const cellVal = String(rows[r][itemColIdx] || "").trim().toUpperCase();
            if (cellVal) extractedCodes.push(cellVal);
          }
        } else {
          rows.forEach(row => {
            if (!Array.isArray(row)) return;
            row.forEach(cell => {
              const matches = String(cell || "").toUpperCase().match(/[A-Z]{2}\d{9}IN/g);
              if (matches) extractedCodes.push(...matches);
            });
          });
        }
      } else {
        const text = await file.text();
        const matches = text.toUpperCase().match(/[A-Z]{2}\d{9}IN/g);
        if (matches) extractedCodes = matches;
      }

      if (!extractedCodes.length) {
        showToast("No valid barcodes found in the selected LoMag file.");
        return;
      }

      let addedCount = 0;
      let duplicateCount = 0;
      extractedCodes.forEach(code => {
        const ok = this.addBarcodeToCurrentBatch(code, "AUTO", true);
        if (ok) addedCount++;
        else duplicateCount++;
      });

      if (addedCount > 0) {
        const lastCode = extractedCodes[extractedCodes.length - 1];
        this.keepPreviousBarcodeInInput(lastCode);
        showToast(`Imported ${addedCount} barcode(s) from LoMag${duplicateCount ? ` (${duplicateCount} skipped)` : ""} ✓`);
      } else {
        showToast(`All ${duplicateCount} barcode(s) were already in this batch.`);
      }
    } catch (err) {
      console.error("LoMag import error:", err);
      showToast("Could not read LoMag file. Check file format.");
    }
  },

  keepPreviousBarcodeInInput(code) {
    const inp = document.getElementById("manualBarcodeText");
    if (!inp || !code) return;
    const clean = String(code).trim().toUpperCase();
    inp.value = clean;
    inp.focus();
    if (clean.length === 13 && clean.endsWith("IN")) {
      inp.setSelectionRange(2, 11);
    } else if (clean.length > 2) {
      inp.setSelectionRange(2, clean.length);
    }
  },

  classifyBarcode(rawCode, overrideType = "AUTO") {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!code) return null;
    if (overrideType === "SPEED") return { code, type: "SPEED" };
    if (overrideType === "REG") return { code, type: "REG" };
    if (code.startsWith("C") || code.startsWith("R")) return { code, type: "REG" };
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

  addBarcodeToCurrentBatch(rawCode, overrideType = "AUTO", silent = false) {
    const parsed = this.classifyBarcode(rawCode, overrideType);
    if (!parsed) return false;

    const { speed, reg } = this.getBarcodeArrays();
    if (speed.includes(parsed.code) || reg.includes(parsed.code)) {
      if (!silent) showToast(`Already added: ${parsed.code}`);
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

    if (!silent) {
      if (navigator.vibrate) navigator.vibrate(60);
      showToast(`Added ${parsed.type === "SPEED" ? "Speed" : "R Parcel"}: ${parsed.code}`);
    }
    this.recalcTotal();
    this.renderScannedBarcodes();
    return true;
  },

  renderScannedBarcodes() {
    const { speed, reg } = this.getBarcodeArrays();
    const wrap = document.getElementById("scannedBarcodeList");
    const chips = [
      ...speed.map((c, idx) => `<button type="button" class="b-chip speed" data-edit-btype="SPEED" data-edit-bidx="${idx}">⚡ ${c}</button>`),
      ...reg.map((c, idx) => `<button type="button" class="b-chip reg" data-edit-btype="REG" data-edit-bidx="${idx}">📦 ${c}</button>`)
    ];
    wrap.innerHTML = chips.join("");
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
  // STRUCTURED 3-SECTION SOM DETAILED REPORT MODAL
  // =========================================================
  openReportModal(batchId) {
    const b = AppStore.batches.find(x => String(x.Batch_ID) === String(batchId));
    if (!b) return;
    this.inspectingBatchId = batchId;

    const sent = this.isSentBatch(b);
    const statusLabel = b.Given_To_Tapal === "Yes" ? "Reported" : sent ? "Sent" : "Logged";
    const notes = [
      b.PO_Comments ? `Posting: ${b.PO_Comments}` : "",
      b.Comments ? `Tapal: ${b.Comments}` : "",
      b.SOM_No_Reason ? `SOM No Reason: ${b.SOM_No_Reason}` : "",
      b.Receipt_No_Reason ? `Receipt No Reason: ${b.Receipt_No_Reason}` : "",
      b.Tapal_No_Reason ? `Tapal No Reason: ${b.Tapal_No_Reason}` : ""
    ].filter(Boolean);

    document.getElementById("postageReportBody").innerHTML = `
      <div class="report-hero">
        <div class="row-between">
          <span class="badge primary">✉️ Postage (SOM)</span>
          <span class="badge ${sent ? "online" : "offline"}">${statusLabel}</span>
        </div>
        <div class="report-hero-title">SOM #${b.SOM_Number} • ${b.Total_Articles || 0} Postage</div>
        <div class="small muted mt-6">Prepared: ${DateTimeHelper.formatShort(b.Received_DateTime) || "—"}</div>
      </div>

      <div class="report-section">
        <div class="report-section-title">1. Postage Breakdown</div>
        <div class="report-kv"><span class="report-kv-lbl">Speed Post</span><span class="report-kv-val">${b.Speed_Posts || 0}</span></div>
        <div class="report-kv"><span class="report-kv-lbl">R Parcel</span><span class="report-kv-val">${b.Registered_Parcels || 0}</span></div>
        <div class="report-kv"><span class="report-kv-lbl">Ordinary</span><span class="report-kv-val">${b.Ordinary_Posts || 0}</span></div>
        ${b.Speed_Barcodes ? `<div class="report-item-line small mt-6" style="word-break:break-all;"><strong>Speed Barcodes:</strong> ${b.Speed_Barcodes}</div>` : ""}
        ${b.Registered_Barcodes ? `<div class="report-item-line small mt-6" style="word-break:break-all;"><strong>R Parcel Barcodes:</strong> ${b.Registered_Barcodes}</div>` : ""}
      </div>

      <div class="report-section">
        <div class="report-section-title">2. Posting & Tapal Handover</div>
        <div class="report-kv"><span class="report-kv-lbl">Counter</span><span class="report-kv-val">${b.Counter_Number || "—"}</span></div>
        <div class="report-kv"><span class="report-kv-lbl">Posting Date & Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(b.Delivered_DateTime) || "—"}</span></div>
        <div class="report-kv"><span class="report-kv-lbl">SOM / Receipt Recv.</span><span class="report-kv-val">SOM: ${b.SOM_Received || "—"} | Rec: ${b.Receipt_Received || "—"}</span></div>
        <div class="report-kv"><span class="report-kv-lbl">Given to Tapal</span><span class="report-kv-val">${b.Given_To_Tapal || "—"}${b.Received_By_Name ? " (" + b.Received_By_Name + ")" : ""}</span></div>
        <div class="report-kv"><span class="report-kv-lbl">Reporting Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(b.Given_DateTime) || "—"}</span></div>
      </div>

      ${notes.length ? `<div class="report-note-box">${notes.join("<br/>")}</div>` : ""}
    `;

    document.getElementById("postageEditWarningBox").classList.add("hidden");
    document.getElementById("postageDeleteWarningBox").classList.add("hidden");
    document.getElementById("postageReportFooter").classList.remove("hidden");
    document.getElementById("postageReportModal").classList.remove("hidden");
  },

  async deleteSingleBatch(batchId) {
    const idx = AppStore.batches.findIndex(b => String(b.Batch_ID) === String(batchId));
    if (idx === -1) return;
    const removed = AppStore.batches[idx];
    AppStore.batches.splice(idx, 1);

    await AppStore.pushAction("deleteBatch", { Batch_ID: removed.Batch_ID });
    this.renderHistory();
    this.renderSearchResults();
    if (typeof DeliveryModule !== "undefined") {
      DeliveryModule.renderActiveTasks();
      DeliveryModule.renderUnreportedTasks();
    }
    showToast(`SOM #${removed.SOM_Number} deleted`);
  },

  // =========================================================
  // SAVE STAGES WITH MINIMUM 1 POSTAGE & DUPLICATE SOM GUARD
  // =========================================================
  collectStage1() {
    const som = document.getElementById("pSomNumber").value.trim();
    if (!som) {
      showToast("Enter SOM Number.");
      return false;
    }

    const duplicate = AppStore.batches.find(
      b => String(b.SOM_Number).trim().toLowerCase() === som.toLowerCase() &&
           String(b.Batch_ID) !== String(this.currentBatch.Batch_ID)
    );
    if (duplicate) {
      showToast(`SOM #${som} already exists! Use a unique SOM number.`);
      document.getElementById("pStage1AutoFields").classList.remove("hidden");
      document.getElementById("pSomNumber").focus();
      return false;
    }

    const s = Math.max(0, parseInt(document.getElementById("pSpeedPosts").value || "0", 10));
    const r = Math.max(0, parseInt(document.getElementById("pRegParcels").value || "0", 10));
    const o = Math.max(0, parseInt(document.getElementById("pOrdPosts").value || "0", 10));
    const total = s + r + o;

    if (total < 1) {
      showToast("Add at least 1 postage item before saving.");
      return false;
    }

    this.currentBatch.Received_DateTime = document.getElementById("pReceivedDT").value || DateTimeHelper.nowLocalISO();
    this.currentBatch.SOM_Number = som;
    this.currentBatch.Speed_Posts = s;
    this.currentBatch.Registered_Parcels = r;
    this.currentBatch.Ordinary_Posts = o;
    this.currentBatch.Total_Articles = total;
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
    await AppStore.pushAction("saveBatch", this.currentBatch);
    const stageNames = { 1: "Preparation", 2: "Posting", 3: "Reporting" };
    showToast(`SOM #${this.currentBatch.SOM_Number} ${stageNames[stageNum]} Saved ✓`);

    if (typeof DeliveryModule !== "undefined") {
      DeliveryModule.renderActiveTasks();
      DeliveryModule.renderUnreportedTasks();
    }

    if (stageNum === 1) {
      this.collapseAllStages();
    } else if (stageNum === 2) {
      this.openStage(3);
    } else {
      this.collapseAllStages();
    }
  },

  async saveAllStages() {
    if (!this.collectStage1()) return;
    if (!this.collectStage2()) return;
    if (!this.collectStage3()) return;

    this.upsertLocalBatch(this.currentBatch);
    this.updateStageSummaries();
    await AppStore.pushAction("saveBatch", this.currentBatch);
    if (typeof DeliveryModule !== "undefined") {
      DeliveryModule.renderActiveTasks();
      DeliveryModule.renderUnreportedTasks();
    }
    showToast(`SOM #${this.currentBatch.SOM_Number} Saved ✓`);
    this.collapseAllStages();
  },

  upsertLocalBatch(batchObj) {
    const idx = AppStore.batches.findIndex(b => String(b.Batch_ID) === String(batchObj.Batch_ID));
    if (idx !== -1) AppStore.batches[idx] = { ...batchObj };
    else AppStore.batches.unshift({ ...batchObj });
  },

  // =========================================================
  // SUMMARIES, CHIPS, SEARCH & POSTAGE HISTORY
  // =========================================================
  updateStageSummaries() {
    const b = this.currentBatch;
    document.getElementById("postageBannerTitle").textContent = `SOM #${b.SOM_Number || "—"}`;

    const s1Done = Boolean(b.SOM_Number && b.Received_DateTime && Number(b.Total_Articles) > 0);
    document.getElementById("pSummary1").textContent = s1Done
      ? `SOM #${b.SOM_Number} • ${b.Total_Articles} Postage (${DateTimeHelper.formatShort(b.Received_DateTime)})`
      : "Not saved yet";
    document.getElementById("pCard1").classList.toggle("completed", s1Done);

    const s2Done = Boolean(b.SOM_Received || b.Receipt_Received || b.Counter_Number);
    document.getElementById("pSummary2").textContent = s2Done
      ? `Counter ${b.Counter_Number || "-"} • SOM: ${b.SOM_Received || "-"} | Rec: ${b.Receipt_Received || "-"}`
      : "Pending";
    document.getElementById("pCard2").classList.toggle("completed", s2Done);

    const s3Done = b.Given_To_Tapal === "Yes";
    document.getElementById("pSummary3").textContent = b.Given_To_Tapal
      ? `Tapal: ${b.Given_To_Tapal}${b.Received_By_Name ? " (" + b.Received_By_Name + ")" : ""}`
      : "Pending";
    document.getElementById("pCard3").classList.toggle("completed", s3Done);

    const badge = document.getElementById("postageStageBadge");
    if (s3Done) badge.textContent = "Reported";
    else if (s2Done) badge.textContent = "Sent";
    else if (s1Done) badge.textContent = "Logged";
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

  sortNewestFirst(arr) {
    return [...arr].sort((a, b) => {
      const ta = DateTimeHelper.timestampMs(a.Delivered_DateTime || a.Received_DateTime, a.Batch_ID);
      const tb = DateTimeHelper.timestampMs(b.Delivered_DateTime || b.Received_DateTime, b.Batch_ID);
      return tb - ta;
    });
  },

  renderSearchResults() {
    const q = document.getElementById("postageSearchInput").value.trim().toLowerCase();
    let results = this.sortNewestFirst(AppStore.batches);

    if (this.searchFilter === "LOGGED") {
      results = results.filter(b => !this.isSentBatch(b));
    } else if (this.searchFilter === "SENT") {
      results = results.filter(b => this.isSentBatch(b));
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
    let list = this.sortNewestFirst(AppStore.batches);
    if (this.historyFilter === "LOGGED") list = list.filter(b => !this.isSentBatch(b));
    if (this.historyFilter === "SENT") list = list.filter(b => this.isSentBatch(b));

    const wrap = document.getElementById("postageHistoryList");
    if (!list.length) {
      wrap.innerHTML = `<div class="card muted small">No SOM records yet.</div>`;
      return;
    }

    wrap.innerHTML = list.slice(0, 25).map(b => this.buildBatchCardHTML(b)).join("");
  },

  buildBatchCardHTML(b) {
    const sent = this.isSentBatch(b);
    const codes = [b.Speed_Barcodes, b.Registered_Barcodes].filter(Boolean).join(", ");
    const issues = [
      b.SOM_Received === "No" ? `SOM No: ${b.SOM_No_Reason}` : "",
      b.Receipt_Received === "No" ? `Receipt No: ${b.Receipt_No_Reason}` : "",
      b.Given_To_Tapal === "No" ? `Tapal No: ${b.Tapal_No_Reason}` : ""
    ].filter(Boolean);

    // Show Delivery/Posting time when status is Sent; Preparation time when status is Logged
    const displayDT = sent
      ? DateTimeHelper.formatShort(b.Delivered_DateTime || b.Received_DateTime)
      : DateTimeHelper.formatShort(b.Received_DateTime);

    return `
      <div class="history-item">
        <div class="row-between">
          <strong>SOM #${b.SOM_Number} • ${b.Total_Articles || 0} Postage</strong>
          <div class="row-gap">
            <span class="badge ${sent ? "online" : "offline"}">${sent ? "Sent" : "Logged"}</span>
            <button type="button" class="btn-mini accent" data-inspect-pbatch="${b.Batch_ID}">View</button>
          </div>
        </div>
        <div class="small muted mt-6">
          Speed: ${b.Speed_Posts || 0} | R Parcel: ${b.Registered_Parcels || 0} | Ordinary: ${b.Ordinary_Posts || 0} • ${displayDT}
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
      this.updateAutoLabels();
    });
    document.getElementById("btnSomMinus").addEventListener("click", () => {
      const inp = document.getElementById("pSomNumber");
      const m = String(inp.value || "101").trim().match(/^(.*?)(\d+)$/);
      if (m && parseInt(m[2], 10) > 1) inp.value = `${m[1]}${parseInt(m[2], 10) - 1}`;
      document.getElementById("postageBannerTitle").textContent = `SOM #${inp.value}`;
      this.updateAutoLabels();
    });
    document.getElementById("pSomNumber").addEventListener("input", (e) => {
      document.getElementById("postageBannerTitle").textContent = `SOM #${e.target.value || "—"}`;
      this.updateAutoLabels();
    });
    ["pReceivedDT", "pDeliveredDT", "pGivenDT"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => this.updateAutoLabels());
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

    const lomagInp = document.getElementById("lomagFileInput");
    document.getElementById("btnImportLoMag").addEventListener("click", () => {
      lomagInp.value = "";
      lomagInp.click();
    });
    lomagInp.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleLoMagFileImport(e.target.files[0]);
      }
    });

    const addManualAndRepeat = () => {
      const inp = document.getElementById("manualBarcodeText");
      const type = document.getElementById("manualBarcodeType").value;
      const entered = inp.value.trim().toUpperCase();
      if (this.addBarcodeToCurrentBatch(entered, type)) {
        this.keepPreviousBarcodeInInput(entered);
      }
    };

    document.getElementById("btnAddManualBarcode").addEventListener("click", addManualAndRepeat);
    document.getElementById("manualBarcodeText").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addManualAndRepeat();
      }
    });

    document.getElementById("manualBarcodeText").addEventListener("paste", (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData("text");
      const codes = pasted.toUpperCase().match(/[A-Z]{2}\d{9}IN/g);
      if (codes && codes.length > 1) {
        e.preventDefault();
        let added = 0;
        codes.forEach(code => {
          if (this.addBarcodeToCurrentBatch(code, "AUTO", true)) added++;
        });
        this.keepPreviousBarcodeInInput(codes[codes.length - 1]);
        if (added > 0) showToast(`Added ${added} barcode(s)`);
      }
    });

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

    document.querySelectorAll("[data-save-pstage]").forEach(btn => {
      btn.addEventListener("click", () => this.saveStage(parseInt(btn.dataset.savePstage, 10)));
    });
    document.getElementById("btnSaveAllPostage").addEventListener("click", () => this.saveAllStages());

    document.getElementById("view-postage").addEventListener("pointerdown", (e) => {
      if (e.target.dataset.pfill) {
        e.preventDefault();
        document.getElementById(e.target.dataset.pfill).value = e.target.dataset.pval;
        this.refreshLearnedChips();
      }
    });

    document.getElementById("view-postage").addEventListener("click", (e) => {
      if (e.target.dataset.toggleEdit) {
        document.getElementById(e.target.dataset.toggleEdit).classList.toggle("hidden");
        this.updateAutoLabels();
      }
      if (e.target.dataset.editBtype) {
        this.openBarcodeEditModal(e.target.dataset.editBtype, parseInt(e.target.dataset.editBidx, 10));
      }
      if (e.target.dataset.inspectPbatch) {
        this.openReportModal(e.target.dataset.inspectPbatch);
      }
      if (e.target.dataset.kw) {
        document.querySelectorAll("[data-kw]").forEach(b => b.classList.remove("active-filter"));
        e.target.classList.add("active-filter");
        this.searchFilter = e.target.dataset.kw;
        this.renderSearchResults();
      }
      if (e.target.dataset.pfilter) {
        document.querySelectorAll("[data-pfilter]").forEach(b => b.classList.remove("active-filter"));
        e.target.classList.add("active-filter");
        this.historyFilter = e.target.dataset.pfilter;
        this.renderHistory();
      }
    });

    document.getElementById("btnClosePostageReport").addEventListener("click", () => document.getElementById("postageReportModal").classList.add("hidden"));
    document.getElementById("btnClosePostageReport2").addEventListener("click", () => document.getElementById("postageReportModal").classList.add("hidden"));
    document.getElementById("btnRequestEditPostage").addEventListener("click", () => {
      document.getElementById("postageEditWarningBox").classList.remove("hidden");
      document.getElementById("postageDeleteWarningBox").classList.add("hidden");
      document.getElementById("postageReportFooter").classList.add("hidden");
    });
    document.getElementById("btnCancelPostageEditWarn").addEventListener("click", () => {
      document.getElementById("postageEditWarningBox").classList.add("hidden");
      document.getElementById("postageReportFooter").classList.remove("hidden");
    });
    document.getElementById("btnConfirmUnlockPostageEdit").addEventListener("click", () => {
      document.getElementById("postageReportModal").classList.add("hidden");
      if (this.inspectingBatchId) this.loadBatch(this.inspectingBatchId, 1);
      showToast("Unlocked for editing");
    });
    document.getElementById("btnRequestDeletePostage").addEventListener("click", () => {
      document.getElementById("postageDeleteWarningBox").classList.remove("hidden");
      document.getElementById("postageEditWarningBox").classList.add("hidden");
      document.getElementById("postageReportFooter").classList.add("hidden");
    });
    document.getElementById("btnCancelPostageDeleteWarn").addEventListener("click", () => {
      document.getElementById("postageDeleteWarningBox").classList.add("hidden");
      document.getElementById("postageReportFooter").classList.remove("hidden");
    });
    document.getElementById("btnConfirmDeletePostage").addEventListener("click", async () => {
      document.getElementById("postageReportModal").classList.add("hidden");
      if (this.inspectingBatchId) {
        await this.deleteSingleBatch(this.inspectingBatchId);
        this.inspectingBatchId = null;
      }
    });

    document.getElementById("btnReplaceBarcodeSave").addEventListener("click", () => this.saveBarcodeEdit());
    document.getElementById("btnDeleteBarcodeConfirm").addEventListener("click", () => this.deleteBarcodeEdit());
    document.getElementById("btnCancelBarcodeEdit").addEventListener("click", () => {
      document.getElementById("editBarcodeModal").classList.add("hidden");
      this.editingBarcodeCtx = null;
    });

    document.getElementById("postageSearchInput").addEventListener("input", () => this.renderSearchResults());
    document.getElementById("btnClearSearch").addEventListener("click", () => {
      document.getElementById("postageSearchInput").value = "";
      this.renderSearchResults();
    });
  }
};

document.addEventListener("DOMContentLoaded", () => PostageModule.init());
