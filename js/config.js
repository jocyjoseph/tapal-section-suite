const CONFIG = {
  DEFAULT_API_URL: "https://script.google.com/macros/s/AKfycby0Fj-Gbhqqr3HjrjqAbNeybD9X5188dcZ_-of447a4qdOYm2E_pVRTbf5b9ZO6Bhg/exec",
  STORAGE_KEY: "tapal_suite_cache_v2",
  QUEUE_KEY: "tapal_suite_offline_queue_v1",
  API_URL_KEY: "tapal_suite_api_url",

  // Module 1 (Postage / SOM) Defaults
  DEFAULT_COUNTERS: ["1", "2", "3", "4", "5", "6"],
  DEFAULT_SOM_NO_REASONS: ["Clerk unavailable", "Counter closed", "System down at PO", "Will collect later"],
  DEFAULT_REC_NO_REASONS: ["Printer issue at PO", "Server down at PO", "Bulk receipt pending"],
  DEFAULT_TAPAL_NO_REASONS: ["Tapal closed", "Kept in safe custody", "Handover tomorrow"],

  // Shared Designations (Module 2 & Module 3)
  DEFAULT_DESIGNATIONS: [
    "The Principal",
    "The Assistant Director",
    "The Camp Officer",
    "The Chief Superintendent",
    "The Chairman",
    "The District Treasury Officer"
  ],

  // Module 2 (Local Delivery / Inward) Self-Learning Lists
  DEFAULT_OFFICES: ["AG Office", "District Treasury", "Education Minister Office", "Post Office", "PSC", "Sub Treasury"],
  DEFAULT_SECTIONS: ["Accounts", "Administration", "Cash", "Exam", "General", "Tapal"],
  DEFAULT_NATURES: ["Bill", "Cheque", "DPC", "File", "Medical Reimbursement", "Tapal"],
  DEFAULT_NO_PATTERNS: ["BILL/2026/", "CHQ-", "TAPAL/", "VHSE/A1/", "VHSE/E1/"],
  DEFAULT_NOT_DELIVERED_REASONS: ["Counter closed", "Office closed", "Officer unavailable", "Time insufficient"],
  DEFAULT_RECEIPT_NO_REASONS: ["Kept in personal custody", "Tapal closed", "Will hand over tomorrow"]
};

// Module 3 (Address Book) Sample Seed Rows (matches Address2.xlsx 12-column structure)
const SAMPLE_ADDRESSES = [
  { District_Sl: "01|01", Code: "1001", School: "GVHSS Kulathur", Address_Line_1: "Uchakkada PO", Address_Line_2: "Kulathur, Neyyattinkara", District: "Thiruvananthapuram", PIN: "695506", Designation: "The Principal", Principal_Name: "", Principal_Phone: "", Clerk_Name: "", Clerk_Phone: "" },
  { District_Sl: "01|02", Code: "1002", School: "GVHSS Vithura", Address_Line_1: "Vithura PO", Address_Line_2: "", District: "Thiruvananthapuram", PIN: "695551", Designation: "The Principal", Principal_Name: "", Principal_Phone: "", Clerk_Name: "", Clerk_Phone: "" },
  { District_Sl: "11|01", Code: "11001", School: "GVHSS Nadakkavu", Address_Line_1: "Nadakkavu PO", Address_Line_2: "", District: "Kozhikkode", PIN: "673011", Designation: "The Principal", Principal_Name: "", Principal_Phone: "", Clerk_Name: "", Clerk_Phone: "" }
];
