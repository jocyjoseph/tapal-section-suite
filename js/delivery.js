const DeliveryModule = {
  currentTask: null,
  natureMode: "Same",
  urgencyFilter: "ALL",
  selectedUnrepIds: new Set(),
  batchReportIds: [],
  groupReportIds: [],
  inspectingTaskId: null,
  allExpanded: false,

  init() {
    this.bindEvents();
    this.startNewTask(false);
    AppStore.onUpdate(() => {
      this.refreshLearnedOptions();
      this.renderActiveTasks();
      this.renderUnreportedTasks();
      this.renderHistory();
    });
  },

  switchSubView(subName) {
    document.querySelectorAll("[data-dsub]").forEach(b => b.classList.toggle("active", b.dataset.dsub === subName));
    document.querySelectorAll(".dsub-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(`dsub-${subName}`).classList.remove("hidden");
    if (subName === "tasks") this.renderActiveTasks();
    if (subName === "unreported") this.renderUnreportedTasks();
    if (subName === "history") this.renderHistory();
  },

  isCompletedLifecycle(t) {
    const dir = t.Direction || "Outward";
    if (dir === "Inward") {
      return t.Delivery_Status === "Delivered";
    }
    if (dir === "Enquiry") {
      return Boolean(t.Reply_Text) && t.Report_Status === "Reported";
    }
    if (dir === "Round-Trip") {
      return t.Delivery_Status === "Returned" && Boolean(t.Receiver_Name);
    }
    return t.Delivery_Status === "Delivered" && Boolean(t.Receipt_Given);
  },

  getDirectionBadgeHTML(dir) {
    const d = dir || "Outward";
    if (d === "Inward") return `<span class="badge" style="background:#ccfbf1; color:#0f766e;">📥 Collection</span>`;
    if (d === "Enquiry") return `<span class="badge" style="background:#fef3c7; color:#92400e;">🔍 Enquiry</span>`;
    if (d === "Round-Trip") return `<span class="badge" style="background:#ede9fe; color:#5b21b6;">🔄 Round-Trip</span>`;
    return `<span class="badge primary">📤 Delivery</span>`;
  },

  // =========================================================
  // DIRECTION-AWARE UI LABELS & STAGE VISIBILITY
  // =========================================================
  applyDirectionUI(direction) {
    const dir = direction || "Outward";
    const isOutward = dir === "Outward";
    const isInward = dir === "Inward";
    const isEnquiry = dir === "Enquiry";
    const isRoundTrip = dir === "Round-Trip";

    this.setToggle("dDirectionGroup", dir);

    const isExisting = this.currentTask && AppStore.deliveries.some(t => t.Task_ID === this.currentTask.Task_ID);
    const dirTitles = {
      "Outward": "Delivery",
      "Inward": "Collection",
      "Enquiry": "Enquiry",
      "Round-Trip": "Round-Trip"
    };
    document.getElementById("dActiveTaskBanner").textContent = isExisting
      ? `${dirTitles[dir]}: ${this.currentTask.Office_Name || "Task"}`
      : `New ${dirTitles[dir]}`;

    // Stage 1 labels & field groups
    if (isEnquiry) {
      document.getElementById("dStage1Tag").textContent = "STAGE 1 • ENQUIRY REQUEST";
      document.getElementById("lblDCreatedDT").textContent = "1. Date & Time";
      document.getElementById("lblDOfficeName").textContent = "3. To Office";
    } else if (isInward) {
      document.getElementById("dStage1Tag").textContent = "STAGE 1 • COLLECTION DETAILS";
      document.getElementById("lblDCreatedDT").textContent = "1. Collection Date & Time";
      document.getElementById("lblDOfficeName").textContent = "2. From Office Name";
      document.getElementById("lblDSection").textContent = "4. Receiving Section (Our Office)";
    } else if (isRoundTrip) {
      document.getElementById("dStage1Tag").textContent = "STAGE 1 • DOCUMENT & DESTINATION";
      document.getElementById("lblDCreatedDT").textContent = "1. Date & Time";
      document.getElementById("lblDOfficeName").textContent = "2. First Office Name";
      document.getElementById("lblDSection").textContent = "4. Originating Section";
    } else {
      document.getElementById("dStage1Tag").textContent = "STAGE 1 • DELIVERY DETAILS";
      document.getElementById("lblDCreatedDT").textContent = "1. Date & Time";
      document.getElementById("lblDOfficeName").textContent = "2. To Office Name";
      document.getElementById("lblDSection").textContent = "4. Section";
    }

    document.getElementById("dEnquirerGroup").classList.toggle("hidden", !isEnquiry);
    document.getElementById("dEnquiryTextGroup").classList.toggle("hidden", !isEnquiry);
    document.getElementById("dDocumentFieldsWrap").classList.toggle("hidden", isEnquiry);
    document.getElementById("dRoundTripPurposeGroup").classList.toggle("hidden", !isRoundTrip);
    document.getElementById("dPlannedDTGroup").classList.toggle("hidden", !isOutward);

    // Stage 2 visibility & labels
    document.getElementById("dStage2StandardWrap").classList.toggle("hidden", isEnquiry || isRoundTrip);
    document.getElementById("dStage2EnquiryWrap").classList.toggle("hidden", !isEnquiry);
    document.getElementById("dStage2RoundTripWrap").classList.toggle("hidden", !isRoundTrip);

    if (isEnquiry) {
      document.getElementById("dStage2Tag").textContent = "STAGE 2 • REPLY & REPORTING";
      document.getElementById("btnSaveDStage2").textContent = "Save Reply & Report";
    } else if (isRoundTrip) {
      document.getElementById("dStage2Tag").textContent = "STAGE 2 • OFFICE MOVEMENT & PROCESSING";
      document.getElementById("btnSaveDStage2").textContent = "Save Office Movement";
    } else if (isInward) {
      document.getElementById("dStage2Tag").textContent = "STAGE 2 • HANDOVER TO OUR OFFICE";
      document.getElementById("lblDCompletedDT").textContent = "3. Handover Date & Time";
      document.getElementById("lblDStage2Receiver").textContent = "4. Receiver's Name (Our Office Staff)";
      document.getElementById("dStage2ReceiverName").placeholder = "Staff in our office who received the collected file/doc...";
      document.getElementById("btnSaveDStage2").textContent = "Save Stage 2 & Move to History";
    } else {
      document.getElementById("dStage2Tag").textContent = "STAGE 2 • DELIVERY COMPLETION";
      document.getElementById("lblDCompletedDT").textContent = "3. Delivery Date & Time";
      document.getElementById("lblDStage2Receiver").textContent = "4. Receiver's Name (At External Office)";
      document.getElementById("dStage2ReceiverName").placeholder = "Person at external office who accepted the file/doc...";
      document.getElementById("btnSaveDStage2").textContent = "Save Stage 2";
    }

    // Stage 3 visibility & labels (Shown for Outward Delivery & Round-Trip; Hidden for Collection & Enquiry)
    document.getElementById("dCard3").classList.toggle("hidden", isInward || isEnquiry);
    document.getElementById("dStage3OutwardWrap").classList.toggle("hidden", !isOutward);
    document.getElementById("dStage3RoundTripWrap").classList.toggle("hidden", !isRoundTrip);

    if (isRoundTrip) {
      document.getElementById("dStage3Tag").textContent = "STAGE 3 • RETURN TO OUR OFFICE";
      document.getElementById("btnSaveDStage3").textContent = "Complete Round-Trip & Move to History";
    } else {
      document.getElementById("dStage3Tag").textContent = "STAGE 3 • RECEIPT REPORTING";
      document.getElementById("btnSaveDStage3").textContent = "Save Stage 3 & Move to History";
    }
  },

  // =========================================================
  // STAGE ACCORDIONS & TASK STATE
  // =========================================================
  startNewTask(notify = true) {
    this.batchReportIds = [];
    document.getElementById("dBatchReportBanner").classList.add("hidden");
    this.natureMode = "Same";

    this.currentTask = {
      Task_ID: "TASK-" + Date.now(),
      Direction: "Outward",
      Created_DateTime: "",
      Office_Name: "",
      Designation: "",
      Section: "",
      Nature: "File",
      Item_Count: 1,
      Nature_Mode: "Same",
      Items_JSON: JSON.stringify([{ number: "" }]),
      Items_Summary: "",
      Description: "",
      Has_Attachments: "No",
      Attachment_Count: 0,
      Attachments_JSON: "[]",
      Planned_Delivery_DT: "",
      Urgency: "Normal",
      Delivery_Status: "",
      Not_Delivered_Reason: "",
      Completed_DateTime: "",
      Stage2_Receiver_Name: "",
      Stage2_Comments: "",
      Receipt_Given: "",
      Receipt_No_Reason: "",
      Receiver_Name: "",
      Reported_DateTime: "",
      Enquirer_Name: "",
      Enquiry_Text: "",
      Reply_Text: "",
      Reply_DateTime: "",
      Report_Status: "",
      Report_Method: "",
      RoundTrip_Purpose: "",
      RoundTrip_Stops_JSON: JSON.stringify([{ office: "", action: "Signed", dt: DateTimeHelper.nowLocalISO(), officer: "" }]),
      RoundTrip_Custody: "With Me / In Transit"
    };

    this.populateForm(this.currentTask);
    this.collapseAllStages();
    if (notify) showToast("Ready for new entry");
  },

  loadTask(taskId, stageToOpen = 1) {
    const found = AppStore.deliveries.find(t => String(t.Task_ID) === String(taskId));
    if (!found) return;
    this.batchReportIds = [];
    document.getElementById("dBatchReportBanner").classList.add("hidden");
    this.currentTask = AppStore.normalizeDeliveryRow(found);
    this.natureMode = this.currentTask.Nature_Mode || "Same";
    this.switchSubView("entry");
    this.populateForm(this.currentTask);
    this.openStage(stageToOpen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  openStage(stageNum) {
    this.allExpanded = false;
    document.getElementById("btnToggleExpandAllDelivery").textContent = "Expand All";

    if (stageNum === 1) {
      const inp = document.getElementById("dCreatedDT");
      if (!inp.value) {
        const stored = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Created_DateTime);
        inp.value = stored || DateTimeHelper.nowLocalISO();
      }
      inp.max = DateTimeHelper.nowLocalISO();
    }
    if (stageNum === 2) {
      const dir = this.currentTask.Direction || "Outward";
      if (dir === "Enquiry") {
        const rInp = document.getElementById("dReplyDT");
        if (!rInp.value) rInp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Reply_DateTime) || DateTimeHelper.nowLocalISO();
        rInp.max = DateTimeHelper.nowLocalISO();
      } else {
        const inp = document.getElementById("dCompletedDT");
        if (!inp.value) inp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Completed_DateTime) || DateTimeHelper.nowLocalISO();
        inp.max = DateTimeHelper.nowLocalISO();
      }
    }
    if (stageNum === 3) {
      const dir = this.currentTask.Direction || "Outward";
      if (dir === "Round-Trip") {
        const rtInp = document.getElementById("dRtReturnDT");
        if (!rtInp.value) rtInp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Reported_DateTime) || DateTimeHelper.nowLocalISO();
        rtInp.max = DateTimeHelper.nowLocalISO();
      } else {
        const inp = document.getElementById("dReportedDT");
        if (!inp.value) inp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Reported_DateTime) || DateTimeHelper.nowLocalISO();
        inp.max = DateTimeHelper.nowLocalISO();
      }
    }

    [1, 2, 3].forEach(n => {
      const open = n === stageNum;
      document.getElementById(`dBody${n}`).classList.toggle("collapsed", !open);
      document.getElementById(`dChev${n}`).textContent = open ? "▼" : "▶";
    });
  },

  collapseAllStages() {
    this.allExpanded = false;
    document.getElementById("btnToggleExpandAllDelivery").textContent = "Expand All";
    [1, 2, 3].forEach(n => {
      document.getElementById(`dBody${n}`).classList.add("collapsed");
      document.getElementById(`dChev${n}`).textContent = "▶";
    });
  },

  toggleExpandAll() {
    this.allExpanded = !this.allExpanded;
    document.getElementById("btnToggleExpandAllDelivery").textContent = this.allExpanded ? "Collapse All" : "Expand All";
    if (this.allExpanded) {
      ["dCreatedDT", "dCompletedDT", "dReportedDT", "dReplyDT", "dRtReturnDT"].forEach(id => {
        const inp = document.getElementById(id);
        if (inp && !inp.value) inp.value = DateTimeHelper.nowLocalISO();
        if (inp) inp.max = DateTimeHelper.nowLocalISO();
      });
    }
    [1, 2, 3].forEach(n => {
      document.getElementById(`dBody${n}`).classList.toggle("collapsed", !this.allExpanded);
      document.getElementById(`dChev${n}`).textContent = this.allExpanded ? "▼" : "▶";
    });
  },

  populateForm(t) {
    const dir = t.Direction || "Outward";
    this.applyDirectionUI(dir);

    document.getElementById("dCreatedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Created_DateTime);
    document.getElementById("dOfficeName").value = t.Office_Name || "";
    document.getElementById("dDesignation").value = t.Designation || "";
    document.getElementById("dSection").value = t.Section || "";
    document.getElementById("dNature").value = t.Nature || "File";
    document.getElementById("dItemCount").value = t.Item_Count || 1;
    document.getElementById("dDescription").value = t.Description || "";

    // Enquiry Stage 1 fields
    document.getElementById("dEnquirerName").value = t.Enquirer_Name || "";
    document.getElementById("dEnquiryText").value = t.Enquiry_Text || "";

    // Round-Trip Stage 1 purpose
    document.getElementById("dRoundTripPurpose").value = t.RoundTrip_Purpose || "";

    let items = [];
    try { items = JSON.parse(t.Items_JSON || "[]"); } catch (e) {}
    this.renderDynamicItems(items);

    this.setToggle("dAttachToggleGroup", t.Has_Attachments || "No");
    const hasAtt = t.Has_Attachments === "Yes";
    document.getElementById("dAttachmentsBox").classList.toggle("hidden", !hasAtt);
    document.getElementById("dAttachCount").value = t.Attachment_Count || 1;
    let atts = [];
    try { atts = JSON.parse(t.Attachments_JSON || "[]"); } catch (e) {}
    if (hasAtt) this.renderAttachmentRows(atts);

    document.getElementById("dPlannedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Planned_Delivery_DT);
    this.setToggle("dUrgencyGroup", t.Urgency || "Normal");

    // Stage 2A: Delivery / Collection
    this.setToggle("dStatusGroup", t.Delivery_Status || "");
    document.getElementById("dNotDeliveredBox").classList.toggle("hidden", t.Delivery_Status !== "Not Delivered");
    document.getElementById("dNotDelivReason").value = t.Not_Delivered_Reason || "";
    document.getElementById("dCompletedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Completed_DateTime);
    document.getElementById("dStage2ReceiverName").value = t.Stage2_Receiver_Name || "";
    document.getElementById("dStage2Comments").value = t.Stage2_Comments || "";

    // Stage 2B: Enquiry Reply & Report
    document.getElementById("dReplyText").value = t.Reply_Text || "";
    document.getElementById("dReplyDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reply_DateTime);
    this.setToggle("dEnquiryReportStatusGroup", t.Report_Status || "");
    document.getElementById("dEnquiryReportedDetails").classList.toggle("hidden", t.Report_Status !== "Reported");
    document.getElementById("dEnquiryReportedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reported_DateTime);
    document.getElementById("dReportMethodInput").value = t.Report_Method || "";
    document.getElementById("dEnquiryComments").value = t.Stage2_Comments || "";

    // Stage 2C: Round-Trip Stops
    let stops = [];
    try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
    if (!stops.length) stops = [{ office: t.Office_Name || "", action: "Signed", dt: DateTimeHelper.nowLocalISO(), officer: "" }];
    this.renderRoundTripStops(stops);
    this.setToggle("dRoundTripCustodyGroup", t.RoundTrip_Custody || "With Me / In Transit");
    document.getElementById("dRoundTripComments").value = t.Stage2_Comments || "";

    // Stage 3A: Outward Receipt
    this.setToggle("dReceiptGivenGroup", t.Receipt_Given || "");
    document.getElementById("dReceiptNoBox").classList.toggle("hidden", t.Receipt_Given !== "No");
    document.getElementById("dReceiptYesFields").classList.toggle("hidden", t.Receipt_Given !== "Yes");
    document.getElementById("dReceiptNoReason").value = t.Receipt_No_Reason || "";
    document.getElementById("dReceiverName").value = t.Receiver_Name || "";
    document.getElementById("dReportedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reported_DateTime);

    // Stage 3B: Round-Trip Return
    document.getElementById("dRtReturnReceiverName").value = t.Receiver_Name || "";
    document.getElementById("dRtReturnDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reported_DateTime);

    this.updateStageSummaries();
    this.refreshLearnedOptions();
  },

  // =========================================================
  // ROUND-TRIP MULTI-OFFICE STOPS RENDERER
  // =========================================================
  renderRoundTripStops(stops = []) {
    const wrap = document.getElementById("dRoundTripStopsList");
    wrap.innerHTML = stops.map((st, idx) => `
      <div class="dynamic-schema-box mb-6 rt-stop-card">
        <div class="row-between mb-6">
          <span class="badge primary">Stop #${idx + 1}</span>
          ${stops.length > 1 ? `<button type="button" class="btn-mini" data-rm-rtstop="${idx}">× Remove</button>` : ""}
        </div>
        <div class="form-group" style="margin-top:0;">
          <label>Office Visited</label>
          <input type="text" class="rt-stop-office" list="dOfficeList" value="${st.office || ""}" placeholder="Office name..." />
        </div>
        <div class="row-gap">
          <div class="form-group" style="flex:1; margin-top:4px;">
            <label>Action / Status</label>
            <input type="text" class="rt-stop-action" value="${st.action || ""}" placeholder="Signed / Forwarded / Pending..." />
          </div>
          <div class="form-group" style="flex:1; margin-top:4px;">
            <label>Officer / Clerk Met</label>
            <input type="text" class="rt-stop-officer" value="${st.officer || ""}" placeholder="Optional..." />
          </div>
        </div>
        <div class="form-group" style="margin-top:4px;">
          <label>Date & Time</label>
          <input type="datetime-local" class="rt-stop-dt" value="${DateTimeHelper.toDateTimeLocalValue(st.dt) || DateTimeHelper.nowLocalISO()}" />
        </div>
      </div>
    `).join("");
  },

  collectRoundTripStops() {
    const cards = document.querySelectorAll("#dRoundTripStopsList .rt-stop-card");
    const stops = [];
    cards.forEach(c => {
      stops.push({
        office: c.querySelector(".rt-stop-office").value.trim(),
        action: c.querySelector(".rt-stop-action").value.trim(),
        officer: c.querySelector(".rt-stop-officer").value.trim(),
        dt: c.querySelector(".rt-stop-dt").value || DateTimeHelper.nowLocalISO()
      });
    });
    return stops;
  },

  // =========================================================
  // DYNAMIC ITEM & ATTACHMENT SCHEMAS
  // =========================================================
  renderDynamicItems(existingItems = []) {
    const nature = document.getElementById("dNature").value.trim() || "File";
    const count = Math.max(1, Math.min(30, parseInt(document.getElementById("dItemCount").value || "1", 10)));

    document.getElementById("lblDItemCount").textContent = `6. No. of ${nature}`;
    document.getElementById("lblDItemNumbers").textContent = count > 1 ? `7. ${nature} Numbers` : `7. ${nature} No.`;

    const modeWrap = document.getElementById("dSameVariousWrap");
    modeWrap.classList.toggle("hidden", count <= 1);
    document.getElementById("btnDModeSame").classList.toggle("selected", this.natureMode === "Same");
    document.getElementById("btnDModeVarious").classList.toggle("selected", this.natureMode === "Various");

    const wrap = document.getElementById("dDynamicItemsWrap");
    const rows = [];
    for (let i = 0; i < count; i++) {
      const prev = existingItems[i] || {};
      const numVal = prev.number || "";
      const natVal = prev.nature || "";
      const itemLabel = this.natureMode === "Various" && natVal ? natVal : nature;

      rows.push(`
        <div class="dynamic-item-row">
          <span class="badge primary" style="min-width:26px; text-align:center;">${i + 1}</span>
          ${count > 1 && this.natureMode === "Various"
            ? `<input type="text" class="d-item-nature" list="dNatureList" value="${natVal}" placeholder="Nature (e.g. Cheque)" style="max-width:125px;" />`
            : ""}
          <input type="text" class="d-item-number" value="${numVal}" placeholder="${itemLabel} No. #${i + 1}" />
        </div>
      `);
    }
    wrap.innerHTML = rows.join("");
  },

  collectDynamicItems() {
    const defaultNature = document.getElementById("dNature").value.trim() || "File";
    const rows = document.querySelectorAll("#dDynamicItemsWrap .dynamic-item-row");
    const items = [];
    rows.forEach(row => {
      const natInp = row.querySelector(".d-item-nature");
      const numInp = row.querySelector(".d-item-number");
      items.push({
        nature: (natInp && natInp.value.trim()) ? natInp.value.trim() : defaultNature,
        number: numInp ? numInp.value.trim() : ""
      });
    });
    return items;
  },

  formatItemsSummary(items, fallbackNature = "File") {
    if (!items || !items.length) return fallbackNature;
    return items.map((it, idx) => {
      const nat = it.nature || fallbackNature;
      return it.number ? `${nat} #${it.number}` : `${nat} (${idx + 1})`;
    }).join(", ");
  },

  renderAttachmentRows(existingAtts = []) {
    const count = Math.max(1, Math.min(20, parseInt(document.getElementById("dAttachCount").value || "1", 10)));
    const wrap = document.getElementById("dAttachRowsWrap");
    const rows = [];
    for (let i = 0; i < count; i++) {
      const prev = existingAtts[i] || {};
      rows.push(`
        <div class="dynamic-item-row">
          <span class="badge offline" style="min-width:26px; text-align:center;">${i + 1}</span>
          <input type="text" class="d-att-nature" list="dNatureList" value="${prev.nature || ""}" placeholder="Nature (e.g. Cheque, Bill)" style="max-width:140px;" />
          <input type="text" class="d-att-number" value="${prev.number || ""}" placeholder="No. / Ref" />
        </div>
      `);
    }
    wrap.innerHTML = rows.join("");
  },

  collectAttachments() {
    if (this.getToggle("dAttachToggleGroup") !== "Yes") return [];
    const rows = document.querySelectorAll("#dAttachRowsWrap .dynamic-item-row");
    const atts = [];
    rows.forEach(row => {
      const nat = row.querySelector(".d-att-nature").value.trim() || "Attachment";
      const num = row.querySelector(".d-att-number").value.trim();
      atts.push({ nature: nat, number: num });
    });
    return atts;
  },

  // =========================================================
  // SAVE STAGES 1, 2 & 3 ACROSS ALL 4 MODES
  // =========================================================
  async saveStage1() {
    const direction = this.getToggle("dDirectionGroup") || "Outward";
    const office = document.getElementById("dOfficeName").value.trim();
    if (!office) {
      showToast("Enter Office Name.");
      document.getElementById("dOfficeName").focus();
      return;
    }

    this.currentTask.Direction = direction;
    this.currentTask.Created_DateTime = document.getElementById("dCreatedDT").value || DateTimeHelper.nowLocalISO();
    this.currentTask.Office_Name = office;
    this.currentTask.Urgency = this.getToggle("dUrgencyGroup") || "Normal";

    if (direction === "Enquiry") {
      const enquirer = document.getElementById("dEnquirerName").value.trim();
      const enquiryText = document.getElementById("dEnquiryText").value.trim();
      if (!enquirer) {
        showToast("Enter Enquirer's Name.");
        document.getElementById("dEnquirerName").focus();
        return;
      }
      if (!enquiryText) {
        showToast("Enter the Enquiry details.");
        document.getElementById("dEnquiryText").focus();
        return;
      }
      this.currentTask.Enquirer_Name = enquirer;
      this.currentTask.Enquiry_Text = enquiryText;
      this.currentTask.Nature = "Enquiry";
      this.currentTask.Items_Summary = enquiryText.slice(0, 60);
    } else {
      const nature = document.getElementById("dNature").value.trim() || "File";
      const items = this.collectDynamicItems();
      const hasAtt = this.getToggle("dAttachToggleGroup") || "No";
      const atts = this.collectAttachments();

      this.currentTask.Designation = document.getElementById("dDesignation").value.trim();
      this.currentTask.Section = document.getElementById("dSection").value.trim();
      this.currentTask.Nature = nature;
      this.currentTask.Item_Count = items.length;
      this.currentTask.Nature_Mode = this.natureMode;
      this.currentTask.Items_JSON = JSON.stringify(items);
      this.currentTask.Items_Summary = this.formatItemsSummary(items, nature);
      this.currentTask.Description = document.getElementById("dDescription").value.trim();
      this.currentTask.Has_Attachments = hasAtt;
      this.currentTask.Attachment_Count = hasAtt === "Yes" ? atts.length : 0;
      this.currentTask.Attachments_JSON = JSON.stringify(atts);
      this.currentTask.Planned_Delivery_DT = direction === "Outward" ? document.getElementById("dPlannedDT").value : "";

      if (direction === "Round-Trip") {
        this.currentTask.RoundTrip_Purpose = document.getElementById("dRoundTripPurpose").value.trim();
        let stops = [];
        try { stops = JSON.parse(this.currentTask.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
        if (!stops.length || !stops[0].office) {
          this.currentTask.RoundTrip_Stops_JSON = JSON.stringify([{ office, action: "", dt: this.currentTask.Created_DateTime, officer: "" }]);
        }
      }
    }

    this.upsertLocalTask(this.currentTask);
    this.updateStageSummaries();
    await AppStore.pushAction("saveDelivery", this.currentTask);
    showToast("Stage 1 saved to Tasks ✓");
    this.collapseAllStages();
  },

  async saveStage2() {
    if (!this.currentTask.Office_Name) {
      if (!document.getElementById("dOfficeName").value.trim()) {
        showToast("Complete Stage 1 first.");
        return;
      }
      await this.saveStage1();
    }

    const dir = this.currentTask.Direction || "Outward";

    // MODE 1: ENQUIRY REPLY & REPORTING
    if (dir === "Enquiry") {
      const reply = document.getElementById("dReplyText").value.trim();
      if (!reply) {
        showToast("Enter the Reply received.");
        document.getElementById("dReplyText").focus();
        return;
      }
      const repStatus = this.getToggle("dEnquiryReportStatusGroup") || "Not Reported";
      const method = document.getElementById("dReportMethodInput").value.trim();

      if (repStatus === "Reported" && !method) {
        showToast("Select or enter Method of Reporting.");
        document.getElementById("dReportMethodInput").focus();
        return;
      }

      this.currentTask.Reply_Text = reply;
      this.currentTask.Reply_DateTime = document.getElementById("dReplyDT").value || DateTimeHelper.nowLocalISO();
      this.currentTask.Report_Status = repStatus;
      this.currentTask.Reported_DateTime = repStatus === "Reported"
        ? (document.getElementById("dEnquiryReportedDT").value || DateTimeHelper.nowLocalISO())
        : "";
      this.currentTask.Report_Method = repStatus === "Reported" ? method : "";
      this.currentTask.Stage2_Comments = document.getElementById("dEnquiryComments").value.trim();
      this.currentTask.Delivery_Status = "Delivered";

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);

      if (repStatus === "Reported") {
        showToast("Enquiry reported & moved to History ✓");
        this.collapseAllStages();
        this.switchSubView("history");
      } else {
        showToast("Reply saved — moved to Unreported until conveyed to Enquirer");
        this.collapseAllStages();
      }
      return;
    }

    // MODE 2: ROUND-TRIP MOVEMENT TRAIL
    if (dir === "Round-Trip") {
      const stops = this.collectRoundTripStops().filter(s => s.office || s.action);
      if (!stops.length) {
        showToast("Record at least 1 office stop.");
        return;
      }
      this.currentTask.RoundTrip_Stops_JSON = JSON.stringify(stops);
      this.currentTask.RoundTrip_Custody = this.getToggle("dRoundTripCustodyGroup") || "With Me / In Transit";
      this.currentTask.Stage2_Comments = document.getElementById("dRoundTripComments").value.trim();
      this.currentTask.Completed_DateTime = stops[stops.length - 1].dt || DateTimeHelper.nowLocalISO();
      if (this.currentTask.Delivery_Status !== "Returned") {
        this.currentTask.Delivery_Status = "In Progress";
      }

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);
      showToast("Office movement saved ✓ Open Stage 3 when returned to our office");
      this.openStage(3);
      return;
    }

    // MODE 3 & 4: OUTWARD DELIVERY & INWARD COLLECTION
    const status = this.getToggle("dStatusGroup");
    if (!status) {
      showToast("Select Delivered or Not Delivered.");
      return;
    }

    const reason = document.getElementById("dNotDelivReason").value.trim();
    if (status === "Not Delivered" && !reason) {
      showToast("Enter reason why it was not delivered.");
      document.getElementById("dNotDelivReason").focus();
      return;
    }

    const s2Receiver = document.getElementById("dStage2ReceiverName").value.trim();
    if (status === "Delivered" && !s2Receiver) {
      showToast("Enter Receiver's Name.");
      document.getElementById("dStage2ReceiverName").focus();
      return;
    }

    this.currentTask.Delivery_Status = status;
    this.currentTask.Not_Delivered_Reason = status === "Not Delivered" ? reason : "";
    this.currentTask.Completed_DateTime = document.getElementById("dCompletedDT").value || DateTimeHelper.nowLocalISO();
    this.currentTask.Stage2_Receiver_Name = s2Receiver;
    this.currentTask.Stage2_Comments = document.getElementById("dStage2Comments").value.trim();

    this.upsertLocalTask(this.currentTask);
    this.updateStageSummaries();
    await AppStore.pushAction("saveDelivery", this.currentTask);

    if (status === "Delivered" && dir === "Inward") {
      showToast("Collection handed over & moved to History ✓");
      this.collapseAllStages();
      this.switchSubView("history");
    } else if (status === "Delivered") {
      showToast("Delivered ✓ Proceed to Stage 3 for receipt handover");
      this.openStage(3);
    } else {
      showToast("Marked Not Delivered — remains in Tasks");
      this.collapseAllStages();
    }
  },

  async saveStage3() {
    const dir = this.currentTask.Direction || "Outward";

    // ROUND-TRIP FINAL RETURN TO OUR OFFICE
    if (dir === "Round-Trip") {
      const returnReceiver = document.getElementById("dRtReturnReceiverName").value.trim();
      if (!returnReceiver) {
        showToast("Enter who in our office received the returned document.");
        document.getElementById("dRtReturnReceiverName").focus();
        return;
      }
      this.currentTask.Delivery_Status = "Returned";
      this.currentTask.Receiver_Name = returnReceiver;
      this.currentTask.Reported_DateTime = document.getElementById("dRtReturnDT").value || DateTimeHelper.nowLocalISO();
      this.currentTask.RoundTrip_Custody = "Returned to Our Office";

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);
      showToast("Round-Trip completed & moved to History ✓");
      this.collapseAllStages();
      this.switchSubView("history");
      return;
    }

    // OUTWARD RECEIPT HANDOVER
    const given = this.getToggle("dReceiptGivenGroup");
    if (!given) {
      showToast("Select Yes or No for Receipt.");
      return;
    }

    const noReason = document.getElementById("dReceiptNoReason").value.trim();
    const receiver = document.getElementById("dReceiverName").value.trim();
    const repDT = document.getElementById("dReportedDT").value || DateTimeHelper.nowLocalISO();

    if (given === "No" && !noReason) {
      showToast("Enter reason why receipt was not given.");
      document.getElementById("dReceiptNoReason").focus();
      return;
    }
    if (given === "Yes" && !receiver) {
      showToast("Enter Receiver's Name.");
      document.getElementById("dReceiverName").focus();
      return;
    }

    if (this.currentTask.Delivery_Status !== "Delivered") {
      showToast("Mark Stage 2 as Delivered first.");
      this.openStage(2);
      return;
    }

    this.currentTask.Receipt_Given = given;
    this.currentTask.Receipt_No_Reason = given === "No" ? noReason : "";
    this.currentTask.Receiver_Name = given === "Yes" ? receiver : "";
    this.currentTask.Reported_DateTime = given === "Yes" ? repDT : DateTimeHelper.nowLocalISO();

    this.upsertLocalTask(this.currentTask);
    this.updateStageSummaries();
    await AppStore.pushAction("saveDelivery", this.currentTask);
    showToast("Task Reported & Moved to History ✓");
    this.collapseAllStages();
    this.switchSubView("history");
  },

  upsertLocalTask(taskObj) {
    const idx = AppStore.deliveries.findIndex(t => String(t.Task_ID) === String(taskObj.Task_ID));
    if (idx !== -1) AppStore.deliveries[idx] = { ...taskObj };
    else AppStore.deliveries.unshift({ ...taskObj });
  },

  // =========================================================
  // GROUP STAGE 3 REPORTING MODAL (OUTWARD RECEIPTS)
  // =========================================================
  openGroupReportModal() {
    if (!this.selectedUnrepIds.size) {
      showToast("Select at least 1 unreported task first.");
      return;
    }
    this.groupReportIds = [...this.selectedUnrepIds];
    const selectedTasks = this.groupReportIds
      .map(id => AppStore.deliveries.find(t => String(t.Task_ID) === String(id)))
      .filter(Boolean);

    const offices = [...new Set(selectedTasks.map(t => t.Office_Name).filter(Boolean))];
    document.getElementById("groupReportSummary").innerHTML = `
      <span class="som-strip-title">${selectedTasks.length} Task(s) Selected</span>
      <span class="small muted">${offices.slice(0, 2).join(", ")}${offices.length > 2 ? "..." : ""}</span>
    `;

    this.setToggle("grpReceiptGivenGroup", "");
    document.getElementById("grpReceiptNoBox").classList.add("hidden");
    document.getElementById("grpReceiptYesFields").classList.add("hidden");
    document.getElementById("grpReceiptNoReason").value = "";
    document.getElementById("grpReceiverName").value = "";
    const dtInp = document.getElementById("grpReportedDT");
    dtInp.value = DateTimeHelper.nowLocalISO();
    dtInp.max = dtInp.value;

    const noReasons = AppStore.rankByFrequency(
      AppStore.deliveries.map(t => t.Receipt_No_Reason),
      CONFIG.DEFAULT_RECEIPT_NO_REASONS
    ).slice(0, 5);
    document.getElementById("grpReceiptNoChips").innerHTML = noReasons.map(r =>
      `<button type="button" class="smart-chip" data-grpfill="grpReceiptNoReason" data-grpval="${r}">${r}</button>`
    ).join("");

    const receivers = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Receiver_Name)).slice(0, 6);
    document.getElementById("grpReceiverChips").innerHTML = receivers.map((n, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-grpfill="grpReceiverName" data-grpval="${n}">${n}</button>`
    ).join("");

    document.getElementById("groupReportModal").classList.remove("hidden");
  },

  async saveGroupReport() {
    const given = this.getToggle("grpReceiptGivenGroup");
    if (!given) {
      showToast("Select Yes or No for Receipt.");
      return;
    }

    const noReason = document.getElementById("grpReceiptNoReason").value.trim();
    const receiver = document.getElementById("grpReceiverName").value.trim();
    const repDT = document.getElementById("grpReportedDT").value || DateTimeHelper.nowLocalISO();

    if (given === "No" && !noReason) {
      showToast("Enter reason why receipt was not given.");
      document.getElementById("grpReceiptNoReason").focus();
      return;
    }
    if (given === "Yes" && !receiver) {
      showToast("Enter Receiver's Name.");
      document.getElementById("grpReceiverName").focus();
      return;
    }

    const updatedList = [];
    this.groupReportIds.forEach(id => {
      const t = AppStore.deliveries.find(x => String(x.Task_ID) === String(id));
      if (t) {
        t.Receipt_Given = given;
        t.Receipt_No_Reason = given === "No" ? noReason : "";
        t.Receiver_Name = given === "Yes" ? receiver : "";
        t.Reported_DateTime = given === "Yes" ? repDT : DateTimeHelper.nowLocalISO();
        updatedList.push({ ...t });
      }
    });

    this.groupReportIds = [];
    this.selectedUnrepIds.clear();
    document.getElementById("groupReportModal").classList.add("hidden");

    await AppStore.pushAction("saveDeliveryBatch", updatedList);
    showToast(`Reported ${updatedList.length} tasks → Moved to History ✓`);
    this.renderUnreportedTasks();
    this.switchSubView("history");
  },

  // =========================================================
  // SUMMARIES & LEARNED OPTIONS
  // =========================================================
  updateStageSummaries() {
    const t = this.currentTask;
    const dir = t.Direction || "Outward";
    const s1Done = Boolean(t.Office_Name && t.Created_DateTime);

    if (dir === "Enquiry") {
      document.getElementById("dSummary1").textContent = s1Done
        ? `Enquiry to ${t.Office_Name} (by ${t.Enquirer_Name || "Staff"})`
        : "Enquiry Details";
      const s2Done = Boolean(t.Reply_Text);
      document.getElementById("dSummary2").textContent = s2Done
        ? `Reply recorded • ${t.Report_Status || "Not Reported"}${t.Report_Method ? " via " + t.Report_Method : ""}`
        : "Reply & Reporting Status";
      document.getElementById("dCard1").classList.toggle("completed", s1Done);
      document.getElementById("dCard2").classList.toggle("completed", s2Done && t.Report_Status === "Reported");
      return;
    }

    if (dir === "Round-Trip") {
      document.getElementById("dSummary1").textContent = s1Done
        ? `${t.Office_Name} • ${t.Items_Summary || t.Nature}${t.RoundTrip_Purpose ? " (" + t.RoundTrip_Purpose + ")" : ""}`
        : "Document & First Office";
      let stops = [];
      try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
      const validStops = stops.filter(s => s.office);
      document.getElementById("dSummary2").textContent = validStops.length
        ? `${validStops.length} stop(s): ${validStops.map(s => s.office).join(" → ")}`
        : "Office Movement & Processing";
      const s3Done = t.Delivery_Status === "Returned";
      document.getElementById("dSummary3").textContent = s3Done
        ? `Returned to ${t.Receiver_Name} (${DateTimeHelper.formatShort(t.Reported_DateTime)})`
        : "Return Handover to Our Office";
      document.getElementById("dCard1").classList.toggle("completed", s1Done);
      document.getElementById("dCard2").classList.toggle("completed", validStops.length > 0 && Boolean(validStops[0].action));
      document.getElementById("dCard3").classList.toggle("completed", s3Done);
      return;
    }

    // Delivery / Collection
    document.getElementById("dSummary1").textContent = s1Done
      ? `${dir === "Inward" ? "From" : "To"} ${t.Office_Name} • ${t.Items_Summary || t.Nature} [${t.Urgency}]`
      : (dir === "Inward" ? "Collection Details" : "Delivery Details");
    document.getElementById("dCard1").classList.toggle("completed", s1Done);

    const s2Done = t.Delivery_Status === "Delivered";
    document.getElementById("dSummary2").textContent = t.Delivery_Status
      ? `${t.Delivery_Status}${t.Stage2_Receiver_Name ? " → " + t.Stage2_Receiver_Name : ""} (${DateTimeHelper.formatShort(t.Completed_DateTime)})`
      : "Delivery Status, Receiver & Time";
    document.getElementById("dCard2").classList.toggle("completed", s2Done);

    const s3Done = Boolean(t.Receipt_Given);
    document.getElementById("dSummary3").textContent = s3Done
      ? `Receipt: ${t.Receipt_Given}${t.Receiver_Name ? " (" + t.Receiver_Name + ")" : ""}`
      : "Receipt Handover & Receiver";
    document.getElementById("dCard3").classList.toggle("completed", s3Done);
  },

  refreshLearnedOptions() {
    const offices = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Office_Name), CONFIG.DEFAULT_OFFICES);
    const desigs = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Designation), CONFIG.DEFAULT_DESIGNATIONS);
    const sections = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Section), CONFIG.DEFAULT_SECTIONS);
    const natures = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Nature), CONFIG.DEFAULT_NATURES);

    document.getElementById("dOfficeList").innerHTML = offices.map(v => `<option value="${v}">`).join("");
    document.getElementById("dDesigList").innerHTML = desigs.map(v => `<option value="${v}">`).join("");
    document.getElementById("dSectionList").innerHTML = sections.map(v => `<option value="${v}">`).join("");
    document.getElementById("dNatureList").innerHTML = natures.map(v => `<option value="${v}">`).join("");

    document.getElementById("dOfficeChips").innerHTML = offices.slice(0, 5).map(v =>
      `<button type="button" class="smart-chip" data-dfill="dOfficeName" data-dval="${v}">${v}</button>`
    ).join("");
    document.getElementById("dDesigChips").innerHTML = desigs.slice(0, 5).map(v =>
      `<button type="button" class="smart-chip" data-dfill="dDesignation" data-dval="${v}">${v}</button>`
    ).join("");
    document.getElementById("dSectionChips").innerHTML = sections.slice(0, 5).map(v =>
      `<button type="button" class="smart-chip" data-dfill="dSection" data-dval="${v}">${v}</button>`
    ).join("");
    document.getElementById("dNatureChips").innerHTML = natures.slice(0, 6).map(v =>
      `<button type="button" class="smart-chip" data-dfill="dNature" data-dval="${v}">${v}</button>`
    ).join("");

    const prefixes = [];
    AppStore.deliveries.forEach(t => {
      try {
        JSON.parse(t.Items_JSON || "[]").forEach(it => {
          const m = String(it.number || "").match(/^([A-Za-z0-9\-/]+\/)\d+/);
          if (m) prefixes.push(m[1]);
        });
      } catch (e) {}
    });
    const topPatterns = AppStore.rankByFrequency(prefixes).slice(0, 4);
    document.getElementById("dPatternChips").innerHTML = topPatterns.map(p =>
      `<button type="button" class="smart-chip" data-dpattern="${p}">+ ${p}...</button>`
    ).join("");

    const notDelivReasons = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Not_Delivered_Reason), CONFIG.DEFAULT_NOT_DELIVERED_REASONS).slice(0, 5);
    document.getElementById("dNotDelivChips").innerHTML = notDelivReasons.map(r =>
      `<button type="button" class="smart-chip" data-dfill="dNotDelivReason" data-dval="${r}">${r}</button>`
    ).join("");

    // Our Office Staff Pool (for Enquirer, Collection Receiver, Receipt Receiver, Round-Trip Return Receiver)
    const ourStaff = AppStore.rankByFrequency([
      ...AppStore.deliveries.map(t => t.Enquirer_Name),
      ...AppStore.deliveries.map(t => t.Receiver_Name),
      ...AppStore.deliveries.filter(t => t.Direction === "Inward").map(t => t.Stage2_Receiver_Name)
    ]).slice(0, 6);

    document.getElementById("dEnquirerChips").innerHTML = ourStaff.map(n =>
      `<button type="button" class="smart-chip" data-dfill="dEnquirerName" data-dval="${n}">${n}</button>`
    ).join("");
    document.getElementById("dRtReturnReceiverChips").innerHTML = ourStaff.map(n =>
      `<button type="button" class="smart-chip" data-dfill="dRtReturnReceiverName" data-dval="${n}">${n}</button>`
    ).join("");

    const isInward = (this.currentTask && (this.currentTask.Direction || "Outward") === "Inward");
    const s2Pool = isInward
      ? ourStaff
      : AppStore.rankByFrequency(AppStore.deliveries.filter(t => (t.Direction || "Outward") === "Outward").map(t => t.Stage2_Receiver_Name)).slice(0, 6);
    document.getElementById("dStage2ReceiverChips").innerHTML = s2Pool.map((n, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-dfill="dStage2ReceiverName" data-dval="${n}">${n}</button>`
    ).join("");

    const recNoReasons = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Receipt_No_Reason), CONFIG.DEFAULT_RECEIPT_NO_REASONS).slice(0, 5);
    document.getElementById("dReceiptNoChips").innerHTML = recNoReasons.map(r =>
      `<button type="button" class="smart-chip" data-dfill="dReceiptNoReason" data-dval="${r}">${r}</button>`
    ).join("");

    document.getElementById("dReceiverChips").innerHTML = ourStaff.map((n, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-dfill="dReceiverName" data-dval="${n}">${n}</button>`
    ).join("");
  },

  // =========================================================
  // TASKS, UNREPORTED & NEWEST-FIRST HISTORY LISTS
  // =========================================================
  urgencyWeight(u) {
    if (u === "Very Urgent") return 3;
    if (u === "Urgent") return 2;
    return 1;
  },

  renderActiveTasks() {
    // Active tasks = not completed lifecycle AND not waiting solely in Unreported
    let active = AppStore.deliveries.filter(t => {
      if (this.isCompletedLifecycle(t)) return false;
      const dir = t.Direction || "Outward";
      if (dir === "Outward" && t.Delivery_Status === "Delivered" && !t.Receipt_Given) return false;
      if (dir === "Enquiry" && t.Reply_Text && t.Report_Status !== "Reported") return false;
      return true;
    });

    document.getElementById("dTasksCount").textContent = active.length;

    if (["Outward", "Inward", "Enquiry", "Round-Trip"].includes(this.urgencyFilter)) {
      active = active.filter(t => (t.Direction || "Outward") === this.urgencyFilter);
    } else if (this.urgencyFilter !== "ALL") {
      active = active.filter(t => t.Urgency === this.urgencyFilter);
    }

    active.sort((a, b) => {
      const uw = this.urgencyWeight(b.Urgency) - this.urgencyWeight(a.Urgency);
      if (uw !== 0) return uw;
      return String(a.Planned_Delivery_DT || a.Created_DateTime).localeCompare(String(b.Planned_Delivery_DT || b.Created_DateTime));
    });

    const wrap = document.getElementById("dActiveTasksList");
    if (!active.length) {
      wrap.innerHTML = `<div class="card muted small">No pending tasks.</div>`;
      return;
    }

    wrap.innerHTML = active.map(t => {
      const dir = t.Direction || "Outward";
      const uClass = t.Urgency === "Very Urgent" ? "urg-very" : t.Urgency === "Urgent" ? "urg-urgent" : "urg-normal";
      const cardClass = t.Urgency === "Very Urgent" ? "very-urgent" : t.Urgency === "Urgent" ? "urgent" : "";

      let subline = `${t.Items_Summary || t.Nature}${t.Section ? " • Sec: " + t.Section : ""}`;
      let nextBtnText = "Update Delivery →";
      let nextStage = 2;

      if (dir === "Inward") {
        nextBtnText = "Hand Over to Office →";
      } else if (dir === "Enquiry") {
        subline = `Enquirer: <strong>${t.Enquirer_Name}</strong> • ${t.Enquiry_Text}`;
        nextBtnText = "Enter Reply →";
      } else if (dir === "Round-Trip") {
        let stops = [];
        try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
        const validStops = stops.filter(s => s.office);
        subline = `${t.Items_Summary || t.Nature}${t.RoundTrip_Purpose ? " • " + t.RoundTrip_Purpose : ""}`;
        if (validStops.length && validStops[0].action) {
          nextBtnText = "Return to Office (S3) →";
          nextStage = 3;
        } else {
          nextBtnText = "Log Office Stop →";
        }
      }

      return `
        <div class="history-item ${cardClass}">
          <div class="row-between">
            <div>
              ${this.getDirectionBadgeHTML(dir)}
              <strong style="margin-left:4px;">${t.Office_Name}</strong>
            </div>
            <span class="urgency-badge ${uClass}">${t.Urgency}</span>
          </div>
          <div class="small mt-6">${subline}</div>
          ${t.Description ? `<div class="small muted mt-6">${t.Description}</div>` : ""}
          <div class="small muted mt-6">
            ${dir === "Round-Trip" ? `Custody: <strong>${t.RoundTrip_Custody || "With Me"}</strong> • ` : ""}
            ${DateTimeHelper.formatShort(t.Created_DateTime)}
          </div>
          ${t.Delivery_Status === "Not Delivered" ? `<div class="exception-pill">Not Delivered: ${t.Not_Delivered_Reason}</div>` : ""}
          <div class="row-between mt-8">
            <button type="button" class="btn-mini" data-load-dtask="${t.Task_ID}" data-dopen-stage="1">Edit</button>
            <button type="button" class="btn-mini accent" data-load-dtask="${t.Task_ID}" data-dopen-stage="${nextStage}">${nextBtnText}</button>
          </div>
        </div>`;
    }).join("");
  },

  renderUnreportedTasks() {
    // Includes Outward delivered tasks awaiting receipt handover + Enquiries with reply awaiting reporting to Enquirer
    const unrep = AppStore.deliveries.filter(t => {
      const dir = t.Direction || "Outward";
      if (dir === "Outward" && t.Delivery_Status === "Delivered" && !t.Receipt_Given) return true;
      if (dir === "Enquiry" && t.Reply_Text && t.Report_Status !== "Reported") return true;
      return false;
    });
    document.getElementById("dUnrepCount").textContent = unrep.length;
    document.getElementById("dSelectedUnrepCount").textContent = this.selectedUnrepIds.size;

    const wrap = document.getElementById("dUnreportedTasksList");
    if (!unrep.length) {
      wrap.innerHTML = `<div class="card muted small">No unreported deliveries or enquiries.</div>`;
      return;
    }

    wrap.innerHTML = unrep.map(t => {
      const dir = t.Direction || "Outward";
      const checked = this.selectedUnrepIds.has(t.Task_ID);
      const isEnq = dir === "Enquiry";
      return `
        <div class="history-item ${checked ? "checked" : ""}">
          <div class="row-between">
            <label class="row-gap" style="margin:0; cursor:pointer; flex:1;">
              ${!isEnq ? `<input type="checkbox" data-unrep-chk="${t.Task_ID}" ${checked ? "checked" : ""} style="width:18px; height:18px;" />` : ""}
              ${this.getDirectionBadgeHTML(dir)}
              <strong>${t.Office_Name}</strong>
            </label>
            <button type="button" class="btn-mini accent" data-load-dtask="${t.Task_ID}" data-dopen-stage="${isEnq ? 2 : 3}">
              ${isEnq ? "Report Reply →" : "Report Receipt →"}
            </button>
          </div>
          <div class="small mt-6">
            ${isEnq
              ? `Enquirer: <strong>${t.Enquirer_Name}</strong> • Reply: ${t.Reply_Text}`
              : `${t.Items_Summary || t.Nature}${t.Stage2_Receiver_Name ? ` • Received by: <strong>${t.Stage2_Receiver_Name}</strong>` : ""}`}
          </div>
        </div>`;
    }).join("");
  },

  historyTimestamp(t) {
    return DateTimeHelper.timestampMs(t.Reported_DateTime || t.Completed_DateTime || t.Reply_DateTime || t.Created_DateTime, t.Task_ID);
  },

  renderHistory() {
    const completed = AppStore.deliveries.filter(t => this.isCompletedLifecycle(t));

    this.populateSelectFilter("dHistoryFilterOffice", completed.map(t => t.Office_Name), "Office: All");
    this.populateSelectFilter("dHistoryFilterNature", completed.map(t => t.Nature), "Nature: All");
    this.populateSelectFilter("dHistoryFilterDesig", completed.map(t => t.Designation), "Designation: All");
    const allPeople = completed.flatMap(t => [t.Stage2_Receiver_Name, t.Receiver_Name, t.Enquirer_Name]).filter(Boolean);
    this.populateSelectFilter("dHistoryFilterReceiver", allPeople, "Receiver / Enquirer: All");

    const q = document.getElementById("dHistorySearch").value.trim().toLowerCase();
    const sortBy = document.getElementById("dHistorySort").value;
    const fDir = document.getElementById("dHistoryFilterDirection").value;
    const fStatus = document.getElementById("dHistoryFilterStatus").value;
    const fOffice = document.getElementById("dHistoryFilterOffice").value;
    const fNature = document.getElementById("dHistoryFilterNature").value;
    const fDesig = document.getElementById("dHistoryFilterDesig").value;
    const fReceiver = document.getElementById("dHistoryFilterReceiver").value;
    const dFrom = document.getElementById("dHistoryDateFrom").value;
    const dTo = document.getElementById("dHistoryDateTo").value;

    let list = [...completed];
    if (fDir !== "ALL") list = list.filter(t => (t.Direction || "Outward") === fDir);
    if (fStatus === "GIVEN") list = list.filter(t => t.Receipt_Given === "Yes");
    if (fStatus === "NOT_GIVEN") list = list.filter(t => t.Receipt_Given === "No");
    if (fOffice !== "ALL") list = list.filter(t => t.Office_Name === fOffice);
    if (fNature !== "ALL") list = list.filter(t => t.Nature === fNature);
    if (fDesig !== "ALL") list = list.filter(t => t.Designation === fDesig);
    if (fReceiver !== "ALL") list = list.filter(t => t.Stage2_Receiver_Name === fReceiver || t.Receiver_Name === fReceiver || t.Enquirer_Name === fReceiver);
    if (dFrom) list = list.filter(t => (t.Completed_DateTime || t.Reply_DateTime || t.Created_DateTime || "").slice(0, 10) >= dFrom);
    if (dTo) list = list.filter(t => (t.Completed_DateTime || t.Reply_DateTime || t.Created_DateTime || "").slice(0, 10) <= dTo);

    if (q) {
      list = list.filter(t => [
        t.Office_Name, t.Designation, t.Section, t.Nature, t.Items_Summary,
        t.Description, t.Stage2_Comments, t.Stage2_Receiver_Name, t.Receiver_Name,
        t.Enquirer_Name, t.Enquiry_Text, t.Reply_Text, t.RoundTrip_Purpose, t.RoundTrip_Stops_JSON
      ].filter(Boolean).join(" ").toLowerCase().includes(q));
    }

    if (sortBy === "OLDEST") list.sort((a, b) => this.historyTimestamp(a) - this.historyTimestamp(b));
    else if (sortBy === "OFFICE") list.sort((a, b) => String(a.Office_Name).localeCompare(String(b.Office_Name)));
    else if (sortBy === "NATURE") list.sort((a, b) => String(a.Nature).localeCompare(String(b.Nature)));
    else list.sort((a, b) => this.historyTimestamp(b) - this.historyTimestamp(a));

    document.getElementById("dHistoryCountLabel").textContent = `${list.length} completed record(s)`;
    const wrap = document.getElementById("dHistoryList");
    if (!list.length) {
      wrap.innerHTML = `<div class="card muted small">No matching completed records.</div>`;
      return;
    }

    wrap.innerHTML = list.map(t => {
      const dir = t.Direction || "Outward";
      let summaryLine = `${t.Items_Summary || t.Nature}${t.Section ? " • " + t.Section : ""}`;
      let metaLine = "";

      if (dir === "Enquiry") {
        summaryLine = `Enquirer: <strong>${t.Enquirer_Name}</strong> • ${t.Enquiry_Text}`;
        metaLine = `Reply: ${t.Reply_Text} • Reported via <strong>${t.Report_Method || "Direct"}</strong> (${DateTimeHelper.formatShort(t.Reported_DateTime)})`;
      } else if (dir === "Round-Trip") {
        let stops = [];
        try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
        const route = stops.filter(s => s.office).map(s => s.office).join(" → ");
        metaLine = `Route: ${route || t.Office_Name} • Returned to: <strong>${t.Receiver_Name}</strong> (${DateTimeHelper.formatShort(t.Reported_DateTime)})`;
      } else if (dir === "Inward") {
        metaLine = `Collected: ${DateTimeHelper.formatShort(t.Created_DateTime)} • Handed over: ${DateTimeHelper.formatShort(t.Completed_DateTime)} → <strong>${t.Stage2_Receiver_Name || "—"}</strong>`;
      } else {
        metaLine = `Delivered: ${DateTimeHelper.formatShort(t.Completed_DateTime)}${t.Stage2_Receiver_Name ? ` → <strong>${t.Stage2_Receiver_Name}</strong>` : ""}${t.Receiver_Name ? ` • Receipt to: <strong>${t.Receiver_Name}</strong>` : ""}`;
      }

      return `
        <div class="history-item">
          <div class="row-between">
            <div>
              ${this.getDirectionBadgeHTML(dir)}
              <strong style="margin-left:4px;">${t.Office_Name}</strong>
            </div>
            <button type="button" class="btn-mini accent" data-inspect-dtask="${t.Task_ID}">View</button>
          </div>
          <div class="small mt-6">${summaryLine}</div>
          <div class="small muted mt-6">${metaLine}</div>
        </div>`;
    }).join("");
  },

  populateSelectFilter(selectId, rawValues, defaultLabel) {
    const sel = document.getElementById(selectId);
    const current = sel.value;
    const unique = [...new Set(rawValues.filter(Boolean))].sort();
    sel.innerHTML = `<option value="ALL">${defaultLabel}</option>` + unique.map(v => `<option value="${v}">${v}</option>`).join("");
    if (unique.includes(current)) sel.value = current;
  },

  // =========================================================
  // READ-ONLY REPORT MODAL, EDIT WARNING & SINGLE DELETE WARNING
  // =========================================================
  openReportModal(taskId) {
    const t = AppStore.deliveries.find(x => String(x.Task_ID) === String(taskId));
    if (!t) return;
    this.inspectingTaskId = taskId;
    const dir = t.Direction || "Outward";

    let atts = [];
    try { atts = JSON.parse(t.Attachments_JSON || "[]"); } catch (e) {}

    let rowsHTML = "";
    if (dir === "Enquiry") {
      rowsHTML = `
        <div class="report-row"><span class="report-lbl">Task Type</span><span class="report-val">🔍 Office Enquiry</span></div>
        <div class="report-row"><span class="report-lbl">Date & Time</span><span class="report-val">${DateTimeHelper.formatShort(t.Created_DateTime)}</span></div>
        <div class="report-row"><span class="report-lbl">Enquirer</span><span class="report-val">${t.Enquirer_Name || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">To Office</span><span class="report-val">${t.Office_Name}</span></div>
        <div class="report-row"><span class="report-lbl">Enquiry</span><span class="report-val">${t.Enquiry_Text || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Reply</span><span class="report-val">${t.Reply_Text || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Reply Time</span><span class="report-val">${DateTimeHelper.formatShort(t.Reply_DateTime) || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Report Status</span><span class="report-val">${t.Report_Status || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Reported Time</span><span class="report-val">${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Method</span><span class="report-val">${t.Report_Method || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Comments</span><span class="report-val">${t.Stage2_Comments || "—"}</span></div>
      `;
    } else if (dir === "Round-Trip") {
      let stops = [];
      try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
      const stopsText = stops.filter(s => s.office).map((s, i) =>
        `#${i + 1} ${s.office}${s.action ? " (" + s.action + ")" : ""}${s.officer ? " • " + s.officer : ""} [${DateTimeHelper.formatShort(s.dt)}]`
      ).join("<br/>");

      rowsHTML = `
        <div class="report-row"><span class="report-lbl">Task Type</span><span class="report-val">🔄 Round-Trip</span></div>
        <div class="report-row"><span class="report-lbl">First Office</span><span class="report-val">${t.Office_Name}</span></div>
        <div class="report-row"><span class="report-lbl">Section</span><span class="report-val">${t.Section || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Purpose</span><span class="report-val">${t.RoundTrip_Purpose || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Items (${t.Item_Count})</span><span class="report-val">${t.Items_Summary || t.Nature}</span></div>
        <div class="report-row"><span class="report-lbl">Attachments</span><span class="report-val">${t.Has_Attachments === "Yes" ? atts.map(a => `${a.nature} ${a.number}`).join(", ") : "None"}</span></div>
        <div class="report-row"><span class="report-lbl">Movement Trail</span><span class="report-val">${stopsText || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Returned To</span><span class="report-val">${t.Receiver_Name || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Return Time</span><span class="report-val">${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Comments</span><span class="report-val">${t.Stage2_Comments || "—"}</span></div>
      `;
    } else {
      const isInward = dir === "Inward";
      rowsHTML = `
        <div class="report-row"><span class="report-lbl">Task Type</span><span class="report-val">${isInward ? "📥 Collection" : "📤 Delivery"}</span></div>
        <div class="report-row"><span class="report-lbl">${isInward ? "From Office" : "To Office"}</span><span class="report-val">${t.Office_Name}</span></div>
        <div class="report-row"><span class="report-lbl">Designation</span><span class="report-val">${t.Designation || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">${isInward ? "Receiving Section" : "Section"}</span><span class="report-val">${t.Section || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Items (${t.Item_Count})</span><span class="report-val">${t.Items_Summary || t.Nature}</span></div>
        <div class="report-row"><span class="report-lbl">Description</span><span class="report-val">${t.Description || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Attachments</span><span class="report-val">${t.Has_Attachments === "Yes" ? atts.map(a => `${a.nature} ${a.number}`).join(", ") : "None"}</span></div>
        <div class="report-row"><span class="report-lbl">Urgency</span><span class="report-val">${t.Urgency}</span></div>
        <div class="report-row"><span class="report-lbl">${isInward ? "Collected Time" : "Created Time"}</span><span class="report-val">${DateTimeHelper.formatShort(t.Created_DateTime)}</span></div>
        <div class="report-row"><span class="report-lbl">${isInward ? "Handed Over Time" : "Delivered Time"}</span><span class="report-val">${DateTimeHelper.formatShort(t.Completed_DateTime)}</span></div>
        <div class="report-row"><span class="report-lbl">Receiver's Name</span><span class="report-val">${t.Stage2_Receiver_Name || "—"}</span></div>
        <div class="report-row"><span class="report-lbl">Comments</span><span class="report-val">${t.Stage2_Comments || "—"}</span></div>
        ${!isInward ? `
          <div class="report-row"><span class="report-lbl">Receipt Given</span><span class="report-val">${t.Receipt_Given} ${t.Receipt_No_Reason ? "(" + t.Receipt_No_Reason + ")" : ""}</span></div>
          <div class="report-row"><span class="report-lbl">Receipt Receiver</span><span class="report-val">${t.Receiver_Name || "—"}</span></div>
          <div class="report-row"><span class="report-lbl">Reported Time</span><span class="report-val">${DateTimeHelper.formatShort(t.Reported_DateTime)}</span></div>
        ` : ""}
      `;
    }

    document.getElementById("deliveryReportBody").innerHTML = `<div class="report-grid">${rowsHTML}</div>`;

    document.getElementById("deliveryEditWarningBox").classList.add("hidden");
    document.getElementById("deliveryDeleteWarningBox").classList.add("hidden");
    document.getElementById("deliveryReportFooter").classList.remove("hidden");
    document.getElementById("deliveryReportModal").classList.remove("hidden");
  },

  async deleteSingleDelivery(taskId) {
    const idx = AppStore.deliveries.findIndex(t => String(t.Task_ID) === String(taskId));
    if (idx === -1) return;
    const removed = AppStore.deliveries[idx];
    AppStore.deliveries.splice(idx, 1);

    await AppStore.pushAction("deleteDelivery", { Task_ID: removed.Task_ID });
    this.renderActiveTasks();
    this.renderUnreportedTasks();
    this.renderHistory();
    showToast(`Deleted record (${removed.Office_Name})`);
  },

  setToggle(groupId, val) {
    document.querySelectorAll(`#${groupId} button`).forEach(b => b.classList.toggle("selected", b.dataset.val === val));
  },

  getToggle(groupId) {
    const sel = document.querySelector(`#${groupId} button.selected`);
    return sel ? sel.dataset.val : "";
  },

  bindEvents() {
    document.querySelectorAll("[data-dsub]").forEach(btn => {
      btn.addEventListener("click", () => this.switchSubView(btn.dataset.dsub));
    });

    document.querySelectorAll("[data-dstage]").forEach(hdr => {
      hdr.addEventListener("click", () => {
        const n = parseInt(hdr.dataset.dstage, 10);
        const body = document.getElementById(`dBody${n}`);
        if (!body.classList.contains("collapsed") && !this.allExpanded) {
          this.collapseAllStages();
        } else {
          this.openStage(n);
        }
      });
    });

    document.getElementById("btnNewDelivery").addEventListener("click", () => {
      this.startNewTask(true);
      this.openStage(1);
    });
    document.getElementById("btnToggleExpandAllDelivery").addEventListener("click", () => this.toggleExpandAll());

    document.querySelectorAll("#dDirectionGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        const dir = btn.dataset.val;
        this.currentTask.Direction = dir;
        this.applyDirectionUI(dir);
        this.updateStageSummaries();
        this.refreshLearnedOptions();
      });
    });

    // Enquiry Stage 2 Report Status & Method Pills
    document.querySelectorAll("#dEnquiryReportStatusGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("dEnquiryReportStatusGroup", btn.dataset.val);
        const isRep = btn.dataset.val === "Reported";
        document.getElementById("dEnquiryReportedDetails").classList.toggle("hidden", !isRep);
        if (isRep && !document.getElementById("dEnquiryReportedDT").value) {
          document.getElementById("dEnquiryReportedDT").value = DateTimeHelper.nowLocalISO();
        }
      });
    });
    document.querySelectorAll("[data-rmethod]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.getElementById("dReportMethodInput").value = btn.dataset.rmethod;
      });
    });

    // Round-Trip Stage 2 Add/Remove Stops & Custody
    document.getElementById("btnAddRoundTripStop").addEventListener("click", () => {
      const stops = this.collectRoundTripStops();
      stops.push({ office: "", action: "Signed", dt: DateTimeHelper.nowLocalISO(), officer: "" });
      this.renderRoundTripStops(stops);
    });
    document.getElementById("dRoundTripStopsList").addEventListener("click", (e) => {
      if (e.target.dataset.rmRtstop !== undefined) {
        const idx = parseInt(e.target.dataset.rmRtstop, 10);
        const stops = this.collectRoundTripStops();
        stops.splice(idx, 1);
        this.renderRoundTripStops(stops);
      }
    });
    document.querySelectorAll("#dRoundTripCustodyGroup button").forEach(btn => {
      btn.addEventListener("click", () => this.setToggle("dRoundTripCustodyGroup", btn.dataset.val));
    });

    document.getElementById("dNature").addEventListener("input", () => this.renderDynamicItems(this.collectDynamicItems()));
    document.getElementById("btnDCountPlus").addEventListener("click", () => {
      const inp = document.getElementById("dItemCount");
      inp.value = Math.min(30, parseInt(inp.value || "1", 10) + 1);
      this.renderDynamicItems(this.collectDynamicItems());
    });
    document.getElementById("btnDCountMinus").addEventListener("click", () => {
      const inp = document.getElementById("dItemCount");
      inp.value = Math.max(1, parseInt(inp.value || "1", 10) - 1);
      this.renderDynamicItems(this.collectDynamicItems());
    });
    document.getElementById("dItemCount").addEventListener("input", () => this.renderDynamicItems(this.collectDynamicItems()));

    document.getElementById("btnDModeSame").addEventListener("click", () => {
      this.natureMode = "Same";
      this.renderDynamicItems(this.collectDynamicItems());
    });
    document.getElementById("btnDModeVarious").addEventListener("click", () => {
      this.natureMode = "Various";
      this.renderDynamicItems(this.collectDynamicItems());
    });

    document.querySelectorAll("#dAttachToggleGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("dAttachToggleGroup", btn.dataset.val);
        const show = btn.dataset.val === "Yes";
        document.getElementById("dAttachmentsBox").classList.toggle("hidden", !show);
        if (show) this.renderAttachmentRows(this.collectAttachments());
      });
    });
    document.getElementById("btnDAttachPlus").addEventListener("click", () => {
      const inp = document.getElementById("dAttachCount");
      inp.value = Math.min(20, parseInt(inp.value || "1", 10) + 1);
      this.renderAttachmentRows(this.collectAttachments());
    });
    document.getElementById("btnDAttachMinus").addEventListener("click", () => {
      const inp = document.getElementById("dAttachCount");
      inp.value = Math.max(1, parseInt(inp.value || "1", 10) - 1);
      this.renderAttachmentRows(this.collectAttachments());
    });

    const setTodayHour = (hr) => {
      const d = new Date();
      d.setHours(hr, 0, 0, 0);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      document.getElementById("dPlannedDT").value = d.toISOString().slice(0, 16);
    };
    document.getElementById("btnDPlanToday3PM").addEventListener("click", () => setTodayHour(15));
    document.getElementById("btnDPlanToday5PM").addEventListener("click", () => setTodayHour(17));

    document.querySelectorAll("#dUrgencyGroup button").forEach(btn => {
      btn.addEventListener("click", () => this.setToggle("dUrgencyGroup", btn.dataset.val));
    });

    document.querySelectorAll("#dStatusGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("dStatusGroup", btn.dataset.val);
        document.getElementById("dNotDeliveredBox").classList.toggle("hidden", btn.dataset.val !== "Not Delivered");
      });
    });

    document.querySelectorAll("#dReceiptGivenGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("dReceiptGivenGroup", btn.dataset.val);
        document.getElementById("dReceiptNoBox").classList.toggle("hidden", btn.dataset.val !== "No");
        document.getElementById("dReceiptYesFields").classList.toggle("hidden", btn.dataset.val !== "Yes");
      });
    });

    document.getElementById("btnSaveDStage1").addEventListener("click", () => this.saveStage1());
    document.getElementById("btnSaveDStage2").addEventListener("click", () => this.saveStage2());
    document.getElementById("btnSaveDStage3").addEventListener("click", () => this.saveStage3());

    document.getElementById("view-delivery").addEventListener("click", (e) => {
      if (e.target.dataset.dfill) {
        const el = document.getElementById(e.target.dataset.dfill);
        el.value = e.target.dataset.dval;
        if (e.target.dataset.dfill === "dNature") this.renderDynamicItems(this.collectDynamicItems());
      }
      if (e.target.dataset.dpattern) {
        const firstEmpty = [...document.querySelectorAll(".d-item-number")].find(i => !i.value.trim()) || document.querySelector(".d-item-number");
        if (firstEmpty) {
          firstEmpty.value = e.target.dataset.dpattern;
          firstEmpty.focus();
        }
      }
      if (e.target.dataset.durg) {
        document.querySelectorAll("[data-durg]").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        this.urgencyFilter = e.target.dataset.durg;
        this.renderActiveTasks();
      }
      if (e.target.dataset.loadDtask) {
        this.loadTask(e.target.dataset.loadDtask, parseInt(e.target.dataset.dopenStage || "1", 10));
      }
      if (e.target.dataset.inspectDtask) {
        this.openReportModal(e.target.dataset.inspectDtask);
      }
    });

    document.getElementById("btnSortTasksAuto").addEventListener("click", () => {
      this.urgencyFilter = "ALL";
      document.querySelectorAll("[data-durg]").forEach(b => b.classList.toggle("active", b.dataset.durg === "ALL"));
      this.renderActiveTasks();
      showToast("Sorted by Urgency & Time");
    });

    document.getElementById("dUnreportedTasksList").addEventListener("change", (e) => {
      if (e.target.dataset.unrepChk) {
        if (e.target.checked) this.selectedUnrepIds.add(e.target.dataset.unrepChk);
        else this.selectedUnrepIds.delete(e.target.dataset.unrepChk);
        this.renderUnreportedTasks();
      }
    });
    document.getElementById("btnSelectAllUnrep").addEventListener("click", () => {
      AppStore.deliveries
        .filter(t => (t.Direction || "Outward") === "Outward" && t.Delivery_Status === "Delivered" && !t.Receipt_Given)
        .forEach(t => this.selectedUnrepIds.add(t.Task_ID));
      this.renderUnreportedTasks();
    });
    document.getElementById("btnBatchReportUnrep").addEventListener("click", () => {
      this.openGroupReportModal();
    });
    document.getElementById("btnCancelBatchReport").addEventListener("click", () => {
      this.batchReportIds = [];
      document.getElementById("dBatchReportBanner").classList.add("hidden");
    });

    document.querySelectorAll("#grpReceiptGivenGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("grpReceiptGivenGroup", btn.dataset.val);
        document.getElementById("grpReceiptNoBox").classList.toggle("hidden", btn.dataset.val !== "No");
        document.getElementById("grpReceiptYesFields").classList.toggle("hidden", btn.dataset.val !== "Yes");
      });
    });
    document.getElementById("groupReportModal").addEventListener("click", (e) => {
      if (e.target.dataset.grpfill) {
        document.getElementById(e.target.dataset.grpfill).value = e.target.dataset.grpval;
      }
    });
    document.getElementById("btnCloseGroupReport").addEventListener("click", () => {
      document.getElementById("groupReportModal").classList.add("hidden");
    });
    document.getElementById("btnSaveGroupReport").addEventListener("click", () => {
      this.saveGroupReport();
    });

    ["dHistorySearch", "dHistorySort", "dHistoryFilterDirection", "dHistoryFilterStatus", "dHistoryFilterOffice", "dHistoryFilterNature", "dHistoryFilterDesig", "dHistoryFilterReceiver", "dHistoryDateFrom", "dHistoryDateTo"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", () => this.renderHistory());
        el.addEventListener("change", () => this.renderHistory());
      }
    });
    document.getElementById("btnResetDHistoryFilters").addEventListener("click", () => {
      document.getElementById("dHistorySearch").value = "";
      document.getElementById("dHistorySort").value = "NEWEST";
      document.getElementById("dHistoryFilterDirection").value = "ALL";
      document.getElementById("dHistoryFilterStatus").value = "ALL";
      document.getElementById("dHistoryFilterOffice").value = "ALL";
      document.getElementById("dHistoryFilterNature").value = "ALL";
      document.getElementById("dHistoryFilterDesig").value = "ALL";
      document.getElementById("dHistoryFilterReceiver").value = "ALL";
      document.getElementById("dHistoryDateFrom").value = "";
      document.getElementById("dHistoryDateTo").value = "";
      this.renderHistory();
    });

    document.getElementById("btnCloseDeliveryReport").addEventListener("click", () => document.getElementById("deliveryReportModal").classList.add("hidden"));
    document.getElementById("btnCloseDeliveryReport2").addEventListener("click", () => document.getElementById("deliveryReportModal").classList.add("hidden"));

    document.getElementById("btnRequestEditHistory").addEventListener("click", () => {
      document.getElementById("deliveryEditWarningBox").classList.remove("hidden");
      document.getElementById("deliveryDeleteWarningBox").classList.add("hidden");
      document.getElementById("deliveryReportFooter").classList.add("hidden");
    });
    document.getElementById("btnCancelHistoryEditWarn").addEventListener("click", () => {
      document.getElementById("deliveryEditWarningBox").classList.add("hidden");
      document.getElementById("deliveryReportFooter").classList.remove("hidden");
    });
    document.getElementById("btnConfirmUnlockHistoryEdit").addEventListener("click", () => {
      document.getElementById("deliveryReportModal").classList.add("hidden");
      if (this.inspectingTaskId) this.loadTask(this.inspectingTaskId, 1);
      showToast("Unlocked for editing");
    });

    document.getElementById("btnRequestDeleteHistory").addEventListener("click", () => {
      document.getElementById("deliveryDeleteWarningBox").classList.remove("hidden");
      document.getElementById("deliveryEditWarningBox").classList.add("hidden");
      document.getElementById("deliveryReportFooter").classList.add("hidden");
    });
    document.getElementById("btnCancelHistoryDeleteWarn").addEventListener("click", () => {
      document.getElementById("deliveryDeleteWarningBox").classList.add("hidden");
      document.getElementById("deliveryReportFooter").classList.remove("hidden");
    });
    document.getElementById("btnConfirmDeleteHistory").addEventListener("click", async () => {
      document.getElementById("deliveryReportModal").classList.add("hidden");
      if (this.inspectingTaskId) {
        await this.deleteSingleDelivery(this.inspectingTaskId);
        this.inspectingTaskId = null;
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => DeliveryModule.init());
