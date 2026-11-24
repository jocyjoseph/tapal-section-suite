const DeliveryModule = {
  currentTask: null,
  natureMode: "Same",
  itemsDraft: [{ nature: "File", number: "" }],
  attachmentsDraft: [""],
  expandAllStages: false,
  activeStage: 0,
  activeUrgencyFilter: "ALL",
  selectedUnrepIds: new Set(),
  batchReportIds: [],
  viewingReportTaskId: null,

  init() {
    this.bindEvents();
    this.startNewTask(false);
    AppStore.onUpdate(() => this.refreshAllViews());
  },

  switchSubView(subName, preserveBatch = false) {
    document.querySelectorAll("[data-dsub]").forEach(b => b.classList.toggle("active", b.dataset.dsub === subName));
    document.querySelectorAll(".dsub-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(`dsub-${subName}`).classList.remove("hidden");
    if (!preserveBatch) {
      this.batchReportIds = [];
      const banner = document.getElementById("dBatchReportBanner");
      if (banner) banner.classList.add("hidden");
    }
    this.refreshAllViews();
  },

  // =========================================================
  // TASK LIFECYCLE & STAGE ACCORDIONS
  // =========================================================
  startNewTask(notify = true) {
    this.batchReportIds = [];
    const banner = document.getElementById("dBatchReportBanner");
    if (banner) banner.classList.add("hidden");

    this.currentTask = {
      Task_ID: "TASK-" + Date.now(),
      Created_DateTime: "",
      Office_Name: "",
      Designation: "",
      Section: "",
      Nature: "File",
      Item_Count: 1,
      Nature_Mode: "Same",
      Items_JSON: "[]",
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
      Stage2_Comments: "",
      Receipt_Given: "",
      Receipt_No_Reason: "",
      Receiver_Name: "",
      Reported_DateTime: ""
    };

    this.natureMode = "Same";
    this.itemsDraft = [{ nature: "File", number: "" }];
    this.attachmentsDraft = [""];

    this.populateForm(this.currentTask);
    this.collapseAllStages();
    this.refreshAllViews();
    if (notify) showToast("Ready for New Task");
  },

  loadTask(taskId, targetStage = 1) {
    const found = AppStore.deliveries.find(t => String(t.Task_ID) === String(taskId));
    if (!found) return;
    this.batchReportIds = [];
    const banner = document.getElementById("dBatchReportBanner");
    if (banner) banner.classList.add("hidden");

    this.currentTask = { ...found };
    this.natureMode = found.Nature_Mode || "Same";
    try {
      const parsedItems = JSON.parse(found.Items_JSON || "[]");
      this.itemsDraft = parsedItems.length ? parsedItems : [{ nature: found.Nature || "File", number: "" }];
    } catch (e) {
      this.itemsDraft = [{ nature: found.Nature || "File", number: "" }];
    }

    try {
      const parsedAtt = JSON.parse(found.Attachments_JSON || "[]");
      this.attachmentsDraft = parsedAtt.length ? parsedAtt : [""];
    } catch (e) {
      this.attachmentsDraft = [""];
    }

    this.switchSubView("entry");
    this.populateForm(this.currentTask);
    this.openStage(targetStage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  openStage(stageNum) {
    this.activeStage = stageNum;

    if (stageNum === 1) {
      const inp = document.getElementById("dCreatedDT");
      if (!inp.value) {
        inp.value = DateTimeHelper.nowLocalISO();
        inp.max = inp.value;
      }
    }
    if (stageNum === 2) {
      const inp = document.getElementById("dCompletedDT");
      if (!inp.value) {
        inp.value = DateTimeHelper.nowLocalISO();
        inp.max = inp.value;
      }
    }

    [1, 2, 3].forEach(n => {
      const open = this.expandAllStages || n === stageNum;
      document.getElementById(`dBody${n}`).classList.toggle("collapsed", !open);
      document.getElementById(`dChev${n}`).textContent = open ? "▼" : "▶";
    });
  },

  collapseAllStages() {
    this.activeStage = 0;
    this.expandAllStages = false;
    document.getElementById("btnToggleExpandAllDelivery").textContent = "Expand All";
    [1, 2, 3].forEach(n => {
      document.getElementById(`dBody${n}`).classList.add("collapsed");
      document.getElementById(`dChev${n}`).textContent = "▶";
    });
  },

  populateForm(t) {
    document.getElementById("dActiveTaskBanner").textContent = t.Office_Name ? `${t.Office_Name}` : "New Task";
    document.getElementById("dCreatedDT").value = t.Created_DateTime || "";
    document.getElementById("dOfficeName").value = t.Office_Name || "";
    document.getElementById("dDesignation").value = t.Designation || "";
    document.getElementById("dSection").value = t.Section || "";
    document.getElementById("dNature").value = t.Nature || "File";
    document.getElementById("dItemCount").value = t.Item_Count || 1;
    document.getElementById("dDescription").value = t.Description || "";

    this.setToggle("dAttachToggleGroup", t.Has_Attachments || "No");
    document.getElementById("dAttachCount").value = t.Attachment_Count || 1;
    document.getElementById("dAttachmentsBox").classList.toggle("hidden", (t.Has_Attachments || "No") !== "Yes");

    document.getElementById("dPlannedDT").value = t.Planned_Delivery_DT || "";
    this.setToggle("dUrgencyGroup", t.Urgency || "Normal");

    this.syncNatureUI();
    this.renderAttachmentRows();

    // Stage 2
    this.setToggle("dStatusGroup", t.Delivery_Status || "");
    document.getElementById("dNotDeliveredBox").classList.toggle("hidden", t.Delivery_Status !== "Not Delivered");
    document.getElementById("dNotDelivReason").value = t.Not_Delivered_Reason || "";
    document.getElementById("dCompletedDT").value = t.Completed_DateTime || "";
    document.getElementById("dStage2Comments").value = t.Stage2_Comments || "";

    // Stage 3
    this.setToggle("dReceiptGivenGroup", t.Receipt_Given || "");
    this.updateStage3ConditionalFields(t.Receipt_Given || "", false);
    document.getElementById("dReceiptNoReason").value = t.Receipt_No_Reason || "";
    document.getElementById("dReceiverName").value = t.Receiver_Name || "";
    document.getElementById("dReportedDT").value = t.Reported_DateTime || "";

    this.updateStageSummaries();
  },

  // =========================================================
  // DYNAMIC NATURE, COUNT, SAME/VARIOUS & ATTACHMENTS
  // =========================================================
  syncNatureUI() {
    const nature = document.getElementById("dNature").value.trim() || "File";
    const count = Math.max(1, parseInt(document.getElementById("dItemCount").value || "1", 10));

    document.getElementById("lblDItemCount").textContent = `6. No. of ${nature}`;
    document.getElementById("lblDItemNumbers").textContent =
      count > 1 && this.natureMode === "Various"
        ? `7. Individual Item Nature & Number (${count} items)`
        : `7. ${nature} No.`;

    const svWrap = document.getElementById("dSameVariousWrap");
    svWrap.classList.toggle("hidden", count <= 1);
    document.getElementById("btnDModeSame").classList.toggle("selected", this.natureMode === "Same");
    document.getElementById("btnDModeVarious").classList.toggle("selected", this.natureMode === "Various");

    while (this.itemsDraft.length < count) {
      this.itemsDraft.push({ nature, number: "" });
    }
    if (this.itemsDraft.length > count) {
      this.itemsDraft = this.itemsDraft.slice(0, count);
    }
    if (this.natureMode === "Same") {
      this.itemsDraft.forEach(item => { item.nature = nature; });
    }

    this.renderDynamicItemRows();
  },

  renderDynamicItemRows() {
    const wrap = document.getElementById("dDynamicItemsWrap");
    const alphaNatures = this.getAlphabeticalList(AppStore.deliveries.map(d => d.Nature), CONFIG.DEFAULT_NATURES);

    if (this.natureMode === "Various" && this.itemsDraft.length > 1) {
      wrap.innerHTML = this.itemsDraft.map((item, idx) => `
        <div class="row-gap mb-6">
          <select data-item-nature="${idx}" style="max-width:145px;" title="Nature for Item #${idx + 1}">
            ${alphaNatures.map(n => `<option value="${n}" ${item.nature === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
          <input type="text" data-item-num="${idx}" value="${item.number || ""}" placeholder="Item #${idx + 1} Number..." />
        </div>
      `).join("");
    } else {
      wrap.innerHTML = this.itemsDraft.map((item, idx) => `
        <div class="row-gap mb-6">
          <input type="text" data-item-num="${idx}" value="${item.number || ""}" placeholder="${item.nature} #${idx + 1} Number..." />
        </div>
      `).join("");
    }
  },

  renderAttachmentRows() {
    const count = Math.max(1, parseInt(document.getElementById("dAttachCount").value || "1", 10));
    while (this.attachmentsDraft.length < count) this.attachmentsDraft.push("");
    if (this.attachmentsDraft.length > count) this.attachmentsDraft = this.attachmentsDraft.slice(0, count);

    document.getElementById("dAttachRowsWrap").innerHTML = this.attachmentsDraft.map((txt, idx) => `
      <div class="mb-6">
        <input type="text" data-att-idx="${idx}" value="${txt || ""}" placeholder="Attachment #${idx + 1} details..." />
      </div>
    `).join("");
  },

  buildItemsSummary(items, hasAtt, attCount) {
    const countsByNature = {};
    items.forEach(it => {
      const n = (it.nature || "File").trim();
      countsByNature[n] = (countsByNature[n] || 0) + 1;
    });
    const parts = Object.entries(countsByNature).map(([nat, cnt]) => {
      const label = cnt > 1 && !nat.endsWith("s") ? nat + "s" : nat;
      return `${cnt} ${label}`;
    });
    if (hasAtt === "Yes" && attCount > 0) {
      parts.push(`${attCount} Attachment${attCount > 1 ? "s" : ""}`);
    }
    return parts.join(" & ");
  },

  // =========================================================
  // ALPHABETICAL & FREQUENCY SELF-LEARNING LISTS
  // =========================================================
  getAlphabeticalList(storedValues, defaults = []) {
    const set = new Set(defaults);
    storedValues.forEach(v => {
      const clean = String(v || "").trim();
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  },

  refreshLearnedLists() {
    const offices = this.getAlphabeticalList(AppStore.deliveries.map(d => d.Office_Name), CONFIG.DEFAULT_OFFICES);
    document.getElementById("dOfficeChips").innerHTML = offices.slice(0, 8).map(o =>
      `<button type="button" class="smart-chip" data-dfill="dOfficeName" data-dval="${o}">${o}</button>`
    ).join("");
    document.getElementById("dOfficeList").innerHTML = offices.map(o => `<option value="${o}">`).join("");

    const desigs = this.getAlphabeticalList(AppStore.deliveries.map(d => d.Designation), CONFIG.DEFAULT_DESIGNATIONS);
    document.getElementById("dDesigChips").innerHTML = desigs.slice(0, 6).map(d =>
      `<button type="button" class="smart-chip" data-dfill="dDesignation" data-dval="${d}">${d}</button>`
    ).join("");
    document.getElementById("dDesigList").innerHTML = desigs.map(d => `<option value="${d}">`).join("");

    const sections = this.getAlphabeticalList(AppStore.deliveries.map(d => d.Section), CONFIG.DEFAULT_SECTIONS);
    document.getElementById("dSectionChips").innerHTML = sections.slice(0, 6).map(s =>
      `<button type="button" class="smart-chip" data-dfill="dSection" data-dval="${s}">${s}</button>`
    ).join("");
    document.getElementById("dSectionList").innerHTML = sections.map(s => `<option value="${s}">`).join("");

    const natures = this.getAlphabeticalList(AppStore.deliveries.map(d => d.Nature), CONFIG.DEFAULT_NATURES);
    document.getElementById("dNatureChips").innerHTML = natures.map(n =>
      `<button type="button" class="smart-chip" data-dnature-pick="${n}">${n}</button>`
    ).join("");
    document.getElementById("dNatureList").innerHTML = natures.map(n => `<option value="${n}">`).join("");

    const savedPrefixes = [];
    AppStore.deliveries.forEach(d => {
      try {
        JSON.parse(d.Items_JSON || "[]").forEach(it => {
          const m = String(it.number || "").match(/^([A-Za-z]+\/(?:[A-Za-z0-9]+\/)?|[A-Za-z]+-)/);
          if (m) savedPrefixes.push(m[1].toUpperCase());
        });
      } catch (e) {}
    });
    const patterns = this.getAlphabeticalList(savedPrefixes, CONFIG.DEFAULT_NO_PATTERNS);
    document.getElementById("dPatternChips").innerHTML = patterns.map(p =>
      `<button type="button" class="smart-chip" data-dpattern="${p}">${p}</button>`
    ).join("");

    document.getElementById("dNotDelivChips").innerHTML = CONFIG.DEFAULT_NOT_DELIVERED_REASONS.map(r =>
      `<button type="button" class="smart-chip" data-dfill="dNotDelivReason" data-dval="${r}">${r}</button>`
    ).join("");

    document.getElementById("dReceiptNoChips").innerHTML = CONFIG.DEFAULT_RECEIPT_NO_REASONS.map(r =>
      `<button type="button" class="smart-chip" data-dfill="dReceiptNoReason" data-dval="${r}">${r}</button>`
    ).join("");

    const receivers = AppStore.rankByFrequency([
      ...AppStore.deliveries.map(d => d.Receiver_Name),
      ...AppStore.batches.map(b => b.Received_By_Name)
    ]).slice(0, 6);
    document.getElementById("dReceiverChips").innerHTML = receivers.map((r, i) =>
      `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-dfill="dReceiverName" data-dval="${r}">${r}</button>`
    ).join("");
  },

  // =========================================================
  // SAVE STAGE 1, STAGE 2, AND SINGLE STAGE 3
  // =========================================================
  async saveStage1() {
    const office = document.getElementById("dOfficeName").value.trim();
    if (!office) {
      showToast("Please enter or select Office Name.");
      return;
    }

    const t = this.currentTask;
    t.Created_DateTime = document.getElementById("dCreatedDT").value || DateTimeHelper.nowLocalISO();
    t.Office_Name = office;
    t.Designation = document.getElementById("dDesignation").value.trim();
    t.Section = document.getElementById("dSection").value.trim();
    t.Nature = document.getElementById("dNature").value.trim() || "File";
    t.Item_Count = Math.max(1, parseInt(document.getElementById("dItemCount").value || "1", 10));
    t.Nature_Mode = t.Item_Count > 1 ? this.natureMode : "Same";
    t.Items_JSON = JSON.stringify(this.itemsDraft);
    t.Description = document.getElementById("dDescription").value.trim();
    t.Has_Attachments = this.getToggle("dAttachToggleGroup") || "No";
    t.Attachment_Count = t.Has_Attachments === "Yes" ? Math.max(1, parseInt(document.getElementById("dAttachCount").value || "1", 10)) : 0;
    t.Attachments_JSON = t.Has_Attachments === "Yes" ? JSON.stringify(this.attachmentsDraft.filter(Boolean)) : "[]";
    t.Items_Summary = this.buildItemsSummary(this.itemsDraft, t.Has_Attachments, t.Attachment_Count);
    t.Planned_Delivery_DT = document.getElementById("dPlannedDT").value;
    t.Urgency = this.getToggle("dUrgencyGroup") || "Normal";

    this.upsertLocalTask(t);
    await AppStore.pushAction("saveDelivery", t);
    showToast(`Task Added: ${t.Office_Name}`);
    this.startNewTask(false);
    this.switchSubView("tasks");
  },

  async saveStage2() {
    const t = this.currentTask;
    if (!t.Office_Name) {
      showToast("Complete Stage 1 first.");
      this.openStage(1);
      return;
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

    t.Delivery_Status = status;
    t.Not_Delivered_Reason = status === "Not Delivered" ? reason : "";
    t.Completed_DateTime = document.getElementById("dCompletedDT").value || DateTimeHelper.nowLocalISO();
    t.Stage2_Comments = document.getElementById("dStage2Comments").value.trim();

    this.upsertLocalTask(t);
    await AppStore.pushAction("saveDelivery", t);

    if (status === "Delivered") {
      showToast("Delivered ✓ Moved to Unreported Tasks");
      this.switchSubView("unreported");
    } else {
      showToast("Saved as Not Delivered — kept in Tasks");
      this.switchSubView("tasks");
    }
  },

  updateStage3ConditionalFields(val, autoFillTime = true) {
    document.getElementById("dReceiptNoBox").classList.toggle("hidden", val !== "No");
    document.getElementById("dReceiptYesFields").classList.toggle("hidden", val !== "Yes");
    if (val === "Yes" && autoFillTime) {
      const repInp = document.getElementById("dReportedDT");
      if (!repInp.value) {
        repInp.value = DateTimeHelper.nowLocalISO();
        repInp.max = repInp.value;
      }
    }
  },

  async saveStage3() {
    const receiptGiven = this.getToggle("dReceiptGivenGroup");
    if (!receiptGiven) {
      showToast("Select Yes or No for Receipt.");
      return;
    }

    const noReason = document.getElementById("dReceiptNoReason").value.trim();
    const receiver = document.getElementById("dReceiverName").value.trim();
    const reportedDT = document.getElementById("dReportedDT").value || DateTimeHelper.nowLocalISO();

    if (receiptGiven === "No" && !noReason) {
      showToast("Enter reason why receipt was not given.");
      document.getElementById("dReceiptNoReason").focus();
      return;
    }
    if (receiptGiven === "Yes" && !receiver) {
      showToast("Enter Receiver's Name.");
      document.getElementById("dReceiverName").focus();
      return;
    }

    const t = this.currentTask;
    t.Delivery_Status = "Delivered";
    t.Receipt_Given = receiptGiven;
    t.Receipt_No_Reason = receiptGiven === "No" ? noReason : "";
    t.Receiver_Name = receiptGiven === "Yes" ? receiver : "";
    t.Reported_DateTime = receiptGiven === "Yes" ? reportedDT : DateTimeHelper.nowLocalISO();

    this.upsertLocalTask(t);
    await AppStore.pushAction("saveDelivery", t);

    showToast("Task reported & moved to History ✓");
    this.startNewTask(false);
    this.switchSubView("history");
  },

  upsertLocalTask(taskObj) {
    const idx = AppStore.deliveries.findIndex(x => String(x.Task_ID) === String(taskObj.Task_ID));
    if (idx !== -1) AppStore.deliveries[idx] = { ...taskObj };
    else AppStore.deliveries.unshift({ ...taskObj });
  },

  updateStageSummaries() {
    const t = this.currentTask;
    document.getElementById("dSummary1").textContent = t.Office_Name
      ? `${t.Office_Name} • ${t.Items_Summary || t.Nature}`
      : "Create Delivery / Field Task";
    document.getElementById("dCard1").classList.toggle("completed", Boolean(t.Office_Name));

    document.getElementById("dSummary2").textContent = t.Delivery_Status
      ? `${t.Delivery_Status} (${DateTimeHelper.formatShort(t.Completed_DateTime)})`
      : "Delivery Status & Time";
    document.getElementById("dCard2").classList.toggle("completed", t.Delivery_Status === "Delivered");

    document.getElementById("dSummary3").textContent = t.Receipt_Given
      ? `Receipt: ${t.Receipt_Given}${t.Receiver_Name ? " (" + t.Receiver_Name + ")" : ""}`
      : "Receipt Handover & Receiver";
    document.getElementById("dCard3").classList.toggle("completed", Boolean(t.Receipt_Given));
  },

  // =========================================================
  // RENDER TASKS LIST, UNREPORTED LIST & HISTORY
  // =========================================================
  refreshAllViews() {
    this.refreshLearnedLists();

    const activeTasks = AppStore.deliveries.filter(t => t.Delivery_Status !== "Delivered");
    const unreportedTasks = AppStore.deliveries.filter(t => t.Delivery_Status === "Delivered" && !t.Receipt_Given);
    const historyTasks = AppStore.deliveries.filter(t => t.Delivery_Status === "Delivered" && Boolean(t.Receipt_Given));

    document.getElementById("dTasksCount").textContent = activeTasks.length;
    document.getElementById("dUnrepCount").textContent = unreportedTasks.length;

    this.renderActiveTasks(activeTasks);
    this.renderUnreportedTasks(unreportedTasks);
    this.populateHistoryFilterDropdowns(historyTasks);
    this.renderHistoryTasks(historyTasks);
  },

  formatPlannedTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return isToday ? `Deliver before ${timeStr}` : `Deliver before ${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
  },

  renderActiveTasks(list) {
    let filtered = list;
    if (this.activeUrgencyFilter !== "ALL") {
      filtered = list.filter(t => (t.Urgency || "Normal") === this.activeUrgencyFilter);
    }

    const wrap = document.getElementById("dActiveTasksList");
    if (!filtered.length) {
      wrap.innerHTML = `<div class="card muted small">No pending tasks. Tap "+ New Task" in Entry to create one.</div>`;
      return;
    }

    wrap.innerHTML = filtered.map((t, idx) => {
      const urg = t.Urgency || "Normal";
      const urgClass = urg === "Very Urgent" ? "very-urgent" : (urg === "Urgent" ? "urgent" : "normal");
      const planText = this.formatPlannedTime(t.Planned_Delivery_DT);
      let itemNums = "";
      try {
        itemNums = JSON.parse(t.Items_JSON || "[]").map(x => x.number).filter(Boolean).join(", ");
      } catch (e) {}

      return `
        <div class="task-tile ${urgClass}" data-open-stage2="${t.Task_ID}">
          <div class="row-between">
            <strong>${idx + 1}. ${t.Office_Name} — ${t.Items_Summary || t.Nature}</strong>
            <div class="row-gap" onclick="event.stopPropagation()">
              <button type="button" class="btn-mini" data-move-task="${t.Task_ID}" data-dir="-1" title="Move Up">▲</button>
              <button type="button" class="btn-mini" data-move-task="${t.Task_ID}" data-dir="1" title="Move Down">▼</button>
            </div>
          </div>
          <div class="row-gap mt-6" style="flex-wrap:wrap;">
            <span class="urg-badge ${urgClass}">${urg}</span>
            ${planText ? `<span class="small" style="font-weight:600; color:#0f4c81;">⏰ ${planText}</span>` : ""}
            ${t.Delivery_Status === "Not Delivered" ? `<span class="exception-pill">⚠️ Not Delivered: ${t.Not_Delivered_Reason}</span>` : ""}
          </div>
          <div class="small muted mt-6">
            ${[t.Section ? "Sec: " + t.Section : "", itemNums ? "No: " + itemNums : "", t.Description].filter(Boolean).join(" • ")}
          </div>
        </div>`;
    }).join("");
  },

  renderUnreportedTasks(list) {
    const validIds = new Set(list.map(t => String(t.Task_ID)));
    for (const id of Array.from(this.selectedUnrepIds)) {
      if (!validIds.has(String(id))) this.selectedUnrepIds.delete(id);
    }

    document.getElementById("dSelectedUnrepCount").textContent = this.selectedUnrepIds.size;
    const wrap = document.getElementById("dUnreportedTasksList");
    if (!list.length) {
      wrap.innerHTML = `<div class="card muted small">No unreported tasks. Delivered tasks appear here automatically.</div>`;
      return;
    }

    wrap.innerHTML = list.map(t => {
      const checked = this.selectedUnrepIds.has(String(t.Task_ID));
      return `
        <div class="task-tile" style="border-left:4px solid var(--success); ${checked ? "background:#f0fdf4;" : ""}">
          <div class="row-between">
            <label class="row-gap" style="margin:0; cursor:pointer; flex:1;" onclick="event.stopPropagation()">
              <input type="checkbox" data-unrep-check="${t.Task_ID}" ${checked ? "checked" : ""} style="width:19px; height:19px;" />
              <span>✓ <strong>${t.Office_Name}</strong> — ${t.Items_Summary || t.Nature}</span>
            </label>
            <button type="button" class="btn-mini accent" data-open-stage3="${t.Task_ID}">Report →</button>
          </div>
          <div class="small muted mt-6">Delivered: ${DateTimeHelper.formatShort(t.Completed_DateTime)} ${t.Stage2_Comments ? "• " + t.Stage2_Comments : ""}</div>
        </div>`;
    }).join("");
  },

  // =========================================================
  // HISTORY FILTER DROPDOWNS, SORTING & READ-ONLY REPORT MODAL
  // =========================================================
  populateHistoryFilterDropdowns(historyList) {
    const syncSelect = (selectId, labelPrefix, values) => {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const currentVal = sel.value;
      const uniqueSorted = this.getAlphabeticalList(values, []);
      sel.innerHTML = `<option value="ALL">${labelPrefix}: All</option>` +
        uniqueSorted.map(v => `<option value="${v}">${v}</option>`).join("");
      if (uniqueSorted.includes(currentVal)) sel.value = currentVal;
    };

    syncSelect("dHistoryFilterOffice", "Office", historyList.map(t => t.Office_Name));

    const allNatures = [];
    historyList.forEach(t => {
      if (t.Nature) allNatures.push(t.Nature);
      try {
        JSON.parse(t.Items_JSON || "[]").forEach(it => { if (it.nature) allNatures.push(it.nature); });
      } catch (e) {}
    });
    syncSelect("dHistoryFilterNature", "Nature", allNatures);
    syncSelect("dHistoryFilterDesig", "Designation", historyList.map(t => t.Designation));
    syncSelect("dHistoryFilterReceiver", "Receiver", historyList.map(t => t.Receiver_Name));
  },

  renderHistoryTasks(list) {
    const q = document.getElementById("dHistorySearch").value.trim().toLowerCase();
    const statusFilter = document.getElementById("dHistoryFilterStatus").value;
    const officeFilter = document.getElementById("dHistoryFilterOffice").value;
    const natureFilter = document.getElementById("dHistoryFilterNature").value;
    const desigFilter = document.getElementById("dHistoryFilterDesig").value;
    const receiverFilter = document.getElementById("dHistoryFilterReceiver").value;
    const dateFrom = document.getElementById("dHistoryDateFrom").value;
    const dateTo = document.getElementById("dHistoryDateTo").value;
    const sortBy = document.getElementById("dHistorySort").value;

    let filtered = [...list];

    if (statusFilter === "GIVEN") filtered = filtered.filter(t => t.Receipt_Given === "Yes");
    if (statusFilter === "NOT_GIVEN") filtered = filtered.filter(t => t.Receipt_Given === "No");
    if (officeFilter !== "ALL") filtered = filtered.filter(t => String(t.Office_Name).trim() === officeFilter);
    if (desigFilter !== "ALL") filtered = filtered.filter(t => String(t.Designation).trim() === desigFilter);
    if (receiverFilter !== "ALL") filtered = filtered.filter(t => String(t.Receiver_Name).trim() === receiverFilter);

    if (natureFilter !== "ALL") {
      filtered = filtered.filter(t => {
        if (String(t.Nature).trim() === natureFilter) return true;
        try {
          return JSON.parse(t.Items_JSON || "[]").some(it => String(it.nature).trim() === natureFilter);
        } catch (e) {
          return false;
        }
      });
    }

    if (dateFrom) {
      filtered = filtered.filter(t => {
        const dStr = String(t.Reported_DateTime || t.Completed_DateTime || t.Created_DateTime || "").slice(0, 10);
        return dStr && dStr >= dateFrom;
      });
    }
    if (dateTo) {
      filtered = filtered.filter(t => {
        const dStr = String(t.Reported_DateTime || t.Completed_DateTime || t.Created_DateTime || "").slice(0, 10);
        return dStr && dStr <= dateTo;
      });
    }

    if (q) {
      filtered = filtered.filter(t =>
        [t.Office_Name, t.Designation, t.Items_Summary, t.Items_JSON, t.Section, t.Receiver_Name, t.Description, t.Stage2_Comments]
          .filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }

    if (sortBy === "OLDEST") {
      filtered.sort((a, b) => String(a.Reported_DateTime || a.Completed_DateTime).localeCompare(String(b.Reported_DateTime || b.Completed_DateTime)));
    } else if (sortBy === "OFFICE") {
      filtered.sort((a, b) => String(a.Office_Name).localeCompare(String(b.Office_Name)));
    } else if (sortBy === "NATURE") {
      filtered.sort((a, b) => String(a.Nature).localeCompare(String(b.Nature)));
    } else {
      filtered.sort((a, b) => String(b.Reported_DateTime || b.Completed_DateTime).localeCompare(String(a.Reported_DateTime || a.Completed_DateTime)));
    }

    document.getElementById("dHistoryCountLabel").textContent = `${filtered.length} completed record(s)`;
    const wrap = document.getElementById("dHistoryList");
    if (!filtered.length) {
      wrap.innerHTML = `<div class="card muted small">No completed history records match your filters.</div>`;
      return;
    }

    wrap.innerHTML = filtered.slice(0, 50).map(t => `
      <div class="history-item">
        <div class="row-between">
          <strong>${t.Office_Name} — ${t.Items_Summary || t.Nature}</strong>
          <button type="button" class="btn-mini accent" data-view-report="${t.Task_ID}">Report</button>
        </div>
        <div class="small muted">
          ${[t.Designation, t.Section ? "Sec: " + t.Section : "", "Delivered: " + DateTimeHelper.formatShort(t.Completed_DateTime)].filter(Boolean).join(" • ")}
        </div>
        <div class="small mt-6">
          ${t.Receipt_Given === "Yes"
            ? `Receipt Given to <strong>${t.Receiver_Name}</strong> (${DateTimeHelper.formatShort(t.Reported_DateTime)})`
            : `<span class="exception-pill">No Receipt: ${t.Receipt_No_Reason}</span>`}
        </div>
      </div>
    `).join("");
  },

  openReadOnlyReportModal(taskId) {
    const t = AppStore.deliveries.find(x => String(x.Task_ID) === String(taskId));
    if (!t) return;
    this.viewingReportTaskId = t.Task_ID;

    let itemsHtml = "";
    try {
      const parsed = JSON.parse(t.Items_JSON || "[]");
      if (parsed.length) {
        itemsHtml = parsed.map((it, idx) =>
          `<div>• Item #${idx + 1}: <strong>${it.nature}</strong> ${it.number ? "(" + it.number + ")" : ""}</div>`
        ).join("");
      }
    } catch (e) {}

    let attachHtml = "";
    try {
      const att = JSON.parse(t.Attachments_JSON || "[]");
      if (att.length) {
        attachHtml = `<div><strong>Attachments (${att.length}):</strong> ${att.join(", ")}</div>`;
      }
    } catch (e) {}

    document.getElementById("deliveryReportBody").innerHTML = `
      <div class="card" style="background:#f8fafc; margin-bottom:8px;">
        <div class="micro-label">STAGE 1 • TASK DETAILS</div>
        <div><strong>Office:</strong> ${t.Office_Name}</div>
        ${t.Designation ? `<div><strong>Designation:</strong> ${t.Designation}</div>` : ""}
        ${t.Section ? `<div><strong>Section:</strong> ${t.Section}</div>` : ""}
        <div><strong>Summary:</strong> ${t.Items_Summary || t.Nature}</div>
        ${itemsHtml}
        ${attachHtml}
        ${t.Description ? `<div><strong>Description:</strong> ${t.Description}</div>` : ""}
        <div class="small muted mt-6">Created: ${DateTimeHelper.formatShort(t.Created_DateTime)} ${t.Planned_Delivery_DT ? "• Planned: " + DateTimeHelper.formatShort(t.Planned_Delivery_DT) : ""}</div>
      </div>

      <div class="card" style="background:#f8fafc; margin-bottom:8px;">
        <div class="micro-label">STAGE 2 • DELIVERY COMPLETION</div>
        <div><strong>Status:</strong> ${t.Delivery_Status}</div>
        <div><strong>Delivered Time:</strong> ${DateTimeHelper.formatShort(t.Completed_DateTime)}</div>
        ${t.Stage2_Comments ? `<div><strong>Comments:</strong> ${t.Stage2_Comments}</div>` : ""}
      </div>

      <div class="card" style="background:#f8fafc; margin-bottom:0;">
        <div class="micro-label">STAGE 3 • RECEIPT REPORTING</div>
        <div><strong>Receipt Given:</strong> ${t.Receipt_Given}</div>
        ${t.Receipt_Given === "Yes"
          ? `<div><strong>Received By:</strong> ${t.Receiver_Name}</div><div><strong>Received Time:</strong> ${DateTimeHelper.formatShort(t.Reported_DateTime)}</div>`
          : `<div class="danger-text"><strong>No Reason:</strong> ${t.Receipt_No_Reason}</div>`}
      </div>
    `;

    document.getElementById("deliveryEditWarningBox").classList.add("hidden");
    document.getElementById("deliveryReportFooter").classList.remove("hidden");
    document.getElementById("deliveryReportModal").classList.remove("hidden");
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
        if (!this.expandAllStages && !body.classList.contains("collapsed")) {
          body.classList.add("collapsed");
          document.getElementById(`dChev${n}`).textContent = "▶";
        } else {
          this.openStage(n);
        }
      });
    });

    document.getElementById("btnToggleExpandAllDelivery").addEventListener("click", () => {
      this.expandAllStages = !this.expandAllStages;
      document.getElementById("btnToggleExpandAllDelivery").textContent = this.expandAllStages ? "Collapse All" : "Expand All";
      [1, 2, 3].forEach(n => {
        document.getElementById(`dBody${n}`).classList.toggle("collapsed", !this.expandAllStages);
        document.getElementById(`dChev${n}`).textContent = this.expandAllStages ? "▼" : "▶";
      });
    });

    document.getElementById("btnNewDelivery").addEventListener("click", () => {
      this.startNewTask(true);
      this.openStage(1);
    });

    // Stage 1 Dynamic Controls
    document.getElementById("dNature").addEventListener("input", () => this.syncNatureUI());
    document.getElementById("dItemCount").addEventListener("input", () => this.syncNatureUI());
    document.getElementById("btnDCountPlus").addEventListener("click", () => {
      const el = document.getElementById("dItemCount");
      el.value = Math.min(30, parseInt(el.value || "1", 10) + 1);
      this.syncNatureUI();
    });
    document.getElementById("btnDCountMinus").addEventListener("click", () => {
      const el = document.getElementById("dItemCount");
      el.value = Math.max(1, parseInt(el.value || "1", 10) - 1);
      this.syncNatureUI();
    });

    document.getElementById("btnDModeSame").addEventListener("click", () => {
      this.natureMode = "Same";
      this.syncNatureUI();
    });
    document.getElementById("btnDModeVarious").addEventListener("click", () => {
      this.natureMode = "Various";
      this.syncNatureUI();
    });

    document.getElementById("dDynamicItemsWrap").addEventListener("input", (e) => {
      if (e.target.dataset.itemNum !== undefined) {
        this.itemsDraft[Number(e.target.dataset.itemNum)].number = e.target.value;
      }
    });
    document.getElementById("dDynamicItemsWrap").addEventListener("change", (e) => {
      if (e.target.dataset.itemNature !== undefined) {
        this.itemsDraft[Number(e.target.dataset.itemNature)].nature = e.target.value;
      }
    });

    document.querySelectorAll("#dAttachToggleGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        this.setToggle("dAttachToggleGroup", btn.dataset.val);
        document.getElementById("dAttachmentsBox").classList.toggle("hidden", btn.dataset.val !== "Yes");
      });
    });
    document.getElementById("dAttachCount").addEventListener("input", () => this.renderAttachmentRows());
    document.getElementById("btnDAttachPlus").addEventListener("click", () => {
      const el = document.getElementById("dAttachCount");
      el.value = Math.min(20, parseInt(el.value || "1", 10) + 1);
      this.renderAttachmentRows();
    });
    document.getElementById("btnDAttachMinus").addEventListener("click", () => {
      const el = document.getElementById("dAttachCount");
      el.value = Math.max(1, parseInt(el.value || "1", 10) - 1);
      this.renderAttachmentRows();
    });
    document.getElementById("dAttachRowsWrap").addEventListener("input", (e) => {
      if (e.target.dataset.attIdx !== undefined) {
        this.attachmentsDraft[Number(e.target.dataset.attIdx)] = e.target.value;
      }
    });

    const setTodayTime = (hh, mm) => {
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      document.getElementById("dPlannedDT").value = d.toISOString().slice(0, 16);
    };
    document.getElementById("btnDPlanToday3PM").addEventListener("click", () => setTodayTime(15, 0));
    document.getElementById("btnDPlanToday5PM").addEventListener("click", () => setTodayTime(17, 0));

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
        this.updateStage3ConditionalFields(btn.dataset.val, true);
      });
    });

    document.getElementById("btnSaveDStage1").addEventListener("click", () => this.saveStage1());
    document.getElementById("btnSaveDStage2").addEventListener("click", () => this.saveStage2());
    document.getElementById("btnSaveDStage3").addEventListener("click", () => this.saveStage3());

    document.getElementById("view-delivery").addEventListener("click", (e) => {
      if (e.target.dataset.dfill) {
        document.getElementById(e.target.dataset.dfill).value = e.target.dataset.dval;
      }
      if (e.target.dataset.dnaturePick) {
        document.getElementById("dNature").value = e.target.dataset.dnaturePick;
        this.syncNatureUI();
      }
      if (e.target.dataset.dpattern) {
        const emptyIdx = this.itemsDraft.findIndex(x => !x.number);
        const idx = emptyIdx !== -1 ? emptyIdx : 0;
        this.itemsDraft[idx].number = e.target.dataset.dpattern;
        this.renderDynamicItemRows();
        const inp = document.querySelector(`[data-item-num="${idx}"]`);
        if (inp) inp.focus();
      }
      if (e.target.dataset.durg) {
        document.querySelectorAll("[data-durg]").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        this.activeUrgencyFilter = e.target.dataset.durg;
        this.refreshAllViews();
      }
      if (e.target.dataset.moveTask) {
        const id = e.target.dataset.moveTask;
        const dir = parseInt(e.target.dataset.dir, 10);
        const idx = AppStore.deliveries.findIndex(t => String(t.Task_ID) === String(id));
        const swapIdx = idx + dir;
        if (idx !== -1 && swapIdx >= 0 && swapIdx < AppStore.deliveries.length) {
          [AppStore.deliveries[idx], AppStore.deliveries[swapIdx]] = [AppStore.deliveries[swapIdx], AppStore.deliveries[idx]];
          AppStore.saveCache();
          this.refreshAllViews();
        }
        return;
      }
      const tile2 = e.target.closest("[data-open-stage2]");
      if (tile2) {
        this.loadTask(tile2.dataset.openStage2, 2);
      }
      if (e.target.dataset.openStage3) {
        this.loadTask(e.target.dataset.openStage3, 3);
      }
      if (e.target.dataset.viewReport) {
        this.openReadOnlyReportModal(e.target.dataset.viewReport);
      }
    });

    document.getElementById("btnSortTasksAuto").addEventListener("click", () => {
      const rank = { "Very Urgent": 1, "Urgent": 2, "Normal": 3 };
      AppStore.deliveries.sort((a, b) => {
        const rDiff = (rank[a.Urgency] || 3) - (rank[b.Urgency] || 3);
        if (rDiff !== 0) return rDiff;
        return String(a.Planned_Delivery_DT || "9").localeCompare(String(b.Planned_Delivery_DT || "9"));
      });
      AppStore.saveCache();
      this.refreshAllViews();
      showToast("Sorted by Urgency & Delivery Time");
    });

    // Unreported Multi-Select Checkboxes
    document.getElementById("dUnreportedTasksList").addEventListener("change", (e) => {
      const id = e.target.dataset.unrepCheck;
      if (!id) return;
      if (e.target.checked) this.selectedUnrepIds.add(String(id));
      else this.selectedUnrepIds.delete(String(id));
      document.getElementById("dSelectedUnrepCount").textContent = this.selectedUnrepIds.size;
    });

    document.getElementById("btnSelectAllUnrep").addEventListener("click", () => {
      const unrep = AppStore.deliveries.filter(t => t.Delivery_Status === "Delivered" && !t.Receipt_Given);
      unrep.forEach(t => this.selectedUnrepIds.add(String(t.Task_ID)));
      this.refreshAllViews();
    });

    // Open Dedicated Group Reporting Modal (keeps all checked Task IDs intact)
    document.getElementById("btnBatchReportUnrep").addEventListener("click", () => {
      if (!this.selectedUnrepIds.size) {
        showToast("Check at least 1 unreported task first.");
        return;
      }
      const ids = Array.from(this.selectedUnrepIds);
      const selectedObjects = AppStore.deliveries.filter(t => ids.includes(String(t.Task_ID)));
      const officeList = selectedObjects.map(t => t.Office_Name).join(", ");

      document.getElementById("groupReportSummary").innerHTML =
        `<span class="small"><strong>${ids.length} Tasks:</strong> ${officeList}</span>`;

      this.setToggle("grpReceiptGivenGroup", "");
      document.getElementById("grpReceiptNoBox").classList.add("hidden");
      document.getElementById("grpReceiptYesFields").classList.add("hidden");
      document.getElementById("grpReceiptNoReason").value = "";
      document.getElementById("grpReceiverName").value = "";
      document.getElementById("grpReportedDT").value = "";

      document.getElementById("grpReceiptNoChips").innerHTML = CONFIG.DEFAULT_RECEIPT_NO_REASONS.map(r =>
        `<button type="button" class="smart-chip" data-grpfill="grpReceiptNoReason" data-grpval="${r}">${r}</button>`
      ).join("");

      const receivers = AppStore.rankByFrequency([
        ...AppStore.deliveries.map(d => d.Receiver_Name),
        ...AppStore.batches.map(b => b.Received_By_Name)
      ]).slice(0, 6);
      document.getElementById("grpReceiverChips").innerHTML = receivers.map((r, i) =>
        `<button type="button" class="smart-chip ${i === 0 ? "top-rank" : ""}" data-grpfill="grpReceiverName" data-grpval="${r}">${r}</button>`
      ).join("");

      document.getElementById("groupReportModal").classList.remove("hidden");
    });

    document.getElementById("btnCloseGroupReport").addEventListener("click", () => {
      document.getElementById("groupReportModal").classList.add("hidden");
    });

    document.querySelectorAll("#grpReceiptGivenGroup button").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.val;
        this.setToggle("grpReceiptGivenGroup", val);
        document.getElementById("grpReceiptNoBox").classList.toggle("hidden", val !== "No");
        document.getElementById("grpReceiptYesFields").classList.toggle("hidden", val !== "Yes");
        if (val === "Yes") {
          const dt = document.getElementById("grpReportedDT");
          if (!dt.value) {
            dt.value = DateTimeHelper.nowLocalISO();
            dt.max = dt.value;
          }
        }
      });
    });

    document.getElementById("groupReportModal").addEventListener("click", (e) => {
      if (e.target.dataset.grpfill) {
        document.getElementById(e.target.dataset.grpfill).value = e.target.dataset.grpval;
      }
    });

    document.getElementById("btnSaveGroupReport").addEventListener("click", async () => {
      const receiptGiven = this.getToggle("grpReceiptGivenGroup");
      if (!receiptGiven) {
        showToast("Select Yes or No for Receipt.");
        return;
      }
      const noReason = document.getElementById("grpReceiptNoReason").value.trim();
      const receiver = document.getElementById("grpReceiverName").value.trim();
      const reportedDT = document.getElementById("grpReportedDT").value || DateTimeHelper.nowLocalISO();

      if (receiptGiven === "No" && !noReason) {
        showToast("Enter reason why receipt was not given.");
        document.getElementById("grpReceiptNoReason").focus();
        return;
      }
      if (receiptGiven === "Yes" && !receiver) {
        showToast("Enter Receiver's Name.");
        document.getElementById("grpReceiverName").focus();
        return;
      }

      const ids = Array.from(this.selectedUnrepIds);
      const updatedBatch = [];

      ids.forEach(id => {
        const idx = AppStore.deliveries.findIndex(t => String(t.Task_ID) === String(id));
        if (idx !== -1) {
          AppStore.deliveries[idx] = {
            ...AppStore.deliveries[idx],
            Delivery_Status: "Delivered",
            Receipt_Given: receiptGiven,
            Receipt_No_Reason: receiptGiven === "No" ? noReason : "",
            Receiver_Name: receiptGiven === "Yes" ? receiver : "",
            Reported_DateTime: receiptGiven === "Yes" ? reportedDT : DateTimeHelper.nowLocalISO()
          };
          updatedBatch.push(AppStore.deliveries[idx]);
        }
      });

      this.selectedUnrepIds.clear();
      document.getElementById("groupReportModal").classList.add("hidden");
      this.refreshAllViews();

      if (updatedBatch.length) {
        await AppStore.pushAction("saveDeliveryBatch", updatedBatch);
        showToast(`${updatedBatch.length} tasks reported & moved to History ✓`);
      }
    });

    // History Filters & Sort Listeners
    ["dHistorySearch", "dHistorySort", "dHistoryFilterStatus", "dHistoryFilterOffice", "dHistoryFilterNature", "dHistoryFilterDesig", "dHistoryFilterReceiver", "dHistoryDateFrom", "dHistoryDateTo"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(el.tagName === "INPUT" && el.type === "text" ? "input" : "change", () => this.refreshAllViews());
      }
    });

    document.getElementById("btnResetDHistoryFilters").addEventListener("click", () => {
      document.getElementById("dHistorySearch").value = "";
      document.getElementById("dHistorySort").value = "NEWEST";
      document.getElementById("dHistoryFilterStatus").value = "ALL";
      document.getElementById("dHistoryFilterOffice").value = "ALL";
      document.getElementById("dHistoryFilterNature").value = "ALL";
      document.getElementById("dHistoryFilterDesig").value = "ALL";
      document.getElementById("dHistoryFilterReceiver").value = "ALL";
      document.getElementById("dHistoryDateFrom").value = "";
      document.getElementById("dHistoryDateTo").value = "";
      this.refreshAllViews();
    });

    // Read-Only History Report Modal & Intentional Edit Warning Listeners
    const closeReportModal = () => {
      document.getElementById("deliveryReportModal").classList.add("hidden");
      this.viewingReportTaskId = null;
    };
    document.getElementById("btnCloseDeliveryReport").addEventListener("click", closeReportModal);
    document.getElementById("btnCloseDeliveryReport2").addEventListener("click", closeReportModal);

    document.getElementById("btnRequestEditHistory").addEventListener("click", () => {
      document.getElementById("deliveryEditWarningBox").classList.remove("hidden");
      document.getElementById("deliveryReportFooter").classList.add("hidden");
    });

    document.getElementById("btnCancelHistoryEditWarn").addEventListener("click", () => {
      document.getElementById("deliveryEditWarningBox").classList.add("hidden");
      document.getElementById("deliveryReportFooter").classList.remove("hidden");
    });

    document.getElementById("btnConfirmUnlockHistoryEdit").addEventListener("click", () => {
      const id = this.viewingReportTaskId;
      closeReportModal();
      if (id) {
        this.loadTask(id, 1);
        showToast("Unlocked completed record for editing");
      }
    });
  }
};

document.addEventListener("DOMContentLoaded", () => DeliveryModule.init());