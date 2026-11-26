const DeliveryModule = {
  currentTask: null,
  natureMode: "Same",
  scheduledDirFilter: "OUTWARD",
  selectedUnrepIds: new Set(),
  batchReportIds: [],
  groupReportIds: [],
  inspectingTaskId: null,
  allExpanded: false,
  filtersOpen: false,

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

  isNilCollection(t) {
    return (t.Direction || "Outward") === "Inward" && (t.Nature === "Nil Visit" || Number(t.Item_Count) === 0);
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
      return t.Delivery_Status === "Returned" && Boolean(t.Receipt_Given);
    }
    return t.Delivery_Status === "Delivered" && Boolean(t.Receipt_Given);
  },

  getDirectionBadgeHTML(t) {
    const d = t.Direction || "Outward";
    if (d === "Inward") {
      if (this.isNilCollection(t)) {
        return `<span class="badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;">📥 Nil Visit</span>`;
      }
      return `<span class="badge" style="background:#ccfbf1; color:#0f766e;">📥 Collection</span>`;
    }
    if (d === "Enquiry") return `<span class="badge" style="background:#fef3c7; color:#92400e;">🔍 Enquiry</span>`;
    if (d === "Round-Trip") return `<span class="badge" style="background:#ede9fe; color:#5b21b6;">🔄 Round-Trip</span>`;
    return `<span class="badge primary">📤 Delivery</span>`;
  },

  // Builds Row 2: one strict single-line row per file/doc/enquiry ({Serial}, {File No.} - {Description})
  buildItemLinesHTML(t) {
    const dir = t.Direction || "Outward";
    const legacyDesc = String(t.Description || "").trim();

    if (this.isNilCollection(t)) {
      const txt = legacyDesc ? `1. Nil - ${legacyDesc}` : `1. Nil (No documents)`;
      return `<div class="card-line small"><span class="card-line-text">${txt}</span></div>`;
    }

    if (dir === "Enquiry") {
      let enqs = [];
      try { enqs = JSON.parse(t.Enquiries_JSON || "[]"); } catch (e) {}
      const valid = enqs.filter(e => e && String(e.question || "").trim());
      if (valid.length) {
        return valid.map((e, idx) =>
          `<div class="card-line small"><span class="card-line-text">${idx + 1}. ${String(e.question).trim()}</span></div>`
        ).join("");
      }
      return `<div class="card-line small"><span class="card-line-text">1. ${t.Enquiry_Text || "Enquiry"}</span></div>`;
    }

    let items = [];
    try { items = JSON.parse(t.Items_JSON || "[]"); } catch (e) {}
    if (!items.length) {
      items = [{ nature: t.Nature || "File", number: "", description: legacyDesc }];
    }

    return items.map((it, idx) => {
      const nat = String(it.nature || t.Nature || "File").trim();
      const num = String(it.number || "").trim();
      const itemDesc = String(it.description !== undefined ? it.description : legacyDesc).trim();
      const filePart = num ? `${nat} #${num}` : nat;
      const lineText = itemDesc ? `${idx + 1}. ${filePart} - ${itemDesc}` : `${idx + 1}. ${filePart}`;
      return `<div class="card-line small"><span class="card-line-text">${lineText}</span></div>`;
    }).join("");
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

    document.getElementById("dSchedulingInstruction").textContent = isExisting
      ? `Editing ${dirTitles[dir]}: ${this.currentTask.Office_Name || "Task"}`
      : "Choose the task type";
    document.getElementById("btnNewDelivery").classList.toggle("hidden", !isExisting);

    document.getElementById("dCollectionModeGroup").classList.toggle("hidden", !isInward);

    document.getElementById("dEnquiryStage1Wrap").classList.toggle("hidden", !isEnquiry);
    document.getElementById("dDocumentStage1Wrap").classList.toggle("hidden", isEnquiry);

    if (isEnquiry) {
      document.getElementById("dTitle1").textContent = "Enquiry";
      document.getElementById("lblDCreatedDT").textContent = "1. Date & Time";
      document.getElementById("lblDUrgency").textContent = "5. Urgency Scale";
      document.getElementById("dUrgencyFieldGroup").classList.remove("hidden");
      document.getElementById("btnSaveDStage1").textContent = "Save Enquiry";
    } else if (isRoundTrip) {
      document.getElementById("dTitle1").textContent = "Preparation";
      document.getElementById("lblDCreatedDT").textContent = "1. Date & Time";
      document.getElementById("dRtFileGivenByGroup").classList.remove("hidden");
      document.getElementById("dOfficeNameGroup").classList.add("hidden");
      document.getElementById("dDesignationGroup").classList.add("hidden");
      document.getElementById("dNilVisitRemarksGroup").classList.add("hidden");
      document.getElementById("dFileItemsSectionWrap").classList.remove("hidden");
      document.getElementById("lblDSection").textContent = "3. Section";
      document.getElementById("lblDNature").textContent = "4. Nature of File / Document";
      document.getElementById("lblDItemCount").textContent = "5. No. of File / Document";
      document.getElementById("lblDItemNumbers").textContent = "6. File Number & Description";
      document.getElementById("lblDAttachments").textContent = "7. Attachments?";
      document.getElementById("dPlannedDTGroup").classList.add("hidden");
      document.getElementById("dUrgencyFieldGroup").classList.remove("hidden");
      document.getElementById("lblDUrgency").textContent = "8. Urgency Scale";
      document.getElementById("btnSaveDStage1").textContent = "Save Preparation";
    } else if (isInward) {
      const colMode = this.getToggle("dCollectionResultToggle") || "Docs";
      this.applyCollectionResultUI(colMode);
    } else {
      document.getElementById("dTitle1").textContent = "Preparation";
      document.getElementById("lblDCreatedDT").textContent = "1. Date & Time";
      document.getElementById("dRtFileGivenByGroup").classList.add("hidden");
      document.getElementById("dOfficeNameGroup").classList.remove("hidden");
      document.getElementById("dDesignationGroup").classList.remove("hidden");
      document.getElementById("dNilVisitRemarksGroup").classList.add("hidden");
      document.getElementById("dFileItemsSectionWrap").classList.remove("hidden");
      document.getElementById("lblDOfficeName").textContent = "2. To Office Name";
      document.getElementById("lblDDesignation").textContent = "3. Designation";
      document.getElementById("lblDSection").textContent = "4. Section";
      document.getElementById("lblDNature").textContent = "5. Nature of File / Document";
      document.getElementById("lblDItemCount").textContent = "6. No. of File / Document";
      document.getElementById("lblDItemNumbers").textContent = "7. File Number & Description";
      document.getElementById("lblDAttachments").textContent = "8. Attachments?";
      document.getElementById("dPlannedDTGroup").classList.remove("hidden");
      document.getElementById("dUrgencyFieldGroup").classList.remove("hidden");
      document.getElementById("lblDUrgency").textContent = "10. Urgency Scale";
      document.getElementById("btnSaveDStage1").textContent = "Save Preparation";
    }

    const isNilCol = isInward && (this.getToggle("dCollectionResultToggle") === "Nil");
    document.getElementById("dCard2").classList.toggle("hidden", isNilCol);
    document.getElementById("dStage2StandardWrap").classList.toggle("hidden", isEnquiry || isRoundTrip);
    document.getElementById("dStage2EnquiryWrap").classList.toggle("hidden", !isEnquiry);
    document.getElementById("dStage2RoundTripWrap").classList.toggle("hidden", !isRoundTrip);

    if (isEnquiry) {
      document.getElementById("dTitle2").textContent = "Reply";
      document.getElementById("btnSaveDStage2").textContent = "Save Reply";
    } else if (isRoundTrip) {
      document.getElementById("dTitle2").textContent = "Movement";
      document.getElementById("btnSaveDStage2").textContent = "Save Movement";
    } else if (isInward) {
      document.getElementById("dTitle2").textContent = "Handover";
      document.getElementById("lblDCompletedDT").textContent = "3. Handover Date & Time";
      document.getElementById("lblDStage2Receiver").textContent = "4. Receiver's Name (Our Office Staff)";
      document.getElementById("dStage2ReceiverName").placeholder = "Staff in our office who received the collected file/doc...";
      document.getElementById("btnSaveDStage2").textContent = "Save Handover";
    } else {
      document.getElementById("dTitle2").textContent = "Delivery";
      document.getElementById("lblDCompletedDT").textContent = "3. Delivery Date & Time";
      document.getElementById("lblDStage2Receiver").textContent = "4. Receiver's Name (At External Office)";
      document.getElementById("dStage2ReceiverName").placeholder = "Person at external office who accepted the file/doc...";
      document.getElementById("btnSaveDStage2").textContent = "Save Delivery";
    }

    document.getElementById("dCard3").classList.toggle("hidden", isInward);
    document.getElementById("dStage3OutwardWrap").classList.toggle("hidden", !isOutward);
    document.getElementById("dStage3EnquiryWrap").classList.toggle("hidden", !isEnquiry);
    document.getElementById("dStage3RoundTripWrap").classList.toggle("hidden", !isRoundTrip);

    if (isEnquiry) {
      document.getElementById("dTitle3").textContent = "Reporting";
      document.getElementById("btnSaveDStage3").textContent = "Save Reporting";
    } else if (isRoundTrip) {
      document.getElementById("dTitle3").textContent = "Return";
      document.getElementById("btnSaveDStage3").textContent = "Save Return";
    } else {
      document.getElementById("dTitle3").textContent = "Reporting";
      document.getElementById("btnSaveDStage3").textContent = "Save Reporting";
    }
  },

  applyCollectionResultUI(mode) {
    const isNil = mode === "Nil";
    this.setToggle("dCollectionResultToggle", mode);

    document.getElementById("dRtFileGivenByGroup").classList.add("hidden");
    document.getElementById("dOfficeNameGroup").classList.remove("hidden");
    document.getElementById("dPlannedDTGroup").classList.add("hidden");

    if (isNil) {
      document.getElementById("dTitle1").textContent = "Collection";
      document.getElementById("lblDCreatedDT").textContent = "1. Date & Time of Visit";
      document.getElementById("lblDOfficeName").textContent = "2. Office Visited";
      document.getElementById("dDesignationGroup").classList.add("hidden");
      document.getElementById("lblDSection").innerHTML = `3. Section / Counter Checked <span class="muted small">(Optional)</span>`;
      document.getElementById("dNilVisitRemarksGroup").classList.remove("hidden");
      document.getElementById("dFileItemsSectionWrap").classList.add("hidden");
      document.getElementById("dUrgencyFieldGroup").classList.add("hidden");
      document.getElementById("dCard2").classList.add("hidden");
      document.getElementById("btnSaveDStage1").textContent = "Save Nil Visit";
    } else {
      document.getElementById("dTitle1").textContent = "Collection";
      document.getElementById("lblDCreatedDT").textContent = "1. Collection Date & Time";
      document.getElementById("lblDOfficeName").textContent = "2. From Office Name";
      document.getElementById("dDesignationGroup").classList.remove("hidden");
      document.getElementById("lblDDesignation").textContent = "3. Designation";
      document.getElementById("lblDSection").textContent = "4. Receiving Section (Our Office)";
      document.getElementById("dNilVisitRemarksGroup").classList.add("hidden");
      document.getElementById("dFileItemsSectionWrap").classList.remove("hidden");
      document.getElementById("lblDNature").textContent = "5. Nature of File / Document";
      document.getElementById("lblDItemCount").textContent = "6. No. of File / Document";
      document.getElementById("lblDItemNumbers").textContent = "7. File Number & Description";
      document.getElementById("lblDAttachments").textContent = "8. Attachments?";
      document.getElementById("dUrgencyFieldGroup").classList.remove("hidden");
      document.getElementById("lblDUrgency").textContent = "9. Urgency Scale";
      document.getElementById("dCard2").classList.remove("hidden");
      document.getElementById("btnSaveDStage1").textContent = "Save Collection";
    }
  },

  // =========================================================
  // STAGE ACCORDIONS & TASK STATE
  // =========================================================
  startNewTask(notify = true) {
    this.batchReportIds = [];
    document.getElementById("dBatchReportBanner").classList.add("hidden");
    this.natureMode = "Same";
    this.setToggle("dCollectionResultToggle", "Docs");

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
      Items_JSON: JSON.stringify([{ number: "", description: "" }]),
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
      Enquiries_JSON: JSON.stringify([{ question: "" }]),
      Respondent_Name: "",
      Reply_Text: "",
      Reply_DateTime: "",
      Report_Status: "",
      Report_Method: "",
      File_Given_By: "",
      RoundTrip_Purpose: "",
      RoundTrip_Stops_JSON: JSON.stringify([{ office: "", designation: "", section: "", action: "", dt: DateTimeHelper.nowLocalISO(), connectNext: "No" }]),
      RoundTrip_Custody: "With Me / In Transit"
    };

    this.populateForm(this.currentTask);
    this.collapseAllStages();
    if (notify) showToast("Form cleared");
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
    const dir = this.currentTask.Direction || "Outward";

    if (stageNum === 1) {
      const inp = document.getElementById("dCreatedDT");
      if (!inp.value) inp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Created_DateTime) || DateTimeHelper.nowLocalISO();
      inp.max = DateTimeHelper.nowLocalISO();
    }
    if (stageNum === 2) {
      if (dir === "Enquiry") {
        const rInp = document.getElementById("dReplyDT");
        if (!rInp.value) rInp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Reply_DateTime) || DateTimeHelper.nowLocalISO();
        rInp.max = DateTimeHelper.nowLocalISO();
      } else if (dir !== "Round-Trip") {
        const inp = document.getElementById("dCompletedDT");
        if (!inp.value) inp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Completed_DateTime) || DateTimeHelper.nowLocalISO();
        inp.max = DateTimeHelper.nowLocalISO();
      }
    }
    if (stageNum === 3) {
      if (dir === "Enquiry") {
        const repInp = document.getElementById("dEnquiryReportedDT");
        if (!repInp.value) repInp.value = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Reported_DateTime) || DateTimeHelper.nowLocalISO();
        repInp.max = DateTimeHelper.nowLocalISO();
      } else if (dir === "Round-Trip") {
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
      ["dCreatedDT", "dCompletedDT", "dReportedDT", "dReplyDT", "dEnquiryReportedDT", "dRtReturnDT"].forEach(id => {
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
    const isNil = this.isNilCollection(t);
    if (dir === "Inward") {
      this.setToggle("dCollectionResultToggle", isNil ? "Nil" : "Docs");
    }
    this.applyDirectionUI(dir);

    document.getElementById("dCreatedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Created_DateTime);

    document.getElementById("dEnquirerName").value = t.Enquirer_Name || "";
    document.getElementById("dEnquiryOfficeName").value = t.Office_Name || "";
    let enqList = [];
    try { enqList = JSON.parse(t.Enquiries_JSON || "[]"); } catch (e) {}
    if (!enqList.length) {
      enqList = t.Enquiry_Text ? [{ question: t.Enquiry_Text }] : [{ question: "" }];
    }
    this.renderDynamicEnquiries(enqList);

    document.getElementById("dFileGivenBy").value = t.File_Given_By || "";
    document.getElementById("dOfficeName").value = t.Office_Name || "";
    document.getElementById("dDesignation").value = t.Designation || "";
    document.getElementById("dSection").value = t.Section || "";
    document.getElementById("dNilVisitRemarks").value = isNil ? (t.Description || "") : "";
    document.getElementById("dNature").value = isNil ? "File" : (t.Nature || "File");
    document.getElementById("dItemCount").value = Math.max(1, t.Item_Count || 1);

    let items = [];
    try { items = JSON.parse(t.Items_JSON || "[]"); } catch (e) {}
    // Backward-compatible hydration of legacy top-level Description into Item #1 if needed
    if (items.length && !items[0].description && t.Description && !isNil) {
      items[0].description = t.Description;
    }
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

    this.setToggle("dStatusGroup", t.Delivery_Status || "");
    document.getElementById("dNotDeliveredBox").classList.toggle("hidden", t.Delivery_Status !== "Not Delivered");
    document.getElementById("dNotDelivReason").value = t.Not_Delivered_Reason || "";
    document.getElementById("dCompletedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Completed_DateTime);
    document.getElementById("dStage2ReceiverName").value = t.Stage2_Receiver_Name || "";
    document.getElementById("dStage2Comments").value = t.Stage2_Comments || "";

    document.getElementById("dReplyText").value = t.Reply_Text || "";
    document.getElementById("dRespondentName").value = t.Respondent_Name || "";
    document.getElementById("dReplyDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reply_DateTime);

    let stops = [];
    try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
    if (!stops.length) {
      stops = [{ office: "", designation: "", section: "", action: "", dt: DateTimeHelper.nowLocalISO(), connectNext: "No" }];
    }
    this.renderRoundTripStops(stops);

    this.setToggle("dReceiptGivenGroup", t.Receipt_Given || "");
    document.getElementById("dReceiptNoBox").classList.toggle("hidden", t.Receipt_Given !== "No");
    document.getElementById("dReceiptYesFields").classList.toggle("hidden", t.Receipt_Given !== "Yes");
    document.getElementById("dReceiptNoReason").value = t.Receipt_No_Reason || "";
    document.getElementById("dReceiverName").value = t.Receiver_Name || "";
    document.getElementById("dReportedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reported_DateTime);

    this.setToggle("dEnquiryReportStatusGroup", t.Report_Status || "");
    document.getElementById("dEnquiryReportedDetails").classList.toggle("hidden", t.Report_Status !== "Reported");
    document.getElementById("dEnquiryReportedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reported_DateTime);
    document.getElementById("dReportMethodInput").value = t.Report_Method || "";
    document.getElementById("dEnquiryComments").value = t.Stage2_Comments || "";

    document.getElementById("dRtDocReceiverName").value = t.Stage2_Receiver_Name || "";
    document.getElementById("dRtReturnDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reported_DateTime);
    this.setToggle("dRtReceiptGivenGroup", t.Receipt_Given || "");
    document.getElementById("dRtReceiptNoBox").classList.toggle("hidden", t.Receipt_Given !== "No");
    document.getElementById("dRtReceiptYesFields").classList.toggle("hidden", t.Receipt_Given !== "Yes");
    document.getElementById("dRtReceiptNoReason").value = t.Receipt_No_Reason || "";
    document.getElementById("dRtReceiptReceiverName").value = t.Receiver_Name || "";
    document.getElementById("dRtComments").value = t.Stage2_Comments || "";

    this.updateStageSummaries();
    this.refreshLearnedOptions();
  },

  // =========================================================
  // ENQUIRY DYNAMIC QUESTIONS RENDERER
  // =========================================================
  renderDynamicEnquiries(enquiries = []) {
    const list = enquiries.length ? enquiries : [{ question: "" }];
    const wrap = document.getElementById("dDynamicEnquiriesWrap");
    wrap.innerHTML = list.map((item, idx) => `
      <div class="dynamic-item-row" style="align-items:flex-start;">
        <span class="badge primary" style="min-width:26px; text-align:center; margin-top:8px;">${idx + 1}</span>
        <textarea class="d-enquiry-q" rows="2" placeholder="Enquiry #${idx + 1}..." style="flex:1;">${item.question || ""}</textarea>
        ${list.length > 1 ? `<button type="button" class="btn-mini" data-rm-enq="${idx}" style="margin-top:6px;">×</button>` : ""}
      </div>
    `).join("");
  },

  collectDynamicEnquiries() {
    const rows = document.querySelectorAll("#dDynamicEnquiriesWrap .d-enquiry-q");
    const list = [];
    rows.forEach(ta => {
      list.push({ question: ta.value.trim() });
    });
    return list;
  },

  // =========================================================
  // ROUND-TRIP RECURSIVE OFFICE DETAILS CHAIN
  // =========================================================
  renderRoundTripStops(stops = []) {
    const list = stops.length ? stops : [{ office: "", designation: "", section: "", action: "", dt: DateTimeHelper.nowLocalISO(), connectNext: "No" }];
    const wrap = document.getElementById("dRoundTripStopsList");
    wrap.innerHTML = list.map((st, idx) => {
      const isLast = idx === list.length - 1;
      const connectVal = isLast ? (st.connectNext || "No") : "Yes";
      return `
        <div class="dynamic-schema-box mb-8 rt-stop-card" data-stop-idx="${idx}">
          <div class="row-between mb-6">
            <span class="badge primary">Office #${idx + 1}</span>
            ${list.length > 1 ? `<button type="button" class="btn-mini" data-rm-rtstop="${idx}">× Remove</button>` : ""}
          </div>
          <div class="form-group" style="margin-top:0;">
            <label>To Office</label>
            <input type="text" class="rt-stop-office" list="dOfficeList" value="${st.office || ""}" placeholder="Select or type office name..." />
          </div>
          <div class="row-gap">
            <div class="form-group" style="flex:1; margin-top:6px;">
              <label>Designation</label>
              <input type="text" class="rt-stop-desig" list="dDesigList" value="${st.designation || ""}" placeholder="Designation..." />
            </div>
            <div class="form-group" style="flex:1; margin-top:6px;">
              <label>Section</label>
              <input type="text" class="rt-stop-section" list="dSectionList" value="${st.section || ""}" placeholder="Section..." />
            </div>
          </div>
          <div class="form-group" style="margin-top:6px;">
            <label>Action</label>
            <input type="text" class="rt-stop-action" value="${st.action || ""}" placeholder="Signing, countersigning, approving, rejecting..." />
            <div class="chip-wrap">
              <button type="button" class="smart-chip" data-rtaction="Signing">Signing</button>
              <button type="button" class="smart-chip" data-rtaction="Countersigning">Countersigning</button>
              <button type="button" class="smart-chip" data-rtaction="Approving">Approving</button>
              <button type="button" class="smart-chip" data-rtaction="Verification">Verification</button>
              <button type="button" class="smart-chip" data-rtaction="Rejecting">Rejecting</button>
            </div>
          </div>
          <div class="form-group" style="margin-top:6px;">
            <label>Date & Time</label>
            <input type="datetime-local" class="rt-stop-dt" value="${DateTimeHelper.toDateTimeLocalValue(st.dt) || DateTimeHelper.nowLocalISO()}" />
          </div>
          <div class="form-group" style="margin-top:8px; padding-top:8px; border-top:1px dashed #cbd5e1;">
            <label>Connect to another office?</label>
            <div class="toggle-row rt-connect-group" data-stop-idx="${idx}">
              <button type="button" class="toggle-btn ${connectVal === "Yes" ? "selected" : ""}" data-connect="Yes">Yes</button>
              <button type="button" class="toggle-btn ${connectVal === "No" ? "selected" : ""}" data-connect="No">No</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  collectRoundTripStops() {
    const cards = document.querySelectorAll("#dRoundTripStopsList .rt-stop-card");
    const stops = [];
    cards.forEach((c, idx) => {
      const selBtn = c.querySelector(".rt-connect-group button.selected");
      const connectNext = (idx < cards.length - 1) ? "Yes" : (selBtn ? selBtn.dataset.connect : "No");
      stops.push({
        office: c.querySelector(".rt-stop-office").value.trim(),
        designation: c.querySelector(".rt-stop-desig").value.trim(),
        section: c.querySelector(".rt-stop-section").value.trim(),
        action: c.querySelector(".rt-stop-action").value.trim(),
        dt: c.querySelector(".rt-stop-dt").value || DateTimeHelper.nowLocalISO(),
        connectNext
      });
    });
    return stops;
  },

  // =========================================================
  // DYNAMIC ITEM & INDIVIDUAL DESCRIPTION SCHEMAS
  // =========================================================
  renderDynamicItems(existingItems = []) {
    const nature = document.getElementById("dNature").value.trim() || "File";
    const count = Math.max(1, Math.min(30, parseInt(document.getElementById("dItemCount").value || "1", 10)));
    const isRt = (this.currentTask && this.currentTask.Direction === "Round-Trip");

    document.getElementById("lblDItemCount").textContent = `${isRt ? "5" : "6"}. No. of ${nature}`;
    document.getElementById("lblDItemNumbers").textContent = `${isRt ? "6" : "7"}. ${count > 1 ? nature + " Numbers & Descriptions" : nature + " Number & Description"}`;

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
      const descVal = prev.description || "";
      const itemLabel = this.natureMode === "Various" && natVal ? natVal : nature;

      rows.push(`
        <div class="file-item-card">
          <div class="file-item-top">
            <span class="badge primary" style="min-width:26px; text-align:center;">${i + 1}</span>
            ${count > 1 && this.natureMode === "Various"
              ? `<input type="text" class="d-item-nature" list="dNatureList" value="${natVal}" placeholder="Nature (e.g. Cheque)" style="max-width:125px;" />`
              : ""}
            <input type="text" class="d-item-number" value="${numVal}" placeholder="${itemLabel} No. #${i + 1}" />
          </div>
          <input type="text" class="d-item-desc" value="${descVal}" placeholder="Description for #${i + 1} (Optional)..." />
        </div>
      `);
    }
    wrap.innerHTML = rows.join("");
  },

  collectDynamicItems() {
    const defaultNature = document.getElementById("dNature").value.trim() || "File";
    const cards = document.querySelectorAll("#dDynamicItemsWrap .file-item-card");
    const items = [];
    cards.forEach(card => {
      const natInp = card.querySelector(".d-item-nature");
      const numInp = card.querySelector(".d-item-number");
      const descInp = card.querySelector(".d-item-desc");
      items.push({
        nature: (natInp && natInp.value.trim()) ? natInp.value.trim() : defaultNature,
        number: numInp ? numInp.value.trim() : "",
        description: descInp ? descInp.value.trim() : ""
      });
    });
    return items;
  },

  formatItemsSummary(items, fallbackNature = "File") {
    if (!items || !items.length) return fallbackNature;
    return items.map((it, idx) => {
      const nat = it.nature || fallbackNature;
      const base = it.number ? `${nat} #${it.number}` : `${nat} (${idx + 1})`;
      return it.description ? `${base} - ${it.description}` : base;
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
    this.currentTask.Direction = direction;
    this.currentTask.Created_DateTime = document.getElementById("dCreatedDT").value || DateTimeHelper.nowLocalISO();
    this.currentTask.Urgency = this.getToggle("dUrgencyGroup") || "Normal";

    if (direction === "Enquiry") {
      const enquirer = document.getElementById("dEnquirerName").value.trim();
      const toOffice = document.getElementById("dEnquiryOfficeName").value.trim();
      const enquiries = this.collectDynamicEnquiries().filter(e => e.question);

      if (!enquirer) {
        showToast("Enter Enquirer's Name.");
        document.getElementById("dEnquirerName").focus();
        return;
      }
      if (!toOffice) {
        showToast("Enter To Office Name.");
        document.getElementById("dEnquiryOfficeName").focus();
        return;
      }
      if (!enquiries.length) {
        showToast("Enter at least 1 Enquiry.");
        return;
      }

      this.currentTask.Enquirer_Name = enquirer;
      this.currentTask.Office_Name = toOffice;
      this.currentTask.Enquiries_JSON = JSON.stringify(enquiries);
      this.currentTask.Enquiry_Text = enquiries.map((e, i) => enquiries.length > 1 ? `${i + 1}. ${e.question}` : e.question).join(" | ");
      this.currentTask.Nature = "Enquiry";
      this.currentTask.Items_Summary = this.currentTask.Enquiry_Text.slice(0, 70);
    } else if (direction === "Round-Trip") {
      const givenBy = document.getElementById("dFileGivenBy").value.trim();
      if (!givenBy) {
        showToast("Enter File Given by.");
        document.getElementById("dFileGivenBy").focus();
        return;
      }
      const nature = document.getElementById("dNature").value.trim() || "File";
      const items = this.collectDynamicItems();
      const hasAtt = this.getToggle("dAttachToggleGroup") || "No";
      const atts = this.collectAttachments();

      this.currentTask.File_Given_By = givenBy;
      this.currentTask.Section = document.getElementById("dSection").value.trim();
      this.currentTask.Nature = nature;
      this.currentTask.Item_Count = items.length;
      this.currentTask.Nature_Mode = this.natureMode;
      this.currentTask.Items_JSON = JSON.stringify(items);
      this.currentTask.Items_Summary = this.formatItemsSummary(items, nature);
      this.currentTask.Description = items.map(it => it.description).filter(Boolean).join(" | ");
      this.currentTask.Has_Attachments = hasAtt;
      this.currentTask.Attachment_Count = hasAtt === "Yes" ? atts.length : 0;
      this.currentTask.Attachments_JSON = JSON.stringify(atts);
      if (!this.currentTask.Office_Name) {
        this.currentTask.Office_Name = `From ${givenBy}`;
      }
    } else if (direction === "Inward" && this.getToggle("dCollectionResultToggle") === "Nil") {
      const office = document.getElementById("dOfficeName").value.trim();
      if (!office) {
        showToast("Enter Office Visited.");
        document.getElementById("dOfficeName").focus();
        return;
      }
      const visitDT = document.getElementById("dCreatedDT").value || DateTimeHelper.nowLocalISO();
      const remarks = document.getElementById("dNilVisitRemarks").value.trim();

      this.currentTask.Office_Name = office;
      this.currentTask.Designation = "";
      this.currentTask.Section = document.getElementById("dSection").value.trim();
      this.currentTask.Nature = "Nil Visit";
      this.currentTask.Item_Count = 0;
      this.currentTask.Items_JSON = "[]";
      this.currentTask.Items_Summary = "Nil (No Documents to Collect)";
      this.currentTask.Description = remarks;
      this.currentTask.Has_Attachments = "No";
      this.currentTask.Attachment_Count = 0;
      this.currentTask.Attachments_JSON = "[]";
      this.currentTask.Urgency = "Normal";
      this.currentTask.Delivery_Status = "Delivered";
      this.currentTask.Completed_DateTime = visitDT;
      this.currentTask.Stage2_Receiver_Name = "Nil (No Docs)";
      this.currentTask.Stage2_Comments = remarks;

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);
      showToast("Nil Visit logged to Reported ✓");
      this.collapseAllStages();
      this.switchSubView("history");
      return;
    } else {
      const office = document.getElementById("dOfficeName").value.trim();
      if (!office) {
        showToast("Enter Office Name.");
        document.getElementById("dOfficeName").focus();
        return;
      }
      const nature = document.getElementById("dNature").value.trim() || "File";
      const items = this.collectDynamicItems();
      const hasAtt = this.getToggle("dAttachToggleGroup") || "No";
      const atts = this.collectAttachments();

      this.currentTask.Office_Name = office;
      this.currentTask.Designation = document.getElementById("dDesignation").value.trim();
      this.currentTask.Section = document.getElementById("dSection").value.trim();
      this.currentTask.Nature = nature;
      this.currentTask.Item_Count = items.length;
      this.currentTask.Nature_Mode = this.natureMode;
      this.currentTask.Items_JSON = JSON.stringify(items);
      this.currentTask.Items_Summary = this.formatItemsSummary(items, nature);
      this.currentTask.Description = items.map(it => it.description).filter(Boolean).join(" | ");
      this.currentTask.Has_Attachments = hasAtt;
      this.currentTask.Attachment_Count = hasAtt === "Yes" ? atts.length : 0;
      this.currentTask.Attachments_JSON = JSON.stringify(atts);
      this.currentTask.Planned_Delivery_DT = direction === "Outward" ? document.getElementById("dPlannedDT").value : "";
    }

    this.upsertLocalTask(this.currentTask);
    this.updateStageSummaries();
    await AppStore.pushAction("saveDelivery", this.currentTask);
    showToast("Saved to Scheduled ✓");
    this.collapseAllStages();
  },

  async saveStage2() {
    const dir = this.currentTask.Direction || "Outward";

    if (dir === "Enquiry") {
      if (!this.currentTask.Enquiry_Text) {
        showToast("Save Enquiry first.");
        this.openStage(1);
        return;
      }
      const reply = document.getElementById("dReplyText").value.trim();
      if (!reply) {
        showToast("Enter the Reply.");
        document.getElementById("dReplyText").focus();
        return;
      }
      this.currentTask.Reply_Text = reply;
      this.currentTask.Respondent_Name = document.getElementById("dRespondentName").value.trim();
      this.currentTask.Reply_DateTime = document.getElementById("dReplyDT").value || DateTimeHelper.nowLocalISO();
      this.currentTask.Delivery_Status = "Delivered";

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);
      showToast("Reply saved ✓ Proceed to Reporting");
      this.openStage(3);
      return;
    }

    if (dir === "Round-Trip") {
      if (!this.currentTask.File_Given_By && !document.getElementById("dFileGivenBy").value.trim()) {
        showToast("Save Preparation first.");
        this.openStage(1);
        return;
      }
      if (!this.currentTask.File_Given_By) {
        await this.saveStage1();
      }
      const stops = this.collectRoundTripStops().filter(s => s.office);
      if (!stops.length) {
        showToast("Enter at least Office #1.");
        return;
      }
      this.currentTask.RoundTrip_Stops_JSON = JSON.stringify(stops);
      this.currentTask.Office_Name = stops.map(s => s.office).join(" → ");
      this.currentTask.Designation = stops[0].designation || "";
      this.currentTask.Completed_DateTime = stops[stops.length - 1].dt || DateTimeHelper.nowLocalISO();
      if (this.currentTask.Delivery_Status !== "Returned") {
        this.currentTask.Delivery_Status = "In Progress";
      }

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);

      const lastStop = stops[stops.length - 1];
      if (lastStop.connectNext === "Yes") {
        showToast("Movement saved ✓");
        this.collapseAllStages();
      } else {
        showToast("Movement saved ✓ Proceed to Return");
        this.openStage(3);
      }
      return;
    }

    if (!this.currentTask.Office_Name) {
      if (!document.getElementById("dOfficeName").value.trim()) {
        showToast("Save Preparation first.");
        return;
      }
      await this.saveStage1();
    }

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
      showToast("Handover saved & moved to Reported ✓");
      this.collapseAllStages();
      this.switchSubView("history");
    } else if (status === "Delivered") {
      showToast("Delivered ✓ Proceed to Reporting");
      this.openStage(3);
    } else {
      showToast("Marked Not Delivered — remains in Scheduled");
      this.collapseAllStages();
    }
  },

  async saveStage3() {
    const dir = this.currentTask.Direction || "Outward";

    if (dir === "Enquiry") {
      if (!this.currentTask.Reply_Text) {
        showToast("Save Reply first.");
        this.openStage(2);
        return;
      }
      const repStatus = this.getToggle("dEnquiryReportStatusGroup");
      if (!repStatus) {
        showToast("Select Reported or Not Reported.");
        return;
      }
      const method = document.getElementById("dReportMethodInput").value.trim();
      if (repStatus === "Reported" && !method) {
        showToast("Select or enter Method of Reporting.");
        document.getElementById("dReportMethodInput").focus();
        return;
      }

      this.currentTask.Report_Status = repStatus;
      this.currentTask.Reported_DateTime = repStatus === "Reported"
        ? (document.getElementById("dEnquiryReportedDT").value || DateTimeHelper.nowLocalISO())
        : "";
      this.currentTask.Report_Method = repStatus === "Reported" ? method : "";
      this.currentTask.Stage2_Comments = document.getElementById("dEnquiryComments").value.trim();

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);

      if (repStatus === "Reported") {
        showToast("Reported & moved to Reported tab ✓");
        this.collapseAllStages();
        this.switchSubView("history");
      } else {
        showToast("Saved — remains in Completed tab");
        this.collapseAllStages();
      }
      return;
    }

    if (dir === "Round-Trip") {
      const docReceiver = document.getElementById("dRtDocReceiverName").value.trim();
      if (!docReceiver) {
        showToast("Enter File / Doc Received By.");
        document.getElementById("dRtDocReceiverName").focus();
        return;
      }
      const recGiven = this.getToggle("dRtReceiptGivenGroup");
      if (!recGiven) {
        showToast("Select Yes or No for Receipt Received.");
        return;
      }
      const recNoReason = document.getElementById("dRtReceiptNoReason").value.trim();
      const recReceiver = document.getElementById("dRtReceiptReceiverName").value.trim();

      if (recGiven === "No" && !recNoReason) {
        showToast("Enter reason why receipt was not received.");
        document.getElementById("dRtReceiptNoReason").focus();
        return;
      }
      if (recGiven === "Yes" && !recReceiver) {
        showToast("Enter who received the receipt.");
        document.getElementById("dRtReceiptReceiverName").focus();
        return;
      }

      this.currentTask.Delivery_Status = "Returned";
      this.currentTask.Stage2_Receiver_Name = docReceiver;
      this.currentTask.Reported_DateTime = document.getElementById("dRtReturnDT").value || DateTimeHelper.nowLocalISO();
      this.currentTask.Receipt_Given = recGiven;
      this.currentTask.Receipt_No_Reason = recGiven === "No" ? recNoReason : "";
      this.currentTask.Receiver_Name = recGiven === "Yes" ? recReceiver : "";
      this.currentTask.Stage2_Comments = document.getElementById("dRtComments").value.trim();

      this.upsertLocalTask(this.currentTask);
      this.updateStageSummaries();
      await AppStore.pushAction("saveDelivery", this.currentTask);
      showToast("Return saved & moved to Reported ✓");
      this.collapseAllStages();
      this.switchSubView("history");
      return;
    }

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
      showToast("Mark Delivery as Delivered first.");
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
    showToast("Saved & moved to Reported ✓");
    this.collapseAllStages();
    this.switchSubView("history");
  },

  upsertLocalTask(taskObj) {
    const idx = AppStore.deliveries.findIndex(t => String(t.Task_ID) === String(taskObj.Task_ID));
    if (idx !== -1) AppStore.deliveries[idx] = { ...taskObj };
    else AppStore.deliveries.unshift({ ...taskObj });
  },

  // =========================================================
  // GROUP REPORTING MODAL
  // =========================================================
  openGroupReportModal() {
    if (!this.selectedUnrepIds.size) {
      showToast("Select at least 1 completed task first.");
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
    showToast(`Reported ${updatedList.length} tasks ✓`);
    this.renderUnreportedTasks();
    this.switchSubView("history");
  },

  // =========================================================
  // SUMMARIES & LEARNED OPTIONS
  // =========================================================
  updateStageSummaries() {
    const t = this.currentTask;
    const dir = t.Direction || "Outward";

    if (dir === "Enquiry") {
      const s1Done = Boolean(t.Office_Name && t.Enquiry_Text);
      document.getElementById("dSummary1").textContent = s1Done
        ? `To ${t.Office_Name} (Enquirer: ${t.Enquirer_Name || "Staff"})`
        : "Not saved yet";
      const s2Done = Boolean(t.Reply_Text);
      document.getElementById("dSummary2").textContent = s2Done
        ? `Reply${t.Respondent_Name ? " by " + t.Respondent_Name : ""} (${DateTimeHelper.formatShort(t.Reply_DateTime)})`
        : "Pending";
      const s3Done = t.Report_Status === "Reported";
      document.getElementById("dSummary3").textContent = t.Report_Status
        ? `${t.Report_Status}${t.Report_Method ? " via " + t.Report_Method : ""}`
        : "Pending";

      document.getElementById("dCard1").classList.toggle("completed", s1Done);
      document.getElementById("dCard2").classList.toggle("completed", s2Done);
      document.getElementById("dCard3").classList.toggle("completed", s3Done);
      return;
    }

    if (dir === "Round-Trip") {
      const s1Done = Boolean(t.File_Given_By && t.Created_DateTime);
      document.getElementById("dSummary1").textContent = s1Done
        ? `${t.Items_Summary || t.Nature} (Given by ${t.File_Given_By})`
        : "Not saved yet";
      let stops = [];
      try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
      const validStops = stops.filter(s => s.office);
      document.getElementById("dSummary2").textContent = validStops.length
        ? validStops.map(s => `${s.office}${s.action ? " [" + s.action + "]" : ""}`).join(" → ")
        : "Pending";
      const s3Done = t.Delivery_Status === "Returned" && Boolean(t.Receipt_Given);
      document.getElementById("dSummary3").textContent = s3Done
        ? `Received by ${t.Stage2_Receiver_Name} • Receipt: ${t.Receipt_Given}`
        : "Pending";

      document.getElementById("dCard1").classList.toggle("completed", s1Done);
      document.getElementById("dCard2").classList.toggle("completed", validStops.length > 0);
      document.getElementById("dCard3").classList.toggle("completed", s3Done);
      return;
    }

    const s1Done = Boolean(t.Office_Name && t.Created_DateTime);
    const isNil = this.isNilCollection(t) || (dir === "Inward" && this.getToggle("dCollectionResultToggle") === "Nil");
    document.getElementById("dSummary1").textContent = s1Done
      ? (isNil
          ? `Visited ${t.Office_Name} • Nil (${DateTimeHelper.formatShort(t.Created_DateTime)})`
          : `${dir === "Inward" ? "From" : "To"} ${t.Office_Name} • ${t.Items_Summary || t.Nature} [${t.Urgency}]`)
      : "Not saved yet";
    document.getElementById("dCard1").classList.toggle("completed", s1Done);

    const s2Done = t.Delivery_Status === "Delivered";
    document.getElementById("dSummary2").textContent = t.Delivery_Status
      ? `${t.Delivery_Status}${t.Stage2_Receiver_Name ? " → " + t.Stage2_Receiver_Name : ""} (${DateTimeHelper.formatShort(t.Completed_DateTime)})`
      : "Pending";
    document.getElementById("dCard2").classList.toggle("completed", s2Done);

    const s3Done = Boolean(t.Receipt_Given);
    document.getElementById("dSummary3").textContent = s3Done
      ? `Receipt: ${t.Receipt_Given}${t.Receiver_Name ? " (" + t.Receiver_Name + ")" : ""}`
      : "Pending";
    document.getElementById("dCard3").classList.toggle("completed", s3Done);
  },

  refreshLearnedOptions() {
    const offices = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Office_Name), CONFIG.DEFAULT_OFFICES);
    const desigs = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Designation), CONFIG.DEFAULT_DESIGNATIONS);
    const sections = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Section), CONFIG.DEFAULT_SECTIONS);
    const natures = AppStore.rankByFrequency(
      AppStore.deliveries.map(t => t.Nature).filter(n => n !== "Nil Visit"),
      CONFIG.DEFAULT_NATURES
    );

    document.getElementById("dOfficeList").innerHTML = offices.map(v => `<option value="${v}">`).join("");
    document.getElementById("dDesigList").innerHTML = desigs.map(v => `<option value="${v}">`).join("");
    document.getElementById("dSectionList").innerHTML = sections.map(v => `<option value="${v}">`).join("");
    document.getElementById("dNatureList").innerHTML = natures.map(v => `<option value="${v}">`).join("");

    document.getElementById("dOfficeChips").innerHTML = offices.slice(0, 5).map(v =>
      `<button type="button" class="smart-chip" data-dfill="dOfficeName" data-dval="${v}">${v}</button>`
    ).join("");
    document.getElementById("dEnquiryOfficeChips").innerHTML = offices.slice(0, 5).map(v =>
      `<button type="button" class="smart-chip" data-dfill="dEnquiryOfficeName" data-dval="${v}">${v}</button>`
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

    const ourStaff = AppStore.rankByFrequency([
      ...AppStore.deliveries.map(t => t.Enquirer_Name),
      ...AppStore.deliveries.map(t => t.File_Given_By),
      ...AppStore.deliveries.map(t => t.Receiver_Name),
      ...AppStore.deliveries
        .filter(t => (t.Direction === "Inward" && !this.isNilCollection(t)) || t.Direction === "Round-Trip")
        .map(t => t.Stage2_Receiver_Name)
    ]).slice(0, 6);

    document.getElementById("dEnquirerChips").innerHTML = ourStaff.map(n =>
      `<button type="button" class="smart-chip" data-dfill="dEnquirerName" data-dval="${n}">${n}</button>`
    ).join("");
    document.getElementById("dFileGivenByChips").innerHTML = ourStaff.map(n =>
      `<button type="button" class="smart-chip" data-dfill="dFileGivenBy" data-dval="${n}">${n}</button>`
    ).join("");
    document.getElementById("dRtDocReceiverChips").innerHTML = ourStaff.map(n =>
      `<button type="button" class="smart-chip" data-dfill="dRtDocReceiverName" data-dval="${n}">${n}</button>`
    ).join("");
    document.getElementById("dRtReceiptReceiverChips").innerHTML = ourStaff.map(n =>
      `<button type="button" class="smart-chip" data-dfill="dRtReceiptReceiverName" data-dval="${n}">${n}</button>`
    ).join("");

    const respondents = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Respondent_Name)).slice(0, 6);
    document.getElementById("dRespondentChips").innerHTML = respondents.map(n =>
      `<button type="button" class="smart-chip" data-dfill="dRespondentName" data-dval="${n}">${n}</button>`
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
    document.getElementById("dRtReceiptNoChips").innerHTML = recNoReasons.map(r =>
      `<button type="button" class="smart-chip" data-dfill="dRtReceiptNoReason" data-dval="${r}">${r}</button>`
    ).join("");

    document.getElementById("dReceiverChips").innerHTML = ourStaff.map((n, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-dfill="dReceiverName" data-dval="${n}">${n}</button>`
    ).join("");
  },

  // =========================================================
  // CLEAN SINGLE-LINE CARD LISTS: SCHEDULED, COMPLETED & REPORTED
  // =========================================================
  urgencyWeight(u) {
    if (u === "Very Urgent") return 3;
    if (u === "Urgent") return 2;
    return 1;
  },

  // SCHEDULED TAB (with high-contrast urgency borders & background tints)
  renderActiveTasks() {
    const allPending = AppStore.deliveries.filter(t => {
      if (this.isCompletedLifecycle(t)) return false;
      const dir = t.Direction || "Outward";
      if (dir === "Outward" && t.Delivery_Status === "Delivered" && !t.Receipt_Given) return false;
      if (dir === "Enquiry" && t.Reply_Text && t.Report_Status !== "Reported") return false;
      return true;
    });

    const outwardTasks = allPending.filter(t => (t.Direction || "Outward") === "Outward");
    const inwardTasks = allPending.filter(t => ["Inward", "Enquiry", "Round-Trip"].includes(t.Direction || "Outward"));

    document.getElementById("dTasksCount").textContent = allPending.length;
    document.getElementById("dOutwardTasksCount").textContent = outwardTasks.length;
    document.getElementById("dInwardTasksCount").textContent = inwardTasks.length;

    let active = this.scheduledDirFilter === "INWARD" ? inwardTasks : outwardTasks;

    active.sort((a, b) => {
      const uw = this.urgencyWeight(b.Urgency) - this.urgencyWeight(a.Urgency);
      if (uw !== 0) return uw;
      return String(a.Planned_Delivery_DT || a.Created_DateTime).localeCompare(String(b.Planned_Delivery_DT || b.Created_DateTime));
    });

    const wrap = document.getElementById("dActiveTasksList");
    if (!active.length) {
      wrap.innerHTML = `<div class="card muted small">No scheduled ${this.scheduledDirFilter === "INWARD" ? "inward" : "outward"} tasks.</div>`;
      return;
    }

    wrap.innerHTML = active.map(t => {
      const dir = t.Direction || "Outward";
      const cardClass = t.Urgency === "Very Urgent" ? "very-urgent" : t.Urgency === "Urgent" ? "urgent" : "";
      const urgPill = t.Urgency === "Very Urgent"
        ? `<span class="urg-pill-very">Very Urgent</span>`
        : t.Urgency === "Urgent"
          ? `<span class="urg-pill-urgent">Urgent</span>`
          : "";

      let nextBtnText = "Delivery →";
      let nextStage = 2;

      if (dir === "Inward") {
        nextBtnText = "Handover →";
      } else if (dir === "Enquiry") {
        nextBtnText = "Reply →";
      } else if (dir === "Round-Trip") {
        let stops = [];
        try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
        const validStops = stops.filter(s => s.office);
        if (validStops.length && validStops[validStops.length - 1].connectNext === "No") {
          nextBtnText = "Return →";
          nextStage = 3;
        } else {
          nextBtnText = "Movement →";
        }
      }

      return `
        <div class="history-item ${cardClass}">
          <div class="card-line">
            <div class="card-line-text">
              ${this.getDirectionBadgeHTML(t)}
              <strong style="margin-left:4px;">${t.Office_Name}</strong>${t.Section ? ` <span class="muted small">• ${t.Section}</span>` : ""}
            </div>
            ${urgPill ? `<div class="card-line-actions">${urgPill}</div>` : ""}
          </div>
          ${this.buildItemLinesHTML(t)}
          <div class="row-between mt-8">
            <button type="button" class="btn-mini" data-load-dtask="${t.Task_ID}" data-dopen-stage="1">Edit</button>
            <button type="button" class="btn-mini accent" data-load-dtask="${t.Task_ID}" data-dopen-stage="${nextStage}">${nextBtnText}</button>
          </div>
        </div>`;
    }).join("");
  },

  // COMPLETED TAB
  renderUnreportedTasks() {
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
      wrap.innerHTML = `<div class="card muted small">No completed tasks awaiting reporting.</div>`;
      return;
    }

    wrap.innerHTML = unrep.map(t => {
      const dir = t.Direction || "Outward";
      const checked = this.selectedUnrepIds.has(t.Task_ID);
      const isEnq = dir === "Enquiry";

      const row3Text = isEnq
        ? `${DateTimeHelper.formatShort(t.Reply_DateTime) || "—"} - ${t.Respondent_Name || t.Reply_Text || "—"}`
        : `${DateTimeHelper.formatShort(t.Completed_DateTime) || "—"} - ${t.Stage2_Receiver_Name || "—"}`;

      return `
        <div class="history-item ${checked ? "checked" : ""}">
          <div class="card-line">
            <label class="card-line-text" style="display:flex; align-items:center; gap:6px; margin:0; cursor:pointer;">
              ${!isEnq ? `<input type="checkbox" data-unrep-chk="${t.Task_ID}" ${checked ? "checked" : ""} style="width:16px; height:16px; flex-shrink:0;" />` : ""}
              ${this.getDirectionBadgeHTML(t)}
              <strong>${t.Office_Name}</strong>${t.Section ? ` <span class="muted small">• ${t.Section}</span>` : ""}
            </label>
            <div class="card-line-actions">
              <button type="button" class="btn-mini accent" data-load-dtask="${t.Task_ID}" data-dopen-stage="3">Reporting →</button>
            </div>
          </div>
          ${this.buildItemLinesHTML(t)}
          <div class="card-line small muted">
            <span class="card-line-text">${row3Text}</span>
          </div>
        </div>`;
    }).join("");
  },

  historyTimestamp(t) {
    return DateTimeHelper.timestampMs(t.Reported_DateTime || t.Completed_DateTime || t.Reply_DateTime || t.Created_DateTime, t.Task_ID);
  },

  // REPORTED TAB
  renderHistory() {
    const completed = AppStore.deliveries.filter(t => this.isCompletedLifecycle(t));

    this.populateSelectFilter("dHistoryFilterOffice", completed.map(t => t.Office_Name), "Office: All");
    this.populateSelectFilter("dHistoryFilterNature", completed.map(t => t.Nature).filter(n => n !== "Nil Visit"), "Nature: All");
    this.populateSelectFilter("dHistoryFilterDesig", completed.map(t => t.Designation), "Designation: All");
    const allPeople = completed
      .flatMap(t => [t.Stage2_Receiver_Name, t.Receiver_Name, t.Enquirer_Name, t.Respondent_Name, t.File_Given_By])
      .filter(p => p && p !== "Nil (No Docs)");
    this.populateSelectFilter("dHistoryFilterReceiver", allPeople, "Staff / Person: All");

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

    // Update Filters toggle button badge count
    let activeFilterCount = 0;
    if (fDir !== "ALL") activeFilterCount++;
    if (fStatus !== "ALL") activeFilterCount++;
    if (fOffice !== "ALL") activeFilterCount++;
    if (fNature !== "ALL") activeFilterCount++;
    if (fDesig !== "ALL") activeFilterCount++;
    if (fReceiver !== "ALL") activeFilterCount++;
    if (dFrom) activeFilterCount++;
    if (dTo) activeFilterCount++;

    const toggleBtn = document.getElementById("btnToggleHistoryFilters");
    if (toggleBtn) {
      const arrow = this.filtersOpen ? "▴" : "▾";
      toggleBtn.textContent = activeFilterCount > 0 ? `Filters (${activeFilterCount}) ${arrow}` : `Filters ${arrow}`;
      toggleBtn.classList.toggle("active-filter", activeFilterCount > 0);
    }

    let list = [...completed];
    if (fDir === "Inward_Docs") {
      list = list.filter(t => (t.Direction || "Outward") === "Inward" && !this.isNilCollection(t));
    } else if (fDir === "Inward_Nil") {
      list = list.filter(t => this.isNilCollection(t));
    } else if (fDir !== "ALL") {
      list = list.filter(t => (t.Direction || "Outward") === fDir);
    }

    if (fStatus === "GIVEN") list = list.filter(t => t.Receipt_Given === "Yes");
    if (fStatus === "NOT_GIVEN") list = list.filter(t => t.Receipt_Given === "No");
    if (fOffice !== "ALL") list = list.filter(t => t.Office_Name === fOffice);
    if (fNature !== "ALL") list = list.filter(t => t.Nature === fNature);
    if (fDesig !== "ALL") list = list.filter(t => t.Designation === fDesig);
    if (fReceiver !== "ALL") {
      list = list.filter(t => [t.Stage2_Receiver_Name, t.Receiver_Name, t.Enquirer_Name, t.Respondent_Name, t.File_Given_By].includes(fReceiver));
    }
    if (dFrom) list = list.filter(t => (t.Reported_DateTime || t.Completed_DateTime || t.Created_DateTime || "").slice(0, 10) >= dFrom);
    if (dTo) list = list.filter(t => (t.Reported_DateTime || t.Completed_DateTime || t.Created_DateTime || "").slice(0, 10) <= dTo);

    if (q) {
      list = list.filter(t => [
        t.Office_Name, t.Designation, t.Section, t.Nature, t.Items_Summary,
        t.Description, t.Stage2_Comments, t.Stage2_Receiver_Name, t.Receiver_Name,
        t.Enquirer_Name, t.Respondent_Name, t.Enquiry_Text, t.Reply_Text,
        t.File_Given_By, t.RoundTrip_Stops_JSON, t.Items_JSON
      ].filter(Boolean).join(" ").toLowerCase().includes(q));
    }

    if (sortBy === "OLDEST") list.sort((a, b) => this.historyTimestamp(a) - this.historyTimestamp(b));
    else if (sortBy === "OFFICE") list.sort((a, b) => String(a.Office_Name).localeCompare(String(b.Office_Name)));
    else if (sortBy === "NATURE") list.sort((a, b) => String(a.Nature).localeCompare(String(b.Nature)));
    else list.sort((a, b) => this.historyTimestamp(b) - this.historyTimestamp(a));

    document.getElementById("dHistoryCountLabel").textContent = `${list.length} record(s)`;
    const wrap = document.getElementById("dHistoryList");
    if (!list.length) {
      wrap.innerHTML = `<div class="card muted small">No matching reported records.</div>`;
      return;
    }

    wrap.innerHTML = list.map(t => {
      const dir = t.Direction || "Outward";
      const isNil = this.isNilCollection(t);

      let row3Text = "";
      let row4Text = "";

      if (isNil) {
        row3Text = `${DateTimeHelper.formatShort(t.Created_DateTime) || "—"} - Nil Visit`;
      } else if (dir === "Inward") {
        row3Text = `${DateTimeHelper.formatShort(t.Completed_DateTime) || "—"} - ${t.Stage2_Receiver_Name || "—"}`;
      } else if (dir === "Enquiry") {
        row3Text = `${DateTimeHelper.formatShort(t.Reply_DateTime) || "—"} - ${t.Respondent_Name || "—"}`;
        row4Text = `${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"} - ${t.Enquirer_Name || "—"}${t.Report_Method ? " (" + t.Report_Method + ")" : ""}`;
      } else if (dir === "Round-Trip") {
        row3Text = `${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"} - ${t.Stage2_Receiver_Name || "—"}`;
        row4Text = t.Receipt_Given === "Yes"
          ? `${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"} - ${t.Receiver_Name || "—"}`
          : `No Receipt${t.Receipt_No_Reason ? " - " + t.Receipt_No_Reason : ""}`;
      } else {
        row3Text = `${DateTimeHelper.formatShort(t.Completed_DateTime) || "—"} - ${t.Stage2_Receiver_Name || "—"}`;
        row4Text = t.Receipt_Given === "Yes"
          ? `${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"} - ${t.Receiver_Name || "—"}`
          : `No Receipt${t.Receipt_No_Reason ? " - " + t.Receipt_No_Reason : ""}`;
      }

      return `
        <div class="history-item">
          <div class="card-line">
            <div class="card-line-text">
              ${this.getDirectionBadgeHTML(t)}
              <strong style="margin-left:4px;">${t.Office_Name}</strong>${t.Section ? ` <span class="muted small">• ${t.Section}</span>` : ""}
            </div>
            <div class="card-line-actions">
              <button type="button" class="btn-mini accent" data-inspect-dtask="${t.Task_ID}">View</button>
            </div>
          </div>
          ${this.buildItemLinesHTML(t)}
          <div class="card-line small muted">
            <span class="card-line-text">${row3Text}</span>
          </div>
          ${row4Text ? `
            <div class="card-line small muted">
              <span class="card-line-text">${row4Text}</span>
            </div>` : ""}
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
  // STRUCTURED 3-SECTION TASK DETAILED REPORT MODAL
  // =========================================================
  openReportModal(taskId) {
    const t = AppStore.deliveries.find(x => String(x.Task_ID) === String(taskId));
    if (!t) return;
    this.inspectingTaskId = taskId;
    const dir = t.Direction || "Outward";
    const isNil = this.isNilCollection(t);

    let atts = [];
    try { atts = JSON.parse(t.Attachments_JSON || "[]"); } catch (e) {}

    let items = [];
    try { items = JSON.parse(t.Items_JSON || "[]"); } catch (e) {}
    if (!items.length && !isNil && dir !== "Enquiry") {
      items = [{ nature: t.Nature || "File", number: "", description: t.Description || "" }];
    }

    const itemsSectionHTML = items.map((it, idx) => {
      const nat = it.nature || t.Nature || "File";
      const num = it.number ? ` #${it.number}` : "";
      const desc = it.description || (idx === 0 ? t.Description : "") || "";
      return `<div class="report-item-line"><strong>${idx + 1}. ${nat}${num}</strong>${desc ? ` — ${desc}` : ""}</div>`;
    }).join("");

    let bodyHTML = `
      <div class="report-hero">
        <div class="row-between">
          ${this.getDirectionBadgeHTML(t)}
          <span class="small muted">${t.Urgency || "Normal"}</span>
        </div>
        <div class="report-hero-title">${t.Office_Name}</div>
        ${(t.Designation || t.Section) ? `<div class="small muted mt-6">${[t.Designation, t.Section ? "Sec: " + t.Section : ""].filter(Boolean).join(" • ")}</div>` : ""}
      </div>
    `;

    if (isNil) {
      bodyHTML += `
        <div class="report-section">
          <div class="report-section-title">Duty Visit Log</div>
          <div class="report-kv"><span class="report-kv-lbl">Date & Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Created_DateTime)}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Collection Result</span><span class="report-kv-val">Nil (No pending documents)</span></div>
        </div>
        ${t.Description ? `<div class="report-note-box"><strong>Remarks:</strong> ${t.Description}</div>` : ""}
      `;
    } else if (dir === "Enquiry") {
      let enqs = [];
      try { enqs = JSON.parse(t.Enquiries_JSON || "[]"); } catch (e) {}
      const enqLines = enqs.filter(e => e.question).length
        ? enqs.filter(e => e.question).map((e, i) => `<div class="report-item-line"><strong>${i + 1}.</strong> ${e.question}</div>`).join("")
        : `<div class="report-item-line">${t.Enquiry_Text || "—"}</div>`;

      bodyHTML += `
        <div class="report-section">
          <div class="report-section-title">1. Enquiry Details</div>
          <div class="report-kv"><span class="report-kv-lbl">Enquirer</span><span class="report-kv-val">${t.Enquirer_Name || "—"}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Date & Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Created_DateTime)}</span></div>
          <div class="mt-6">${enqLines}</div>
        </div>
        <div class="report-section">
          <div class="report-section-title">2. Reply & Reporting</div>
          <div class="report-item-line" style="margin-bottom:6px;"><strong>Reply:</strong> ${t.Reply_Text || "—"}</div>
          <div class="report-kv"><span class="report-kv-lbl">Respondent</span><span class="report-kv-val">${t.Respondent_Name || "—"}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Reply Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Reply_DateTime) || "—"}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Reported Status</span><span class="report-kv-val">${t.Report_Status || "—"} (${t.Report_Method || "—"})</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Reported Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"}</span></div>
        </div>
        ${t.Stage2_Comments ? `<div class="report-note-box"><strong>Comments:</strong> ${t.Stage2_Comments}</div>` : ""}
      `;
    } else if (dir === "Round-Trip") {
      let stops = [];
      try { stops = JSON.parse(t.RoundTrip_Stops_JSON || "[]"); } catch (e) {}
      const stopsLines = stops.filter(s => s.office).map((s, i) => `
        <div class="report-item-line">
          <strong>Office #${i + 1}: ${s.office}</strong>
          <div class="small muted">${[s.designation, s.section, s.action].filter(Boolean).join(" • ")} (${DateTimeHelper.formatShort(s.dt)})</div>
        </div>
      `).join("");

      bodyHTML += `
        <div class="report-section">
          <div class="report-section-title">1. File Preparation (${t.Item_Count})</div>
          <div class="report-kv"><span class="report-kv-lbl">File Given By</span><span class="report-kv-val">${t.File_Given_By || "—"}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Prepared Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Created_DateTime)}</span></div>
          <div class="mt-6">${itemsSectionHTML}</div>
          ${t.Has_Attachments === "Yes" ? `<div class="small muted mt-6"><strong>Attachments:</strong> ${atts.map(a => `${a.nature} ${a.number}`).join(", ")}</div>` : ""}
        </div>
        <div class="report-section">
          <div class="report-section-title">2. Office Movement Trail</div>
          ${stopsLines || "<div class='small muted'>No stops recorded</div>"}
        </div>
        <div class="report-section">
          <div class="report-section-title">3. Return to Office</div>
          <div class="report-kv"><span class="report-kv-lbl">File/Doc Received By</span><span class="report-kv-val">${t.Stage2_Receiver_Name || "—"}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Return Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Reported_DateTime) || "—"}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Receipt Received</span><span class="report-kv-val">${t.Receipt_Given || "—"}${t.Receipt_Given === "Yes" && t.Receiver_Name ? " (" + t.Receiver_Name + ")" : ""}${t.Receipt_No_Reason ? " (" + t.Receipt_No_Reason + ")" : ""}</span></div>
        </div>
        ${t.Stage2_Comments ? `<div class="report-note-box"><strong>Comments:</strong> ${t.Stage2_Comments}</div>` : ""}
      `;
    } else {
      const isInward = dir === "Inward";
      bodyHTML += `
        <div class="report-section">
          <div class="report-section-title">1. Document Details (${t.Item_Count})</div>
          ${itemsSectionHTML}
          ${t.Has_Attachments === "Yes" ? `<div class="small muted mt-6"><strong>Attachments:</strong> ${atts.map(a => `${a.nature} ${a.number}`).join(", ")}</div>` : ""}
        </div>
        <div class="report-section">
          <div class="report-section-title">2. Timeline & Custody</div>
          <div class="report-kv"><span class="report-kv-lbl">${isInward ? "Collected Time" : "Prepared Time"}</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Created_DateTime)}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">${isInward ? "Handover Time" : "Delivered Time"}</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Completed_DateTime)}</span></div>
          <div class="report-kv"><span class="report-kv-lbl">Receiver's Name</span><span class="report-kv-val">${t.Stage2_Receiver_Name || "—"}</span></div>
          ${!isInward ? `
            <div class="report-kv"><span class="report-kv-lbl">Receipt Status</span><span class="report-kv-val">${t.Receipt_Given}${t.Receipt_No_Reason ? " (" + t.Receipt_No_Reason + ")" : ""}</span></div>
            <div class="report-kv"><span class="report-kv-lbl">Receipt Receiver</span><span class="report-kv-val">${t.Receiver_Name || "—"}</span></div>
            <div class="report-kv"><span class="report-kv-lbl">Reported Time</span><span class="report-kv-val">${DateTimeHelper.formatShort(t.Reported_DateTime)}</span></div>
          ` : ""}
        </div>
        ${t.Stage2_Comments ? `<div class="report-note-box"><strong>Comments:</strong> ${t.Stage2_Comments}</div>` : ""}
      `;
    }

    document.getElementById("deliveryReportBody").innerHTML = bodyHTML;

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
        if (dir === "Inward") {
          this.setToggle("dCollectionResultToggle", "Docs");
        }
        this.applyDirectionUI(dir);
        this.renderDynamicItems(this.collectDynamicItems());
        this.updateStageSummaries();
        this.refreshLearnedOptions();
      });
    });

    document.querySelectorAll("#dCollectionResultToggle button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.applyCollectionResultUI(btn.dataset.val);
        this.updateStageSummaries();
      });
    });

    document.getElementById("btnAddEnquiryItem").addEventListener("click", () => {
      const list = this.collectDynamicEnquiries();
      list.push({ question: "" });
      this.renderDynamicEnquiries(list);
    });
    document.getElementById("dDynamicEnquiriesWrap").addEventListener("click", (e) => {
      if (e.target.dataset.rmEnq !== undefined) {
        const idx = parseInt(e.target.dataset.rmEnq, 10);
        const list = this.collectDynamicEnquiries();
        list.splice(idx, 1);
        this.renderDynamicEnquiries(list);
      }
    });

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

    document.getElementById("dRoundTripStopsList").addEventListener("click", (e) => {
      if (e.target.dataset.rtaction) {
        const card = e.target.closest(".rt-stop-card");
        if (card) card.querySelector(".rt-stop-action").value = e.target.dataset.rtaction;
      }
      if (e.target.dataset.rmRtstop !== undefined) {
        const idx = parseInt(e.target.dataset.rmRtstop, 10);
        const stops = this.collectRoundTripStops();
        stops.splice(idx, 1);
        this.renderRoundTripStops(stops);
      }
      if (e.target.dataset.connect) {
        const grp = e.target.closest(".rt-connect-group");
        const idx = parseInt(grp.dataset.stopIdx, 10);
        const val = e.target.dataset.connect;
        const stops = this.collectRoundTripStops();

        if (val === "Yes") {
          stops[idx].connectNext = "Yes";
          if (idx === stops.length - 1) {
            stops.push({ office: "", designation: "", section: "", action: "", dt: DateTimeHelper.nowLocalISO(), connectNext: "No" });
          }
          this.renderRoundTripStops(stops);
        } else {
          const trimmed = stops.slice(0, idx + 1);
          trimmed[idx].connectNext = "No";
          this.renderRoundTripStops(trimmed);
        }
      }
    });

    document.querySelectorAll("#dRtReceiptGivenGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("dRtReceiptGivenGroup", btn.dataset.val);
        document.getElementById("dRtReceiptNoBox").classList.toggle("hidden", btn.dataset.val !== "No");
        document.getElementById("dRtReceiptYesFields").classList.toggle("hidden", btn.dataset.val !== "Yes");
      });
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

    document.querySelectorAll("#dScheduledDirTabs button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("dScheduledDirTabs", btn.dataset.durg);
        this.scheduledDirFilter = btn.dataset.durg;
        this.renderActiveTasks();
      });
    });

    // Use mousedown/pointerdown for focus-reveal chips so tapping a chip fills before blur hides it
    document.getElementById("view-delivery").addEventListener("pointerdown", (e) => {
      if (e.target.dataset.dfill) {
        e.preventDefault();
        const el = document.getElementById(e.target.dataset.dfill);
        el.value = e.target.dataset.dval;
        if (e.target.dataset.dfill === "dNature") this.renderDynamicItems(this.collectDynamicItems());
      }
      if (e.target.dataset.dpattern) {
        e.preventDefault();
        const firstEmpty = [...document.querySelectorAll(".d-item-number")].find(i => !i.value.trim()) || document.querySelector(".d-item-number");
        if (firstEmpty) {
          firstEmpty.value = e.target.dataset.dpattern;
          firstEmpty.focus();
        }
      }
      if (e.target.dataset.rmethod) {
        e.preventDefault();
        document.getElementById("dReportMethodInput").value = e.target.dataset.rmethod;
      }
    });

    document.getElementById("view-delivery").addEventListener("click", (e) => {
      if (e.target.dataset.loadDtask) {
        this.loadTask(e.target.dataset.loadDtask, parseInt(e.target.dataset.dopenStage || "1", 10));
      }
      if (e.target.dataset.inspectDtask) {
        this.openReportModal(e.target.dataset.inspectDtask);
      }
    });

    document.getElementById("btnSortTasksAuto").addEventListener("click", () => {
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

    // Collapsible Reported Advanced Filters Toggle
    document.getElementById("btnToggleHistoryFilters").addEventListener("click", () => {
      this.filtersOpen = !this.filtersOpen;
      document.getElementById("dHistoryAdvancedFilters").classList.toggle("hidden", !this.filtersOpen);
      this.renderHistory();
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
      document.getElementById("deliveryReportFooter").classList.remove("hidden");
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
