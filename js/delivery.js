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
    return t.Delivery_Status === "Delivered" && Boolean(t.Receipt_Given);
  },

  // =========================================================
  // DIRECTION-AWARE UI LABELS & STAGE 3 VISIBILITY
  // =========================================================
  applyDirectionUI(direction) {
    const isInward = direction === "Inward";
    this.setToggle("dDirectionGroup", direction);

    document.getElementById("dActiveTaskBanner").textContent = this.currentTask && AppStore.deliveries.some(t => t.Task_ID === this.currentTask.Task_ID)
      ? `${isInward ? "📥 Inward" : "📤 Outward"}: ${this.currentTask.Office_Name || "Task"}`
      : (isInward ? "New Inward Collection" : "New Outward Delivery");

    document.getElementById("dStage1Tag").textContent = isInward ? "STAGE 1 • COLLECTION DETAILS" : "STAGE 1 • TASK CREATION";
    document.getElementById("lblDCreatedDT").textContent = isInward ? "1. Collection Date & Time" : "1. Date & Time";
    document.getElementById("lblDOfficeName").textContent = isInward ? "2. From Office Name" : "2. To Office Name";
    document.getElementById("lblDSection").textContent = isInward ? "4. Receiving Section (Our Office)" : "4. Section";

    document.getElementById("dPlannedDTGroup").classList.toggle("hidden", isInward);
    document.getElementById("lblDUrgency").textContent = isInward ? "12. Urgency Scale" : "13. Urgency Scale";

    document.getElementById("dStage2Tag").textContent = isInward ? "STAGE 2 • HANDOVER TO OUR OFFICE" : "STAGE 2 • DELIVERY COMPLETION";
    document.getElementById("lblDCompletedDT").textContent = isInward ? "3. Handover Date & Time" : "3. Delivery Date & Time";
    document.getElementById("lblDStage2Receiver").textContent = isInward
      ? "4. Receiver's Name (Our Office Staff)"
      : "4. Receiver's Name (At External Office)";
    document.getElementById("dStage2ReceiverName").placeholder = isInward
      ? "Staff in our office who received the collected file/doc..."
      : "Person at external office who accepted the file/doc...";
    document.getElementById("btnSaveDStage2").textContent = isInward
      ? "Save Stage 2 & Move to History"
      : "Save Stage 2";

    document.getElementById("dCard3").classList.toggle("hidden", isInward);
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
      Reported_DateTime: ""
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
    this.currentTask = { ...found, Direction: found.Direction || "Outward" };
    this.natureMode = found.Nature_Mode || "Same";
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
      const inp = document.getElementById("dCompletedDT");
      if (!inp.value) {
        const stored = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Completed_DateTime);
        inp.value = stored || DateTimeHelper.nowLocalISO();
      }
      inp.max = DateTimeHelper.nowLocalISO();
    }
    if (stageNum === 3) {
      const inp = document.getElementById("dReportedDT");
      if (!inp.value) {
        const stored = DateTimeHelper.toDateTimeLocalValue(this.currentTask.Reported_DateTime);
        inp.value = stored || DateTimeHelper.nowLocalISO();
      }
      inp.max = DateTimeHelper.nowLocalISO();
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
      ["dCreatedDT", "dCompletedDT", "dReportedDT"].forEach(id => {
        const inp = document.getElementById(id);
        if (!inp.value) {
          inp.value = DateTimeHelper.nowLocalISO();
        }
        inp.max = DateTimeHelper.nowLocalISO();
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

    this.setToggle("dStatusGroup", t.Delivery_Status || "");
    document.getElementById("dNotDeliveredBox").classList.toggle("hidden", t.Delivery_Status !== "Not Delivered");
    document.getElementById("dNotDelivReason").value = t.Not_Delivered_Reason || "";
    document.getElementById("dCompletedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Completed_DateTime);
    document.getElementById("dStage2ReceiverName").value = t.Stage2_Receiver_Name || "";
    document.getElementById("dStage2Comments").value = t.Stage2_Comments || "";

    this.setToggle("dReceiptGivenGroup", t.Receipt_Given || "");
    document.getElementById("dReceiptNoBox").classList.toggle("hidden", t.Receipt_Given !== "No");
    document.getElementById("dReceiptYesFields").classList.toggle("hidden", t.Receipt_Given !== "Yes");
    document.getElementById("dReceiptNoReason").value = t.Receipt_No_Reason || "";
    document.getElementById("dReceiverName").value = t.Receiver_Name || "";
    document.getElementById("dReportedDT").value = DateTimeHelper.toDateTimeLocalValue(t.Reported_DateTime);

    this.updateStageSummaries();
    this.refreshLearnedOptions();
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
  // SAVE STAGES 1, 2 & 3
  // =========================================================
  async saveStage1() {
    const office = document.getElementById("dOfficeName").value.trim();
    if (!office) {
      showToast("Enter Office Name.");
      document.getElementById("dOfficeName").focus();
      return;
    }

    const direction = this.getToggle("dDirectionGroup") || "Outward";
    const nature = document.getElementById("dNature").value.trim() || "File";
    const items = this.collectDynamicItems();
    const hasAtt = this.getToggle("dAttachToggleGroup") || "No";
    const atts = this.collectAttachments();

    this.currentTask.Direction = direction;
    this.currentTask.Created_DateTime = document.getElementById("dCreatedDT").value || DateTimeHelper.nowLocalISO();
    this.currentTask.Office_Name = office;
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
    this.currentTask.Urgency = this.getToggle("dUrgencyGroup") || "Normal";

    this.upsertLocalTask(this.currentTask);
    this.updateStageSummaries();
    await AppStore.pushAction("saveDelivery", this.currentTask);
    showToast(`${direction === "Inward" ? "Inward Collection" : "Outward Task"} saved to Tasks ✓`);
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

    const isInward = (this.currentTask.Direction || "Outward") === "Inward";

    if (status === "Delivered" && isInward) {
      showToast("Inward Collection handed over & moved to History ✓");
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

    if (this.batchReportIds.length > 0) {
      const updatedList = [];
      this.batchReportIds.forEach(id => {
        const t = AppStore.deliveries.find(x => String(x.Task_ID) === String(id));
        if (t) {
          t.Receipt_Given = given;
          t.Receipt_No_Reason = given === "No" ? noReason : "";
          t.Receiver_Name = given === "Yes" ? receiver : "";
          t.Reported_DateTime = given === "Yes" ? repDT : DateTimeHelper.nowLocalISO();
          updatedList.push({ ...t });
        }
      });
      this.batchReportIds = [];
      this.selectedUnrepIds.clear();
      document.getElementById("dBatchReportBanner").classList.add("hidden");
      await AppStore.pushAction("saveDeliveryBatch", updatedList);
      showToast(`Reported ${updatedList.length} tasks → Moved to History ✓`);
      this.collapseAllStages();
      this.switchSubView("history");
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
  // GROUP STAGE 3 REPORTING MODAL
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
    const isInward = (t.Direction || "Outward") === "Inward";
    const s1Done = Boolean(t.Office_Name && t.Created_DateTime);

    document.getElementById("dSummary1").textContent = s1Done
      ? `${isInward ? "From" : "To"} ${t.Office_Name} • ${t.Items_Summary || t.Nature} [${t.Urgency}]`
      : (isInward ? "Record Collection Details" : "Create Delivery Task");
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

    const isInward = (this.currentTask && (this.currentTask.Direction || "Outward") === "Inward");
    const s2Pool = AppStore.deliveries
      .filter(t => (t.Direction || "Outward") === (isInward ? "Inward" : "Outward"))
      .map(t => t.Stage2_Receiver_Name);
    const fallbackStaff = isInward ? AppStore.deliveries.map(t => t.Receiver_Name) : [];
    const s2Receivers = AppStore.rankByFrequency([...s2Pool, ...fallbackStaff]).slice(0, 6);
    document.getElementById("dStage2ReceiverChips").innerHTML = s2Receivers.map((n, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-dfill="dStage2ReceiverName" data-dval="${n}">${n}</button>`
    ).join("");

    const recNoReasons = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Receipt_No_Reason), CONFIG.DEFAULT_RECEIPT_NO_REASONS).slice(0, 5);
    document.getElementById("dReceiptNoChips").innerHTML = recNoReasons.map(r =>
      `<button type="button" class="smart-chip" data-dfill="dReceiptNoReason" data-dval="${r}">${r}</button>`
    ).join("");

    const receivers = AppStore.rankByFrequency(AppStore.deliveries.map(t => t.Receiver_Name)).slice(0, 6);
    document.getElementById("dReceiverChips").innerHTML = receivers.map((n, i) =>
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
    let active = AppStore.deliveries.filter(t => t.Delivery_Status !== "Delivered");
    document.getElementById("dTasksCount").textContent = active.length;

    if (this.urgencyFilter === "OUTWARD") {
      active = active.filter(t => (t.Direction || "Outward") === "Outward");
    } else if (this.urgencyFilter === "INWARD") {
      active = active.filter(t => (t.Direction || "Outward") === "Inward");
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
      const isInward = (t.Direction || "Outward") === "Inward";
      const uClass = t.Urgency === "Very Urgent" ? "urg-very" : t.Urgency === "Urgent" ? "urg-urgent" : "urg-normal";
      const cardClass = t.Urgency === "Very Urgent" ? "very-urgent" : t.Urgency === "Urgent" ? "urgent" : "";
      const dirBadge = isInward
        ? `<span class="badge" style="background:#ccfbf1; color:#0f766e;">📥 Inward</span>`
        : `<span class="badge primary">📤 Outward</span>`;

      return `
        <div class="history-item ${cardClass}">
          <div class="row-between">
            <div>
              ${dirBadge}
              <strong style="margin-left:4px;">${t.Office_Name}</strong>
            </div>
            <span class="urgency-badge ${uClass}">${t.Urgency}</span>
          </div>
          <div class="small mt-6">${t.Items_Summary || t.Nature}${t.Section ? " • Sec: " + t.Section : ""}</div>
          ${t.Description ? `<div class="small muted mt-6">${t.Description}</div>` : ""}
          <div class="small muted mt-6">
            ${isInward
              ? `Collected: ${DateTimeHelper.formatShort(t.Created_DateTime)} (Awaiting handover to our office)`
              : (t.Planned_Delivery_DT ? `Planned: ${DateTimeHelper.formatShort(t.Planned_Delivery_DT)}` : `Created: ${DateTimeHelper.formatShort(t.Created_DateTime)}`)}
          </div>
          ${t.Delivery_Status === "Not Delivered" ? `<div class="exception-pill">Not Delivered: ${t.Not_Delivered_Reason}</div>` : ""}
          <div class="row-between mt-8">
            <button type="button" class="btn-mini" data-load-dtask="${t.Task_ID}" data-dopen-stage="1">Edit</button>
            <button type="button" class="btn-mini accent" data-load-dtask="${t.Task_ID}" data-dopen-stage="2">
              ${isInward ? "Hand Over to Office →" : "Update Delivery →"}
            </button>
          </div>
        </div>`;
    }).join("");
  },

  renderUnreportedTasks() {
    const unrep = AppStore.deliveries.filter(t =>
      (t.Direction || "Outward") === "Outward" &&
      t.Delivery_Status === "Delivered" &&
      !t.Receipt_Given
    );
    document.getElementById("dUnrepCount").textContent = unrep.length;
    document.getElementById("dSelectedUnrepCount").textContent = this.selectedUnrepIds.size;

    const wrap = document.getElementById("dUnreportedTasksList");
    if (!unrep.length) {
      wrap.innerHTML = `<div class="card muted small">All delivered outward tasks have been reported.</div>`;
      return;
    }

    wrap.innerHTML = unrep.map(t => {
      const checked = this.selectedUnrepIds.has(t.Task_ID);
      return `
        <div class="history-item ${checked ? "checked" : ""}">
          <div class="row-between">
            <label class="row-gap" style="margin:0; cursor:pointer; flex:1;">
              <input type="checkbox" data-unrep-chk="${t.Task_ID}" ${checked ? "checked" : ""} style="width:18px; height:18px;" />
              <strong>${t.Office_Name}</strong>
            </label>
            <button type="button" class="btn-mini accent" data-load-dtask="${t.Task_ID}" data-dopen-stage="3">Report →</button>
          </div>
          <div class="small mt-6">${t.Items_Summary || t.Nature}${t.Stage2_Receiver_Name ? ` • Received by: <strong>${t.Stage2_Receiver_Name}</strong>` : ""}</div>
          <div class="small muted mt-6">Delivered: ${DateTimeHelper.formatShort(t.Completed_DateTime)}</div>
        </div>`;
    }).join("");
  },

  historyTimestamp(t) {
    return DateTimeHelper.timestampMs(t.Reported_DateTime || t.Completed_DateTime || t.Created_DateTime, t.Task_ID);
  },

  renderHistory() {
    const completed = AppStore.deliveries.filter(t => this.isCompletedLifecycle(t));

    this.populateSelectFilter("dHistoryFilterOffice", completed.map(t => t.Office_Name), "Office: All");
    this.populateSelectFilter("dHistoryFilterNature", completed.map(t => t.Nature), "Nature: All");
    this.populateSelectFilter("dHistoryFilterDesig", completed.map(t => t.Designation), "Designation: All");
    const allReceivers = completed.flatMap(t => [t.Stage2_Receiver_Name, t.Receiver_Name]).filter(Boolean);
    this.populateSelectFilter("dHistoryFilterReceiver", allReceivers, "Receiver: All");

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
    if (fReceiver !== "ALL") list = list.filter(t => t.Stage2_Receiver_Name === fReceiver || t.Receiver_Name === fReceiver);
    if (dFrom) list = list.filter(t => (t.Completed_DateTime || "").slice(0, 10) >= dFrom);
    if (dTo) list = list.filter(t => (t.Completed_DateTime || "").slice(0, 10) <= dTo);

    if (q) {
      list = list.filter(t => [
        t.Office_Name, t.Designation, t.Section, t.Nature, t.Items_Summary,
        t.Description, t.Stage2_Comments, t.Stage2_Receiver_Name, t.Receiver_Name, t.Receipt_No_Reason
      ].filter(Boolean).join(" ").toLowerCase().includes(q));
    }

    // Default: Newest First
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
      const isInward = (t.Direction || "Outward") === "Inward";
      const dirBadge = isInward
        ? `<span class="badge" style="background:#ccfbf1; color:#0f766e;">📥 Collected</span>`
        : `<span class="badge ${t.Receipt_Given === "Yes" ? "online" : "offline"}">📤 ${t.Receipt_Given === "Yes" ? "Receipt: Yes" : "No Receipt"}</span>`;

      return `
        <div class="history-item">
          <div class="row-between">
            <strong>${t.Office_Name}</strong>
            <div class="row-gap">
              ${dirBadge}
              <button type="button" class="btn-mini accent" data-inspect-dtask="${t.Task_ID}">View</button>
            </div>
          </div>
          <div class="small mt-6">${t.Items_Summary || t.Nature}${t.Section ? " • " + t.Section : ""}</div>
          <div class="small muted mt-6">
            ${isInward
              ? `Collected: ${DateTimeHelper.formatShort(t.Created_DateTime)} • Handed over: ${DateTimeHelper.formatShort(t.Completed_DateTime)} → <strong>${t.Stage2_Receiver_Name || "—"}</strong>`
              : `Delivered: ${DateTimeHelper.formatShort(t.Completed_DateTime)}${t.Stage2_Receiver_Name ? ` → <strong>${t.Stage2_Receiver_Name}</strong>` : ""}${t.Receiver_Name ? ` • Receipt to: <strong>${t.Receiver_Name}</strong>` : ""}`}
          </div>
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
    const isInward = (t.Direction || "Outward") === "Inward";

    let atts = [];
    try { atts = JSON.parse(t.Attachments_JSON || "[]"); } catch (e) {}

    document.getElementById("deliveryReportBody").innerHTML = `
      <div class="report-grid">
        <div class="report-row"><span class="report-lbl">Direction</span><span class="report-val">${isInward ? "📥 Inward (Collection to Our Office)" : "📤 Outward (Delivery to External Office)"}</span></div>
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
      </div>
    `;

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

    // Group Reporting Modal Listeners
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

    // History Filters
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

    // Read-Only Report Modal, Protected Edit Unlock & Single-Record Delete Warning
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
