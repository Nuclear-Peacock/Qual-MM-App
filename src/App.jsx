import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, X, FileText, BookOpen, Trash2, Download, Upload, StickyNote,
  Tag, ChevronDown, ChevronRight, Sparkles, Users, Lock, Check
} from "lucide-react";
import mammoth from "mammoth";
import Papa from "papaparse";
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
  collection, query, where, getDocs,
} from "firebase/firestore";

// ---------- Firebase setup ----------
// 1. Create a project at https://console.firebase.google.com (the free "Spark" plan is enough)
// 2. Authentication → Sign-in method → enable "Email/Password"
// 3. Firestore Database → create a database
// 4. Project settings → General → add a Web app → copy the config values into a .env file (see .env.example)
// 5. In the Firestore console, create an `allowed_users` collection with one document per
//    approved researcher, each containing a field `email` set to that person's address
//    (document ID can be anything — an auto-ID is fine).
//
// Suggested Firestore rules:
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /allowed_users/{docId} {
//         allow read: if true;    // must be publicly readable so the pre-login whitelist check can run
//         allow write: if false;  // manage this list from the Firebase console only
//       }
//       match /users/{userId} {
//         allow read, write: if request.auth != null && request.auth.uid == userId;
//       }
//       match /projects/{projectId} {
//         allow read, write: if request.auth != null;
//       }
//     }
//   }
//
// Note: allowed_users must be publicly *readable* for the whitelist check to run before the
// person is signed in — that only exposes the list of approved emails, nothing else. Write
// access stays locked to the console, so nobody can add themselves to the list from the app.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Firestore doc IDs can't contain "/" and can't be exactly "." or "..".
// Otherwise we keep the project name exactly as typed (case, spaces, punctuation)
// so the Firestore document is genuinely "named after" the project name.
function safeDocId(name) {
  const trimmed = (name || "").trim();
  const cleaned = trimmed.replace(/\//g, "-");
  if (cleaned === "" || cleaned === "." || cleaned === "..") return "project";
  return cleaned;
}

async function isEmailWhitelisted(email) {
  const q = query(collection(db, "allowed_users"), where("email", "==", email));
  const snap = await getDocs(q);
  return !snap.empty;
}

// ---------- design tokens ----------
const COLORS = {
  bg: "#EEF0E8", panel: "#FFFFFF", ink: "#1E2A2F", inkMuted: "#66757C",
  border: "#D9D9CC", accent: "#2E7D8C", gold: "#C79A1E",
};
const PALETTE = [
  "#C1592F", "#2E7D8C", "#7A5FB0", "#C79A1E", "#3E6B99",
  "#B24A73", "#5F8C3E", "#9C5B2E", "#8C3E52", "#4C9A8D",
];
const uid = () => Math.random().toString(36).slice(2, 10);
function hashColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const CHECKLIST_ITEMS = [
  { key: "internalCoherence", label: "Internal coherence", question: "Do the excerpts within the theme belong together?" },
  { key: "externalDistinction", label: "External distinction", question: "Is this theme meaningfully different from the other themes?" },
  { key: "dataSupport", label: "Data support", question: "Do several participants support it, or is it an important but isolated case?" },
  { key: "explanatoryValue", label: "Explanatory value", question: "Does the theme explain how or why something happened?" },
  { key: "relationToRQ", label: "Relationship to the research question", question: "Does it help answer your study aim?" },
  { key: "relationToTheoryQ", label: "Relationship to theory", question: "Does it support, refine, extend, or challenge the learning theory?" },
];
function emptyChecklist() {
  const c = {};
  CHECKLIST_ITEMS.forEach((i) => { c[i.key] = { checked: false, note: "" }; });
  return c;
}
const NEGATIVE_TYPES = [
  "Boundary conditions", "Differences in learner experience", "Design flaws",
  "Variation by experience level", "Need for adaptive rather than uniform support", "Other",
];
const META_TYPES = [
  { key: "converge", label: "Converge", question: "Both datasets support the same conclusion." },
  { key: "complement", label: "Complement", question: "One adds depth or mechanism to the other." },
  { key: "diverge", label: "Diverge", question: "The datasets appear inconsistent." },
  { key: "expand", label: "Expand", question: "One reveals an important dimension not measured by the other." },
  { key: "silence", label: "Silence", question: "One data source does not address the issue at all." },
];
const RELATIONSHIP_OPTIONS = ["Convergence", "Complementarity", "Discordance", "Expansion"];

function emptyMetaInferences() {
  const m = { overallStatement: "" };
  META_TYPES.forEach((t) => { m[t.key] = { text: "", themeIds: [] }; });
  return m;
}

const EMPTY = {
  name: "Untitled Project",
  studyType: "qualitative",
  researchQuestions: { qualitative: "", quantitative: "", mixed: "", secondary: "" },
  learningTheories: [],
  components: [],
  documents: [],
  codes: [],
  categories: [],
  codings: [],
  drafts: [],
  finalMasterCodebookDraftId: null,
  categoriesFinalized: false,
  themes: [],
  targetThemeCount: null,
  negativeCases: [],
  memos: [],
  reflexivityMemos: [],
  dataDictionary: [],
  themeSummaries: [],
  quantData: { description: "", columns: [], rows: [], pairs: [], domains: [], showCharts: false },
  individualUnlocked: {},
  metaInferences: emptyMetaInferences(),
  individualMatrix: [],
  groupMatrix: [],
  jointDisplay: [],
};

// ---------- sample project (simulation-debrief study) ----------
const SAMPLE = (() => {
  const d1 = "d1", d2 = "d2", d3 = "d3";
  const cEmot = "c1", cQuest = "c2", cPeer = "c3", cCheckin = "c4";
  const catClimate = "cat1", catFacil = "cat2";
  const draftIndiv = "dr1", draftGroup = "dr2";
  const themeId = "th1";
  const lt1 = "lt1", lt2 = "lt2";
  const comp1 = "comp1", comp2 = "comp2", comp3 = "comp3";
  return {
    name: "Simulation Debrief Study (sample)",
    studyType: "mixed",
    researchQuestions: {
      qualitative: "How do nursing students experience high-fidelity simulation debriefing?",
      quantitative: "How do learners rate their confidence and satisfaction before and after debriefing?",
      mixed: "How do qualitative accounts of the debrief experience explain the quantitative confidence shifts?",
      secondary: "How do learners perceive the contribution of facilitator questioning versus video review?",
    },
    learningTheories: [
      { id: lt1, name: "Kolb's Experiential Learning Theory", components: "Concrete experience\nReflective observation\nAbstract conceptualization\nActive experimentation" },
      { id: lt2, name: "Mezirow's Transformative Learning Theory", components: "Triggering experience\nSelf-examination\nCritical examination of assumptions\nAlternative perspective\nReflective discourse\nPerspective reconsideration\nAction planning" },
    ],
    components: [
      { id: comp1, name: "Video review" },
      { id: comp2, name: "Facilitator questioning" },
      { id: comp3, name: "Peer discussion" },
    ],
    documents: [
      { id: d1, title: "Learner 1", addedBy: "Sample Team", documentType: "individual", attributes: { Experience: "Novice", Cohort: "A" },
        text: "During the debrief I felt really exposed when the facilitator replayed the video. I wanted to explain myself before anyone else spoke. Once I understood the format, I actually valued hearing my group's perspective, but that first ten minutes was rough." },
      { id: d2, title: "Learner 2", addedBy: "Sample Team", documentType: "individual", attributes: { Experience: "Experienced", Cohort: "A" },
        text: "I've done a lot of these simulations before, so the debrief felt more like confirming what I already suspected went wrong. What helped most was when the facilitator asked why we made a call, not just what we did." },
      { id: d3, title: "Learner 3", addedBy: "Sample Team", documentType: "individual", attributes: { Experience: "Novice", Cohort: "B" },
        text: "Honestly I froze during the scenario and the debrief made it worse — everyone was watching the video of me freezing. I think if the facilitator had checked in with me privately first, I would have engaged more." },
      { id: "d4", title: "Cohort A group debrief discussion", addedBy: "Sample Team", documentType: "group", attributes: { Cohort: "A" },
        text: "Facilitator: What stood out to you all about that scenario? Voice 1: Honestly I just wanted the video part to be over. Voice 2: Same, but once we started talking about why we made the call it felt less like a trial. Voice 1: Yeah, the questions helped more than the replay did." },
    ],
    codes: [
      { id: cEmot, name: "emotional exposure", color: PALETTE[0], categoryId: catClimate, memo: "Feeling watched/judged during video review.", origin: "inductive", theoryId: null },
      { id: cQuest, name: "facilitator questioning technique", color: PALETTE[1], categoryId: catFacil, memo: "Why-questions vs. what-questions.", origin: "deductive", theoryId: lt1 },
      { id: cPeer, name: "peer perspective value", color: PALETTE[2], categoryId: catClimate, memo: "Value once psychologically safe.", origin: "inductive", theoryId: null },
      { id: cCheckin, name: "need for individualized check-in", color: PALETTE[3], categoryId: catFacil, memo: "", origin: "inductive", theoryId: null },
    ],
    categories: [
      { id: catClimate, name: "Debrief climate", memo: "" },
      { id: catFacil, name: "Facilitation technique", memo: "" },
    ],
    codings: [
      { id: "k1", docId: d1, codeId: cEmot, start: 24, end: 100, text: "I felt really exposed when the facilitator replayed the video.", researcherName: "Sample Team", scope: "individual", draftId: draftGroup },
      { id: "k2", docId: d1, codeId: cPeer, start: 178, end: 245, text: "I actually valued hearing my group's perspective", researcherName: "Sample Team", scope: "individual", draftId: draftGroup },
      { id: "k3", docId: d2, codeId: cQuest, start: 120, end: 195, text: "the facilitator asked why we made a call, not just what we did", researcherName: "Sample Team", scope: "individual", draftId: draftGroup },
      { id: "k4", docId: d3, codeId: cEmot, start: 55, end: 115, text: "everyone was watching the video of me freezing", researcherName: "Sample Team", scope: "individual", draftId: draftGroup },
      { id: "k5", docId: d3, codeId: cCheckin, start: 130, end: 210, text: "if the facilitator had checked in with me privately first, I would have engaged more", researcherName: "Sample Team", scope: "individual", draftId: draftGroup },
      { id: "k6", docId: "d4", codeId: cQuest, start: 178, end: 250, text: "once we started talking about why we made the call it felt less like a trial", researcherName: "Sample Team", scope: "individual", draftId: draftGroup, speaker: "Voice 2 (unidentified)" },
    ],
    drafts: [
      { id: draftIndiv, researcherName: "Sample Team", draftNumber: 1, scope: "individual", createdAt: Date.now() - 86400000 },
      { id: draftGroup, researcherName: "Group", draftNumber: 1, scope: "group", createdAt: Date.now() - 3600000 },
    ],
    finalMasterCodebookDraftId: draftGroup,
    categoriesFinalized: true,
    themes: [
      {
        id: themeId, name: "Psychological safety shapes debrief engagement", categoryIds: [catClimate, catFacil],
        pattern: "Learners disengage or self-protect early in debrief, then re-engage once they feel safe.",
        mechanism: "Public video review triggers exposure/threat response; facilitator questioning style either amplifies or reduces that threat.",
        consequenceOrTension: "Tension between accountability (reviewing performance) and psychological safety (enabling honest reflection).",
        meaning: "Debrief effectiveness depends less on content and more on how safe learners feel disclosing their reasoning.",
        whyItMatters: "If early threat isn't managed, learners may not engage in the reflective observation Kolb's model requires.",
        conditions: "Most acute for novice learners in their first few minutes of debrief, especially after a visibly poor performance.",
        relationToTheory: "Maps to the concrete experience → reflective observation transition in Kolb's cycle; safety appears to gate that transition.",
        theoryIds: [lt1, lt2],
        theoryNotes: {
          [lt1]: "Safety appears to gate the transition from concrete experience into genuine reflective observation — without it, learners perform reflection without engaging in it.",
          [lt2]: "The video-review moment functions as a potential triggering experience; whether it leads to self-examination or shutdown depends on perceived safety.",
        },
        checklist: {
          internalCoherence: { checked: true, note: "All excerpts describe threat/safety around video review or questioning." },
          externalDistinction: { checked: true, note: "Distinct from pure facilitation-skill theme; this is about learner affect." },
          dataSupport: { checked: true, note: "Present across novice and experienced learners, though more acute for novices." },
          explanatoryValue: { checked: true, note: "Explains why some learners disengage early despite good facilitation." },
          relationToRQ: { checked: true, note: "Directly addresses how learners experience debrief." },
          relationToTheoryQ: { checked: true, note: "Refines Kolb by adding an affective precondition for reflective observation." },
        },
      },
    ],
    targetThemeCount: 4,
    negativeCases: [
      { id: "n1", docId: d3, start: 0, end: 40, text: "Honestly I froze during the scenario", type: "Differences in learner experience",
        explanation: "Unlike peers, this learner's distress originated in the scenario itself, not the debrief — suggests the intervention point may need to be earlier than debrief design.",
        addedBy: "Sample Team", createdAt: Date.now() - 1800000 },
    ],
    memos: [
      { id: "m1", researcherName: "Sample Team", timestamp: Date.now() - 7200000, docId: d1,
        text: "Noticing a pattern: the first few minutes of debrief seem to function differently than the rest. Might be worth a dedicated code for 'debrief opening.'" },
    ],
    reflexivityMemos: [
      { id: "rm1", researcherName: "Sample Team", timestamp: Date.now() - 10000000,
        text: "As facilitators ourselves, we may be inclined to interpret hesitation as engagement rather than disengagement. We tried to code literally what was said rather than our preferred interpretation of it." },
    ],
    dataDictionary: [
      { column: "Participant", description: "De-identified participant label", coding: "Text" },
      { column: "Confidence_Pre", description: "Self-rated confidence before debrief", coding: "1 = low … 5 = high" },
      { column: "Confidence_Post", description: "Self-rated confidence after debrief", coding: "1 = low … 5 = high" },
      { column: "Debrief_Satisfaction", description: "Satisfaction with the debrief process", coding: "1 = low … 5 = high" },
    ],
    themeSummaries: [],
    quantData: {
      description: "Post-simulation confidence (1–5) collected before and after each session, plus a debrief satisfaction rating (1–5).",
      columns: ["Participant", "Confidence_Pre", "Confidence_Post", "Debrief_Satisfaction"],
      rows: [
        { Participant: "Learner 1", Confidence_Pre: "2", Confidence_Post: "4", Debrief_Satisfaction: "3" },
        { Participant: "Learner 2", Confidence_Pre: "4", Confidence_Post: "4", Debrief_Satisfaction: "4" },
        { Participant: "Learner 3", Confidence_Pre: "2", Confidence_Post: "2", Debrief_Satisfaction: "2" },
      ],
      pairs: [{ id: "pr1", label: "Confidence (pre → post)", preCol: "Confidence_Pre", postCol: "Confidence_Post" }],
      domains: [{ id: "dom1", name: "Confidence", columnKeys: ["Confidence_Pre", "Confidence_Post"] }],
      showCharts: true,
    },
    individualUnlocked: { "Sample Team": true },
    metaInferences: {
      overallStatement: "Qualitative and quantitative strands converge: learners who describe early emotional exposure also show flatter or negative confidence shifts, while the learner reporting more facilitator questioning shows a positive shift.",
      converge: { text: "Learner 3's stagnant confidence score pairs with the strongest account of unmanaged emotional exposure — both data types point to the same struggling case.", themeIds: [themeId] },
      complement: { text: "The quantitative confidence shift shows *that* engagement changed; the qualitative data explains *why* (facilitator questioning vs. video replay).", themeIds: [themeId] },
      diverge: { text: "", themeIds: [] },
      expand: { text: "Debrief satisfaction scores don't capture the specific 'safety in the first ten minutes' window the qualitative data surfaced — a dimension the survey never measured.", themeIds: [themeId] },
      silence: { text: "The survey never asks about facilitator questioning style specifically, even though it turned out to be the qualitative data's central mechanism.", themeIds: [themeId] },
    },
    individualMatrix: [
      { id: "im1", docId: d1, componentNotes: { [comp1]: "Found it exposing at first.", [comp2]: "", [comp3]: "Valued it once safe." },
        helpful: "Peer perspective once the group felt safe.", limiting: "First ten minutes of video review felt exposing.",
        evidence: "Shifted from wanting to explain herself to actively valuing peer input.", futureApplication: "",
        contradictions: "Found both the most threatening and eventually most valuable moments in the same session.",
        memo: "Anchor case for the psychological-safety theme.", quoteIds: ["k1", "k2"] },
    ],
    groupMatrix: [
      { id: "gm1", topic: "Video review vs. questioning", sharedView: "Questioning felt more constructive than watching the replay.",
        variation: "", minorityView: "", componentId: comp2, learningChange: "Shift from defensiveness to shared problem-solving.",
        interpretation: "The group converges quickly once the facilitator shifts from evidence (video) to inquiry (why-questions).", quoteIds: ["k6"] },
    ],
    jointDisplay: [
      { id: "jd1", finding: "Confidence gains track with facilitator questioning, not video review", quantColumn: "Confidence_Post",
        quantEvidenceText: "Confidence_Post: n=3, median=4.0, IQR=3.0–4.0, missing=0", individualEvidence: "Learners who described more facilitator questioning also described more actionable reflection.",
        groupEvidence: "Group explicitly contrasted questioning favorably against video review.", componentId: comp2,
        relationship: "Complementarity", theoryInterpretation: "Consistent with reflective observation being scaffolded more by inquiry than by passive review.",
        negativeCase: "Learner 3's confidence stayed flat despite the group's generally positive view of questioning — scenario-level distress likely dominated.",
        metaInference: "Facilitator questioning technique, not video review itself, appears to be the active mechanism linking debrief design to confidence change." },
    ],
  };
})();

// ---------- text extraction ----------
let pdfjsLoadPromise = null;
function loadPdfJs() {
  if (typeof window !== "undefined" && window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    script.onerror = () => reject(new Error("Couldn't load the PDF reader. Try pasting the text instead."));
    document.head.appendChild(script);
  });
  return pdfjsLoadPromise;
}
async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n\n";
  }
  return text.trim();
}
async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return await file.text();
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }
  if (name.endsWith(".pdf")) return await extractPdfText(file);
  throw new Error("Unsupported file type — use .txt, .docx, or .pdf, or paste the text below.");
}

// ---------- helpers ----------
function getOffset(container, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}
function buildSegments(text, codings) {
  if (codings.length === 0) return [{ start: 0, end: text.length, codingIds: [] }];
  const bounds = new Set([0, text.length]);
  codings.forEach((c) => { bounds.add(c.start); bounds.add(c.end); });
  const sorted = Array.from(bounds).sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i], e = sorted[i + 1];
    if (e <= s) continue;
    const covering = codings.filter((c) => c.start <= s && c.end >= e);
    segs.push({ start: s, end: e, codingIds: covering.map((c) => c.id) });
  }
  return segs;
}
function segStyle(colors) {
  if (colors.length === 0) return {};
  if (colors.length === 1) return { backgroundColor: colors[0] + "3A", boxShadow: `inset 0 -2px 0 0 ${colors[0]}` };
  const n = colors.length;
  const stops = colors.map((c, i) => `${c}55 ${(i * 100) / n}%, ${c}55 ${((i + 1) * 100) / n}%`).join(", ");
  return { backgroundImage: `linear-gradient(90deg, ${stops})` };
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function draftLabel(project, draftId) {
  if (!draftId) return "in progress";
  const d = project.drafts.find((x) => x.id === draftId);
  if (!d) return "in progress";
  return d.scope === "group" ? `Group Draft ${d.draftNumber}` : `${d.researcherName} · Draft ${d.draftNumber}`;
}

// ---------- statistics ----------
function toNumber(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim();
  if (s === "") return NaN;
  return Number(s);
}
function median(sortedNums) {
  const n = sortedNums.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}
function quantile(sortedNums, q) {
  const n = sortedNums.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedNums[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sortedNums[lo];
  return sortedNums[lo] + (sortedNums[hi] - sortedNums[lo]) * (pos - lo);
}
function describeColumn(rows, col) {
  const raw = rows.map((r) => r[col]);
  const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
  const missing = raw.filter(isBlank).length;
  const present = raw.filter((v) => !isBlank(v));
  const freq = {};
  present.forEach((v) => { const key = String(v).trim(); freq[key] = (freq[key] || 0) + 1; });
  const freqTable = Object.entries(freq).map(([value, count]) => ({ value, count, pct: present.length ? (count / present.length) * 100 : 0 }))
    .sort((a, b) => { const na = Number(a.value), nb = Number(b.value); return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.value.localeCompare(b.value); });
  const nums = present.map(toNumber).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  const isNumeric = nums.length === present.length && present.length > 0;
  let med = null, q1 = null, q3 = null, iqr = null, floorPct = null, ceilPct = null, min = null, max = null;
  if (isNumeric) {
    med = median(nums); q1 = quantile(nums, 0.25); q3 = quantile(nums, 0.75); iqr = q3 - q1;
    min = nums[0]; max = nums[nums.length - 1];
    floorPct = (nums.filter((n) => n === min).length / nums.length) * 100;
    ceilPct = (nums.filter((n) => n === max).length / nums.length) * 100;
  }
  return { col, n: present.length, missing, freqTable, isNumeric, median: med, q1, q3, iqr, min, max, floorPct, ceilPct };
}

function erf(x) {
  const sign = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function normalCDF(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function logistic(x) { return 1 / (1 + Math.exp(-x)); }

function wilcoxonSignedRank(pre, post) {
  const diffs = [];
  for (let i = 0; i < pre.length; i++) {
    if (isNaN(pre[i]) || isNaN(post[i])) continue;
    const d = post[i] - pre[i];
    if (d !== 0) diffs.push(d);
  }
  const n = diffs.length;
  if (n === 0) return null;
  const abs = diffs.map((d) => Math.abs(d));
  const order = abs.map((v, i) => i).sort((a, b) => abs[a] - abs[b]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && abs[order[j + 1]] === abs[order[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  let wPlus = 0, wMinus = 0;
  for (let k = 0; k < n; k++) { if (diffs[k] > 0) wPlus += ranks[k]; else wMinus += ranks[k]; }
  const W = Math.min(wPlus, wMinus);
  const meanW = (n * (n + 1)) / 4;
  const tieGroups = {};
  abs.forEach((v) => { tieGroups[v] = (tieGroups[v] || 0) + 1; });
  let tieSum = 0;
  Object.values(tieGroups).forEach((t) => { tieSum += t * t * t - t; });
  const varianceW = (n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48;
  const z = varianceW > 0 ? (W - meanW) / Math.sqrt(varianceW) : 0;
  const p = Math.min(1, 2 * (1 - normalCDF(Math.abs(z))));
  const effectR = Math.abs(z) / Math.sqrt(n);
  return { n, wPlus, wMinus, W, z, p, effectR };
}

function pairedChangeTable(pre, post) {
  const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
  const cats = Array.from(new Set([...pre, ...post].filter((v) => !isBlank(v)).map((v) => String(v).trim()))).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b);
  });
  const table = {};
  cats.forEach((c) => { table[c] = {}; cats.forEach((c2) => { table[c][c2] = 0; }); });
  for (let i = 0; i < pre.length; i++) {
    if (isBlank(pre[i]) || isBlank(post[i])) continue;
    const a = String(pre[i]).trim(), b = String(post[i]).trim();
    if (table[a] && table[a][b] !== undefined) table[a][b]++;
  }
  return { cats, table };
}

function nelderMead(f, x0, opts = {}) {
  const n = x0.length;
  const maxIter = opts.maxIter || 3000;
  const tol = opts.tol || 1e-9;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const xi = x0.slice();
    xi[i] += xi[i] !== 0 ? 0.1 * Math.abs(xi[i]) : 0.1;
    simplex.push(xi);
  }
  let fvals = simplex.map(f);
  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;
  let iter = 0;
  while (iter < maxIter) {
    const order = fvals.map((v, i) => i).sort((a, b) => fvals[a] - fvals[b]);
    simplex = order.map((i) => simplex[i]);
    fvals = order.map((i) => fvals[i]);
    if (Math.abs(fvals[n] - fvals[0]) < tol) break;
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    for (let j = 0; j < n; j++) centroid[j] /= n;
    const worst = simplex[n];
    const xr = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fr = f(xr);
    if (fr < fvals[0]) {
      const xe = centroid.map((c, j) => c + gamma * (xr[j] - c));
      const fe = f(xe);
      if (fe < fr) { simplex[n] = xe; fvals[n] = fe; } else { simplex[n] = xr; fvals[n] = fr; }
    } else if (fr < fvals[n - 1]) {
      simplex[n] = xr; fvals[n] = fr;
    } else {
      const xc = centroid.map((c, j) => c + rho * (worst[j] - c));
      const fc = f(xc);
      if (fc < fvals[n]) { simplex[n] = xc; fvals[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) { simplex[i] = simplex[0].map((c, j) => c + sigma * (simplex[i][j] - c)); fvals[i] = f(simplex[i]); }
      }
    }
    iter++;
  }
  const order = fvals.map((v, i) => i).sort((a, b) => fvals[a] - fvals[b]);
  return { params: simplex[order[0]], value: fvals[order[0]], iterations: iter, converged: iter < maxIter };
}

function fitOrdinalLogistic(pre, post) {
  const allVals = [...pre, ...post].filter((v) => !isNaN(v));
  const cats = Array.from(new Set(allVals)).sort((a, b) => a - b);
  const K = cats.length;
  if (K < 2) return null;
  const catIndex = new Map(cats.map((c, i) => [c, i]));
  const obs = [];
  for (let i = 0; i < pre.length; i++) {
    if (isNaN(pre[i]) || isNaN(post[i])) continue;
    obs.push({ x: 0, y: catIndex.get(pre[i]) });
    obs.push({ x: 1, y: catIndex.get(post[i]) });
  }
  if (obs.length < 4) return null;

  function paramsToThetas(params) {
    const thetas = [params[1]];
    for (let j = 2; j <= K - 1; j++) thetas.push(thetas[j - 2] + Math.exp(params[j]));
    return thetas;
  }
  function negLogLik(params) {
    const beta = params[0];
    const thetas = paramsToThetas(params);
    let nll = 0;
    for (const { x, y } of obs) {
      const upper = y < K - 1 ? logistic(thetas[y] - beta * x) : 1;
      const lower = y > 0 ? logistic(thetas[y - 1] - beta * x) : 0;
      let p = upper - lower;
      if (p < 1e-10) p = 1e-10;
      nll -= Math.log(p);
    }
    return nll;
  }
  const init = new Array(K).fill(0).map((_, i) => (i === 0 ? 0 : i === 1 ? -1 : 0.3));
  const fitted = nelderMead(negLogLik, init);
  const beta = fitted.params[0];
  const h = 1e-3;
  const p0 = fitted.params.slice();
  const pPlus = p0.slice(); pPlus[0] += h;
  const pMinus = p0.slice(); pMinus[0] -= h;
  const d2 = (negLogLik(pPlus) - 2 * negLogLik(p0) + negLogLik(pMinus)) / (h * h);
  const se = d2 > 0 ? Math.sqrt(1 / d2) : NaN;
  const z = se > 0 ? beta / se : NaN;
  const p = isNaN(z) ? NaN : 2 * (1 - normalCDF(Math.abs(z)));
  return {
    beta, se, z, p, oddsRatio: Math.exp(beta),
    ciLow: isNaN(se) ? NaN : Math.exp(beta - 1.96 * se),
    ciHigh: isNaN(se) ? NaN : Math.exp(beta + 1.96 * se),
    n: obs.length, k: K, converged: fitted.converged,
  };
}

// pairwise char-span overlap between researchers who independently coded the same document
function computeInterCoderOverlap(project) {
  const researchers = Array.from(new Set(project.codings.filter((k) => k.scope === "individual").map((k) => k.researcherName)));
  const perDoc = [];
  let unionAny = 0, unionDouble = 0;
  project.documents.forEach((doc) => {
    const docCodings = project.codings.filter((k) => k.docId === doc.id && k.scope === "individual");
    const byResearcher = {};
    researchers.forEach((r) => { byResearcher[r] = docCodings.filter((k) => k.researcherName === r); });
    const coverage = {};
    researchers.forEach((r) => {
      const set = new Set();
      byResearcher[r].forEach((k) => { for (let i = k.start; i < k.end; i++) set.add(i); });
      coverage[r] = set;
    });
    const activeResearchers = researchers.filter((r) => coverage[r].size > 0);
    const pairs = [];
    for (let i = 0; i < activeResearchers.length; i++) {
      for (let j = i + 1; j < activeResearchers.length; j++) {
        const a = coverage[activeResearchers[i]], b = coverage[activeResearchers[j]];
        let inter = 0; a.forEach((x) => { if (b.has(x)) inter++; });
        const union = a.size + b.size - inter;
        if (union === 0) continue;
        pairs.push({ r1: activeResearchers[i], r2: activeResearchers[j], jaccard: inter / union });
      }
    }
    const charCounts = {};
    activeResearchers.forEach((r) => { coverage[r].forEach((x) => { charCounts[x] = (charCounts[x] || 0) + 1; }); });
    const anyCovered = Object.keys(charCounts).length;
    const doubleCovered = Object.values(charCounts).filter((c) => c >= 2).length;
    unionAny += anyCovered; unionDouble += doubleCovered;
    if (activeResearchers.length > 0) perDoc.push({ doc: doc.title, pairs, activeResearchers });
  });
  const overallDoubleCodedPct = unionAny > 0 ? (unionDouble / unionAny) * 100 : null;
  return { researchers, perDoc, overallDoubleCodedPct };
}

// ============================================================
// MAIN
// ============================================================
export default function App() {
  const [me, setMe] = useState(null);
  const [checkingMe, setCheckingMe] = useState(true);
  const [joinDraft, setJoinDraft] = useState({ email: "", projectName: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [project, setProject] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("setup");
  const [activeDocId, setActiveDocId] = useState(null);
  const [selection, setSelection] = useState(null);
  const [inspect, setInspect] = useState(null);
  const [filterCodeId, setFilterCodeId] = useState(null);
  const [codingScope, setCodingScope] = useState("individual");
  const [viewFilter, setViewFilter] = useState("all");
  const [colorBy, setColorBy] = useState("code");
  const [showNewDoc, setShowNewDoc] = useState(false);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastRemoteJSON = useRef("");

  // Restore a persisted Firebase session on load, and pull the researcher's
  // profile (project name, display name, role) back from Firestore.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setMe(null); setCheckingMe(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setMe(snap.data());
        } else {
          setJoinDraft((d) => ({ ...d, email: user.email || "" }));
        }
      } catch (e) {
        setJoinDraft((d) => ({ ...d, email: user.email || "" }));
      }
      setCheckingMe(false);
    });
    return () => unsub();
  }, []);

  // Live-subscribe to this project's Firestore document once logged in.
  useEffect(() => {
    if (!me) return;
    setLoaded(false);
    const ref = doc(db, "projects", me.projectDocId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? { ...EMPTY, ...snap.data() } : EMPTY;
      lastRemoteJSON.current = JSON.stringify(data);
      setProject(data);
      setLoaded(true);
    }, () => { setStatus("Load failed"); setLoaded(true); });
    return () => unsub();
  }, [me?.projectDocId]);

  // Debounced write-back to Firestore whenever local project state changes,
  // skipped if it's the same data we just received from the live listener.
  useEffect(() => {
    if (!loaded || !me) return;
    const json = JSON.stringify(project);
    if (json === lastRemoteJSON.current) return;
    const t = setTimeout(async () => {
      try {
        await setDoc(doc(db, "projects", me.projectDocId), project);
        lastRemoteJSON.current = json;
        setStatus("Saved"); setTimeout(() => setStatus(""), 1000);
      } catch (e) { setStatus("Save failed"); }
    }, 500);
    return () => clearTimeout(t);
  }, [project, loaded, me]);

  useEffect(() => {
    if (!activeDocId && project.documents.length) setActiveDocId(project.documents[0].id);
  }, [project.documents, activeDocId]);

  useEffect(() => {
    if (!me || me.role !== "individual" || !loaded) return;
    if (project.individualUnlocked?.[me.name]) return;
    const completed = project.documents.length > 0 && project.documents.every((doc) =>
      project.codings.some((k) => k.researcherName === me.name && k.docId === doc.id && k.draftId));
    if (completed) {
      setProject((p) => ({ ...p, individualUnlocked: { ...(p.individualUnlocked || {}), [me.name]: true } }));
    }
  }, [project.codings, project.documents, project.individualUnlocked, me, loaded]);

  // Email + Project Name login. First the email is checked against the
  // allowed_users whitelist; only then do we attempt Firebase Auth, where the
  // project name doubles as the password AND as the literal Firestore document
  // name everyone on the team shares (same project name, different emails).
  async function joinWithEmailAndProject(email, projectName) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanProject = (projectName || "").trim();
    if (!cleanEmail || !cleanProject) { setAuthError("Email and project name are both required."); return; }
    setAuthBusy(true);
    setAuthError("");
    try {
      const whitelisted = await isEmailWhitelisted(cleanEmail);
      if (!whitelisted) {
        setAuthError("Access Denied: Your email is not on the pre-approved whitelist.");
        setAuthBusy(false);
        return;
      }
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanProject);
      } catch (err) {
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
          cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanProject);
        } else if (err.code === "auth/wrong-password") {
          throw new Error("That project name doesn't match the one this email first signed up with. Use the exact same project name (it's case-sensitive), or a different whitelisted email to start a new project.");
        } else {
          throw err;
        }
      }
      const cleanName = cleanEmail.split("@")[0];
      const profile = {
        email: cleanEmail, projectName: cleanProject, projectDocId: safeDocId(cleanProject),
        name: cleanName, role: "group", color: hashColor(cleanName),
      };
      await setDoc(doc(db, "users", cred.user.uid), profile, { merge: true });
      setMe(profile);
    } catch (err) {
      setAuthError(err.message || "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }
  function logOut() {
    signOut(auth).catch(() => {});
    setMe(null);
  }

  const activeDoc = project.documents.find((d) => d.id === activeDocId) || null;
  const docCodings = useMemo(() => (activeDoc ? project.codings.filter((c) => c.docId === activeDoc.id) : []), [activeDoc, project.codings]);
  const visibleCodings = useMemo(() => docCodings.filter((k) => {
    if (viewFilter === "mine") return k.researcherName === me?.name;
    if (viewFilter.startsWith("draft:")) return k.draftId === viewFilter.slice(6);
    return true;
  }), [docCodings, viewFilter, me]);
  const segments = useMemo(() => (activeDoc ? buildSegments(activeDoc.text, visibleCodings) : []), [activeDoc, visibleCodings]);
  const codeById = (id) => project.codes.find((c) => c.id === id);

  function handleMouseUp() {
    const sel = window.getSelection();
    const container = containerRef.current;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !container) return;
    if (!container.contains(sel.anchorNode) || !container.contains(sel.focusNode)) return;
    const a = getOffset(container, sel.anchorNode, sel.anchorOffset);
    const f = getOffset(container, sel.focusNode, sel.focusOffset);
    const start = Math.min(a, f), end = Math.max(a, f);
    if (end <= start) return;
    setInspect(null);
    setSelection({ docId: activeDoc.id, start, end, text: activeDoc.text.slice(start, end) });
  }
  function clearSelection() { window.getSelection()?.removeAllRanges(); setSelection(null); }

  function assignCode(codeId, speaker) {
    if (!selection) return;
    const dup = project.codings.some((c) => c.docId === selection.docId && c.codeId === codeId && c.start === selection.start && c.end === selection.end && c.researcherName === me.name && c.scope === codingScope);
    if (!dup) {
      const coding = { id: uid(), docId: selection.docId, codeId, start: selection.start, end: selection.end, text: selection.text, researcherName: me.name, scope: codingScope, draftId: null, speaker: speaker || null };
      setProject((p) => ({ ...p, codings: [...p.codings, coding] }));
    }
    clearSelection();
  }
  function createCodeAndAssign(name, speaker) {
    if (!name.trim()) return;
    const color = PALETTE[project.codes.length % PALETTE.length];
    const code = { id: uid(), name: name.trim(), color, categoryId: null, memo: "", origin: "inductive", theoryId: null };
    setProject((p) => ({ ...p, codes: [...p.codes, code] }));
    if (selection) {
      const coding = { id: uid(), docId: selection.docId, codeId: code.id, start: selection.start, end: selection.end, text: selection.text, researcherName: me.name, scope: codingScope, draftId: null, speaker: speaker || null };
      setProject((p) => ({ ...p, codings: [...p.codings, coding] }));
    }
    clearSelection();
  }
  function removeCoding(codingId) {
    setProject((p) => ({ ...p, codings: p.codings.filter((c) => c.id !== codingId) }));
    setInspect(null);
  }
  const myInProgressCount = project.codings.filter((k) => k.scope === codingScope && k.draftId === null && (codingScope === "group" || k.researcherName === me?.name)).length;
  function saveDraft() {
    const isMine = (k) => k.scope === codingScope && k.draftId === null && (codingScope === "group" || k.researcherName === me.name);
    if (!project.codings.some(isMine)) { setStatus("Nothing to save"); setTimeout(() => setStatus(""), 1200); return; }
    const draftNumber = project.drafts.filter((d) => d.scope === codingScope && (codingScope === "group" || d.researcherName === me.name)).length + 1;
    const draft = { id: uid(), researcherName: codingScope === "group" ? "Group" : me.name, draftNumber, scope: codingScope, createdAt: Date.now() };
    setProject((p) => ({ ...p, drafts: [...p.drafts, draft], codings: p.codings.map((k) => (isMine(k) ? { ...k, draftId: draft.id } : k)) }));
  }
  function markFinalMasterCodebook(draftId) { setProject((p) => ({ ...p, finalMasterCodebookDraftId: draftId })); }
  function finalizeCategories() { setProject((p) => ({ ...p, categoriesFinalized: true })); }

  function addDocument(doc) { setProject((p) => ({ ...p, documents: [...p.documents, doc] })); setActiveDocId(doc.id); setShowNewDoc(false); }
  function deleteDocument(docId) {
    setProject((p) => ({ ...p, documents: p.documents.filter((d) => d.id !== docId), codings: p.codings.filter((c) => c.docId !== docId) }));
    if (activeDocId === docId) setActiveDocId(null);
  }

  function exportJSON() { download(`${project.name.replace(/\s+/g, "_")}.json`, JSON.stringify(project, null, 2), "application/json"); }
  function importJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { setProject({ ...EMPTY, ...JSON.parse(reader.result) }); setActiveDocId(null); setStage("setup"); }
      catch (err) { setStatus("Import failed"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const hasDocs = project.documents.length > 0;
  const masterFinal = !!project.finalMasterCodebookDraftId;
  const catsFinal = !!project.categoriesFinalized;
  const hasThemes = project.themes.length > 0;
  const isGroupRole = me?.role === "group";
  const myUnlocked = !!project.individualUnlocked?.[me?.name];

  let STAGES = [
    { id: "setup", label: "Setup", locked: false, alwaysVisible: true },
    { id: "code", label: "Code", locked: !hasDocs, reason: "Add a document in Setup first.", alwaysVisible: true },
    { id: "memos", label: "Memos", locked: !hasDocs, reason: "Add a document in Setup first.", alwaysVisible: true },
    { id: "masterCodebook", label: "Master Codebook", locked: !hasDocs, reason: "Add a document in Setup first." },
    { id: "categories", label: "Categories", locked: !masterFinal, reason: "Mark a Final Master Codebook first." },
    { id: "themes", label: "Themes", locked: !catsFinal, reason: "Finalize the category set first." },
    { id: "negativeCases", label: "Negative Cases", locked: !catsFinal, reason: "Finalize the category set first." },
    { id: "matrices", label: "Matrices", locked: !hasThemes, reason: "Draft at least one theme first." },
    { id: "summary", label: "Theme Summary", locked: !hasThemes, reason: "Draft at least one theme first." },
  ];
  if (project.studyType === "mixed") {
    STAGES.push({ id: "metaInferences", label: "Meta-Inferences", locked: !hasThemes, reason: "Draft at least one theme first." });
  }
  if (!isGroupRole) {
    STAGES = STAGES.filter((s) => s.alwaysVisible || myUnlocked);
  }
  const readOnly = !isGroupRole;

  if (checkingMe) return <LoadingScreen />;
  if (!me) return <JoinScreen draft={joinDraft} setDraft={setJoinDraft} onJoin={joinWithEmailAndProject} busy={authBusy} error={authError} />;
  if (!loaded) return <LoadingScreen />;

  return (
    <div className="w-full h-full min-h-screen flex flex-col font-serif" style={{ background: COLORS.bg, color: COLORS.ink }}>
      <Header project={project} setProject={setProject} status={status} me={me} onSwitch={logOut}
        onLoadSample={() => { setProject(SAMPLE); setActiveDocId(SAMPLE.documents[0].id); setStage("setup"); }}
        onNewProject={() => { setProject(EMPTY); setActiveDocId(null); setStage("setup"); }}
        onImportClick={() => fileInputRef.current?.click()} fileInputRef={fileInputRef} importJSON={importJSON} />
      <StageNav stages={STAGES} current={stage} onSelect={setStage} />
      {!isGroupRole && !myUnlocked && (
        <div className="px-5 py-2 text-xs font-mono" style={{ background: "#F4EBD8", color: "#7A5B1E", borderBottom: `1px solid ${COLORS.gold}55` }}>
          Individual view: code and memo every document, then save a draft covering all of them to unlock a read-only view of the rest of the project.
        </div>
      )}

      {stage === "setup" && (
        <SetupStage project={project} setProject={setProject} me={me} showNewDoc={showNewDoc} setShowNewDoc={setShowNewDoc}
          onAddDoc={addDocument} onDeleteDoc={deleteDocument} readOnly={readOnly} />
      )}

      {stage === "code" && (
        <>
          <div className="flex items-center gap-2 flex-wrap px-5 py-2 border-b text-xs font-mono" style={{ borderColor: COLORS.border, background: COLORS.panel, color: COLORS.inkMuted }}>
            <span>Coding as:</span>
            {["individual", "group"].map((s) => (
              <button key={s} onClick={() => setCodingScope(s)} className="px-2 py-1 rounded-sm"
                style={codingScope === s ? { background: COLORS.accent, color: "#fff" } : { border: `1px solid ${COLORS.border}` }}>
                {s === "individual" ? "Individual" : "Group consensus"}
              </button>
            ))}
            <span className="ml-2">Viewing:</span>
            <select value={viewFilter} onChange={(e) => setViewFilter(e.target.value)} className="border rounded-sm px-1.5 py-0.5" style={{ borderColor: COLORS.border }}>
              <option value="all">All coders</option>
              <option value="mine">Just me</option>
              {project.drafts.map((d) => <option key={d.id} value={`draft:${d.id}`}>{draftLabel(project, d.id)}</option>)}
            </select>
            <span className="ml-2">Color by:</span>
            <select value={colorBy} onChange={(e) => setColorBy(e.target.value)} className="border rounded-sm px-1.5 py-0.5" style={{ borderColor: COLORS.border }}>
              <option value="code">Code</option>
              <option value="researcher">Researcher</option>
            </select>
            <span className="ml-auto">{myInProgressCount} unsaved excerpt{myInProgressCount === 1 ? "" : "s"}</span>
            <button onClick={saveDraft} disabled={myInProgressCount === 0} className="px-2.5 py-1 rounded-sm text-white disabled:opacity-40" style={{ background: COLORS.accent }}>
              Save {codingScope === "group" ? "group" : "my"} draft
            </button>
          </div>
          <div className="flex flex-1 overflow-hidden">
            <DocList documents={project.documents} activeDocId={activeDocId}
              setActiveDocId={(id) => { setActiveDocId(id); setInspect(null); clearSelection(); }} onGoToSetup={() => setStage("setup")} />
            <main className="flex-1 overflow-y-auto p-6">
              {activeDoc ? (
                <DocReader doc={activeDoc} segments={segments} codings={visibleCodings} codeById={codeById} containerRef={containerRef}
                  onMouseUp={handleMouseUp} filterCodeId={filterCodeId} colorBy={colorBy}
                  onSegmentClick={(seg) => { if (window.getSelection()?.toString().length) return; if (seg.codingIds.length) { clearSelection(); setInspect(seg.codingIds); } }} />
              ) : (
                <EmptyState onNew={() => setStage("setup")} />
              )}
            </main>
            <Inspector selection={selection} onCancel={clearSelection} codes={project.codes} onAssign={assignCode} onCreate={createCodeAndAssign}
              inspect={inspect} inspectCodings={inspect ? project.codings.filter((c) => inspect.includes(c.id)) : []} codeById={codeById}
              onRemoveCoding={removeCoding} filterCodeId={filterCodeId} setFilterCodeId={setFilterCodeId} project={project}
              isGroupDoc={activeDoc?.documentType === "group"} />
          </div>
        </>
      )}

      {stage === "memos" && <MemosStage project={project} setProject={setProject} me={me} />}
      {stage === "masterCodebook" && <MasterCodebookStage project={project} setProject={setProject} onMarkFinal={markFinalMasterCodebook} readOnly={readOnly} />}
      {stage === "categories" && <CategoriesStage project={project} setProject={setProject} onFinalize={finalizeCategories} readOnly={readOnly} />}
      {stage === "themes" && <ThemesStage project={project} setProject={setProject} readOnly={readOnly} />}
      {stage === "negativeCases" && <NegativeCasesStage project={project} setProject={setProject} me={me} readOnly={readOnly} />}
      {stage === "matrices" && <MatricesStage project={project} setProject={setProject} readOnly={readOnly} />}
      {stage === "summary" && <ThemeSummaryStage project={project} setProject={setProject} readOnly={readOnly} />}
      {stage === "metaInferences" && <MetaInferencesStage project={project} setProject={setProject} readOnly={readOnly} />}
    </div>
  );
}

// ---------- join / loading ----------
function LoadingScreen() {
  return <div className="w-full min-h-screen flex items-center justify-center font-mono text-sm" style={{ background: COLORS.bg, color: COLORS.inkMuted }}>loading…</div>;
}
function JoinScreen({ draft, setDraft, onJoin, busy, error }) {
  function submit() { if (!busy) onJoin(draft.email, draft.projectName); }
  return (
    <div className="w-full min-h-screen flex items-center justify-center font-serif" style={{ background: COLORS.bg, color: COLORS.ink }}>
      <div className="w-80 p-6 rounded-sm space-y-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-sm flex items-center justify-center text-white text-sm font-mono" style={{ background: COLORS.accent }}>M</div>
          <h1 className="text-lg font-semibold">Marginal</h1>
        </div>
        <p className="text-xs" style={{ color: COLORS.inkMuted }}>Access is limited to pre-approved emails. Everyone on the team uses their own email but the exact same project name, so you all land on the same shared project.</p>
        <div className="space-y-1">
          <label className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Email</label>
          <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="you@example.com"
            className="w-full text-sm border rounded-sm px-2 py-1.5" style={{ borderColor: COLORS.border }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Project name</label>
          <input type="password" value={draft.projectName} onChange={(e) => setDraft((d) => ({ ...d, projectName: e.target.value }))} placeholder="e.g. Simulation Debrief Study"
            className="w-full text-sm border rounded-sm px-2 py-1.5 font-mono" style={{ borderColor: COLORS.border }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <p className="text-[11px]" style={{ color: COLORS.inkMuted }}>This also acts as your login password behind the scenes — share it with your team exactly as typed (it's case-sensitive). The first person to use a project name creates it; everyone after that must enter it identically to join.</p>
        </div>
        {error && <p className="text-xs rounded-sm p-2" style={{ background: "#F7E3E9", color: "#B24A73" }}>{error}</p>}
        <button onClick={submit} disabled={busy} className="w-full text-sm font-mono px-3 py-2 rounded-sm text-white disabled:opacity-50" style={{ background: COLORS.accent }}>
          {busy ? "Checking access…" : "Access Project"}
        </button>
        <p className="text-[11px]" style={{ color: COLORS.inkMuted }}>Your email must be on the pre-approved list before you can sign in. Contact your project lead to be added.</p>
      </div>
    </div>
  );
}

// ---------- header + stage nav ----------
function Header({ project, setProject, status, me, onSwitch, onLoadSample, onNewProject, onImportClick, fileInputRef, importJSON }) {
  return (
    <header className="border-b px-5 py-3 flex items-center gap-4 flex-wrap" style={{ borderColor: COLORS.border, background: COLORS.panel }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-sm flex items-center justify-center text-white text-sm font-mono" style={{ background: COLORS.accent }}>M</div>
        <input className="font-serif text-lg font-semibold bg-transparent outline-none" value={project.name}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))} style={{ color: COLORS.ink }} />
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs font-mono flex-wrap" style={{ color: COLORS.inkMuted }}>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#5F8C3E" }} />live</span>
        <span className="w-12">{status}</span>
        <button onClick={onLoadSample} className="flex items-center gap-1 hover:underline"><Sparkles size={13} /> sample</button>
        <button onClick={onImportClick} className="flex items-center gap-1 hover:underline"><Upload size={13} /> import</button>
        <input type="file" accept=".json" ref={fileInputRef} onChange={importJSON} className="hidden" />
        <button onClick={onNewProject} className="hover:underline">new project</button>
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-white" style={{ background: me.color }}><Users size={12} /> {me.name} · {me.role === "group" ? "group" : "individual"}</span>
        <span title={me.email}>project: {me.projectName}</span>
        <button onClick={onSwitch} className="hover:underline">sign out</button>
      </div>
    </header>
  );
}
function StageNav({ stages, current, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1 px-5 py-2 border-b" style={{ borderColor: COLORS.border, background: COLORS.panel }}>
      {stages.map((s, i) => {
        const active = current === s.id;
        return (
          <button key={s.id} disabled={s.locked} onClick={() => onSelect(s.id)} title={s.locked ? s.reason : ""}
            className="text-xs font-mono px-2.5 py-1 rounded-sm flex items-center gap-1"
            style={{ background: active ? COLORS.accent : "transparent", color: active ? "#fff" : s.locked ? "#B8BEB2" : COLORS.inkMuted, cursor: s.locked ? "not-allowed" : "pointer" }}>
            {i + 1}. {s.label} {s.locked && <Lock size={10} />}
          </button>
        );
      })}
    </div>
  );
}

// ---------- shared small components ----------
function ChipToggle({ items, activeIds, onToggle, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const active = activeIds.includes(it.id);
        return (
          <button key={it.id} disabled={disabled} onClick={() => onToggle(it.id)} className="text-xs font-mono px-2 py-1 rounded-sm disabled:opacity-60"
            style={active ? { background: COLORS.accent, color: "#fff" } : { border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}>{it.name}</button>
        );
      })}
      {items.length === 0 && <span className="text-xs" style={{ color: COLORS.inkMuted }}>None defined yet.</span>}
    </div>
  );
}
function NamedListEditor({ title, hint, items, onAdd, onDelete, readOnly, placeholder }) {
  const [name, setName] = useState("");
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>{title}</h3>
      {hint && <p className="text-xs" style={{ color: COLORS.inkMuted }}>{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it.id} className="text-xs font-mono px-2 py-1 rounded-sm flex items-center gap-1" style={{ border: `1px solid ${COLORS.border}` }}>
            {it.name}
            {!readOnly && <button onClick={() => onDelete(it.id)}><X size={11} /></button>}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className="text-sm border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); setName(""); } }} />
          <button onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(""); } }} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>+ add</button>
        </div>
      )}
    </section>
  );
}

// ---------- setup ----------
function SetupStage({ project, setProject, me, showNewDoc, setShowNewDoc, onAddDoc, onDeleteDoc, readOnly }) {
  const rq = project.researchQuestions || { qualitative: "", quantitative: "", mixed: "", secondary: "" };
  function updateRQ(key, v) { setProject((p) => ({ ...p, researchQuestions: { ...p.researchQuestions, [key]: v } })); }
  function addTheory(name) { setProject((p) => ({ ...p, learningTheories: [...p.learningTheories, { id: uid(), name, components: "" }] })); }
  function updateTheory(id, patch) { setProject((p) => ({ ...p, learningTheories: p.learningTheories.map((t) => (t.id === id ? { ...t, ...patch } : t)) })); }
  function deleteTheory(id) { setProject((p) => ({ ...p, learningTheories: p.learningTheories.filter((t) => t.id !== id) })); }
  function addComponent(name) { setProject((p) => ({ ...p, components: [...p.components, { id: uid(), name }] })); }
  function deleteComponent(id) { setProject((p) => ({ ...p, components: p.components.filter((c) => c.id !== id) })); }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-8">
      {readOnly && (
        <p className="text-xs rounded-sm p-2 flex items-center gap-1.5" style={{ background: "#F4EBD8", color: "#7A5B1E", border: `1px solid ${COLORS.gold}55` }}>
          <Lock size={12} /> Setup is locked to individual researchers — changes can only be made from the Group role.
        </p>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Study type</h3>
        <div className="flex gap-2">
          {["qualitative", "mixed"].map((t) => (
            <button key={t} disabled={readOnly} onClick={() => setProject((p) => ({ ...p, studyType: t }))} className="text-sm font-mono px-3 py-1.5 rounded-sm disabled:opacity-60"
              style={project.studyType === t ? { background: COLORS.accent, color: "#fff" } : { border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}>
              {t === "qualitative" ? "Purely qualitative" : "Mixed methods"}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Research questions</h3>
        <div>
          <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Qualitative</label>
          <textarea disabled={readOnly} value={rq.qualitative} onChange={(e) => updateRQ("qualitative", e.target.value)} rows={2}
            className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
        </div>
        {project.studyType === "mixed" && (
          <>
            <div>
              <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Quantitative</label>
              <textarea disabled={readOnly} value={rq.quantitative} onChange={(e) => updateRQ("quantitative", e.target.value)} rows={2}
                className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
            </div>
            <div>
              <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Mixed methods</label>
              <textarea disabled={readOnly} value={rq.mixed} onChange={(e) => updateRQ("mixed", e.target.value)} rows={2}
                className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
            </div>
          </>
        )}
        <div>
          <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Secondary / component question (optional)</label>
          <textarea disabled={readOnly} value={rq.secondary} onChange={(e) => updateRQ("secondary", e.target.value)} rows={2}
            className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Learning theories</h3>
        <p className="text-xs" style={{ color: COLORS.inkMuted }}>What are the key components of each learning theory that will frame and underpin this study? Add more than one if your analysis draws on multiple theoretical lenses.</p>
        {project.learningTheories.map((t) => (
          <div key={t.id} className="rounded-sm p-3 space-y-1.5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center gap-2">
              <input disabled={readOnly} value={t.name} onChange={(e) => updateTheory(t.id, { name: e.target.value })} className="text-sm font-semibold flex-1 bg-transparent outline-none disabled:opacity-80" />
              {!readOnly && <button onClick={() => deleteTheory(t.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={13} /></button>}
            </div>
            <textarea disabled={readOnly} value={t.components} onChange={(e) => updateTheory(t.id, { components: e.target.value })} rows={3}
              placeholder={"Key constructs, one per line"} className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
          </div>
        ))}
        {!readOnly && (
          <button onClick={() => addTheory("New theory")} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white flex items-center gap-1" style={{ background: COLORS.accent }}><Plus size={13} /> add theory</button>
        )}
      </section>

      <NamedListEditor title="Study components / intervention elements" hint="Optional — e.g. the distinct parts of your intervention (a simulated patient, a coaching tool, a delivery app). Used to organize the Individual Response and Group Discussion matrices."
        items={project.components} onAdd={addComponent} onDelete={deleteComponent} readOnly={readOnly} placeholder="Component name" />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Documents</h3>
          {!readOnly && <button onClick={() => setShowNewDoc(true)} className="text-xs font-mono px-2.5 py-1 rounded-sm text-white flex items-center gap-1" style={{ background: COLORS.accent }}><Plus size={13} /> add</button>}
        </div>
        <div className="space-y-1.5">
          {project.documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-sm text-sm" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
              <div className="min-w-0">
                <div className="truncate flex items-center gap-1.5">
                  {d.title}
                  {d.documentType === "group" && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm text-white flex-shrink-0" style={{ background: COLORS.gold }}>group discussion</span>
                  )}
                </div>
                <div className="text-xs font-mono truncate" style={{ color: COLORS.inkMuted }}>
                  {Object.entries(d.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}{d.addedBy ? `${Object.keys(d.attributes || {}).length ? " · " : ""}added by ${d.addedBy}` : ""}
                </div>
              </div>
              {!readOnly && <button onClick={() => onDeleteDoc(d.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={14} /></button>}
            </div>
          ))}
          {project.documents.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No documents yet.</p>}
        </div>
        {showNewDoc && !readOnly && <NewDocForm onCancel={() => setShowNewDoc(false)} onAdd={onAddDoc} me={me} />}
      </section>

      {project.studyType === "mixed" && <QuantDataSection project={project} setProject={setProject} readOnly={readOnly} />}
      {project.quantData?.columns?.length > 0 && <DataDictionarySection project={project} setProject={setProject} readOnly={readOnly} />}
    </div>
  );
}

function QuantDataSection({ project, setProject, readOnly }) {
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const q = project.quantData || { description: "", columns: [], rows: [], pairs: [], domains: [], showCharts: false };

  function applyParsed(result) {
    if (result.errors && result.errors.length) { setParseError(result.errors[0].message); return; }
    const columns = result.meta.fields || [];
    if (columns.length === 0) { setParseError("Couldn't find any columns — check the file has a header row."); return; }
    setParseError("");
    setProject((p) => ({ ...p, quantData: { ...p.quantData, columns, rows: result.data } }));
  }
  function parsePasted() {
    if (!pasteText.trim()) return;
    Papa.parse(pasteText.trim(), { header: true, skipEmptyLines: true, complete: applyParsed });
  }
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: applyParsed });
    e.target.value = "";
  }
  function clearData() {
    setProject((p) => ({ ...p, quantData: { description: p.quantData?.description || "", columns: [], rows: [], pairs: [], domains: [], showCharts: p.quantData?.showCharts || false } }));
  }
  function addDomain() {
    if (!newDomain.trim()) return;
    setProject((p) => ({ ...p, quantData: { ...p.quantData, domains: [...(p.quantData.domains || []), { id: uid(), name: newDomain.trim(), columnKeys: [] }] } }));
    setNewDomain("");
  }
  function toggleDomainColumn(domainId, col) {
    setProject((p) => ({
      ...p, quantData: { ...p.quantData, domains: p.quantData.domains.map((d) => {
        if (d.id !== domainId) return d;
        const has = d.columnKeys.includes(col);
        return { ...d, columnKeys: has ? d.columnKeys.filter((c) => c !== col) : [...d.columnKeys, col] };
      }) },
    }));
  }
  function deleteDomain(id) { setProject((p) => ({ ...p, quantData: { ...p.quantData, domains: p.quantData.domains.filter((d) => d.id !== id) } })); }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Quantitative data</h3>
      <p className="text-xs" style={{ color: COLORS.inkMuted }}>Since this is a mixed-methods study, add the quantitative dataset that pairs with these transcripts (e.g. survey scores, pre/post measures). Include a participant identifier column that matches your document titles where possible.</p>
      <textarea disabled={readOnly} value={q.description} onChange={(e) => setProject((p) => ({ ...p, quantData: { ...p.quantData, description: e.target.value } }))}
        rows={2} placeholder="What quantitative measures were collected?" className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
      {!readOnly && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs font-mono px-2 py-1.5 rounded-sm cursor-pointer w-fit" style={{ border: `1px dashed ${COLORS.border}`, color: COLORS.accent }}>
              <Upload size={13} /> upload .csv
              <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
            {q.rows.length > 0 && <button onClick={clearData} className="text-xs font-mono hover:underline" style={{ color: COLORS.inkMuted }}>clear data</button>}
          </div>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={3} placeholder={"…or paste CSV text here, e.g.\nParticipant,Score1,Score2\nLearner 1,4,3"}
            className="w-full text-sm border rounded-sm px-2 py-1.5 font-mono" style={{ borderColor: COLORS.border }} />
          <button onClick={parsePasted} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>Parse pasted data</button>
          {parseError && <p className="text-xs" style={{ color: "#B24A73" }}>{parseError}</p>}
        </>
      )}
      {q.rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="text-xs font-mono border-collapse">
              <thead><tr>{q.columns.map((c) => <th key={c} className="p-1.5 border text-left" style={{ borderColor: COLORS.border }}>{c}</th>)}</tr></thead>
              <tbody>
                {q.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{q.columns.map((c) => <td key={c} className="p-1.5 border" style={{ borderColor: COLORS.border }}>{r[c]}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs font-mono mt-1" style={{ color: COLORS.inkMuted }}>{q.rows.length} row{q.rows.length === 1 ? "" : "s"} loaded{q.rows.length > 5 ? " (showing first 5)" : ""}. Full statistics live in Matrices.</p>
          </div>

          <div className="space-y-1.5 pt-2">
            <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Are there domains or constructs grouping these items? (e.g. "AI-patient simulation," "GPT debrief")</span>
            {(q.domains || []).map((d) => (
              <div key={d.id} className="rounded-sm p-2" style={{ border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{d.name}</span>
                  {!readOnly && <button onClick={() => deleteDomain(d.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={12} /></button>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {q.columns.map((c) => {
                    const active = d.columnKeys.includes(c);
                    return <button key={c} disabled={readOnly} onClick={() => toggleDomainColumn(d.id, c)} className="text-xs font-mono px-2 py-0.5 rounded-sm disabled:opacity-60"
                      style={active ? { background: COLORS.accent, color: "#fff" } : { border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}>{c}</button>;
                  })}
                </div>
              </div>
            ))}
            {!readOnly && (
              <div className="flex gap-2">
                <input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="Domain name" className="text-sm border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }} />
                <button onClick={addDomain} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>+ domain</button>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs font-mono pt-2">
            <input type="checkbox" disabled={readOnly} checked={!!q.showCharts} onChange={(e) => setProject((p) => ({ ...p, quantData: { ...p.quantData, showCharts: e.target.checked } }))} />
            Include diverging stacked-bar charts for Likert-style items in Matrices
          </label>
        </>
      )}
    </section>
  );
}

function DataDictionarySection({ project, setProject, readOnly }) {
  const dict = project.dataDictionary || [];
  const columns = project.quantData?.columns || [];
  useEffect(() => {
    const missing = columns.filter((c) => !dict.some((d) => d.column === c));
    if (missing.length > 0) {
      setProject((p) => ({ ...p, dataDictionary: [...(p.dataDictionary || []), ...missing.map((c) => ({ column: c, description: "", coding: "" }))] }));
    }
    // eslint-disable-next-line
  }, [columns.join("|")]);
  function update(col, patch) {
    setProject((p) => ({ ...p, dataDictionary: p.dataDictionary.map((d) => (d.column === col ? { ...d, ...patch } : d)) }));
  }
  function exportCSV() {
    const header = ["Column", "Description", "Coding / values"];
    const rows = dict.map((d) => [d.column, d.description, d.coding].map(csvEscape).join(","));
    download("data_dictionary.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Data dictionary</h3>
        <button onClick={exportCSV} className="text-xs font-mono px-2.5 py-1 rounded-sm flex items-center gap-1" style={{ border: `1px solid ${COLORS.border}` }}><Download size={12} /> export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs font-mono border-collapse w-full">
          <thead><tr>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Column</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Description</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Coding / values</th>
          </tr></thead>
          <tbody>
            {dict.map((d) => (
              <tr key={d.column}>
                <td className="p-2 border font-semibold" style={{ borderColor: COLORS.border }}>{d.column}</td>
                <td className="p-2 border" style={{ borderColor: COLORS.border }}>
                  <input disabled={readOnly} value={d.description} onChange={(e) => update(d.column, { description: e.target.value })} className="w-full bg-transparent outline-none disabled:opacity-70" />
                </td>
                <td className="p-2 border" style={{ borderColor: COLORS.border }}>
                  <input disabled={readOnly} value={d.coding} onChange={(e) => update(d.column, { coding: e.target.value })} placeholder="e.g. 1=low … 5=high" className="w-full bg-transparent outline-none disabled:opacity-70" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NewDocForm({ onCancel, onAdd, me }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [documentType, setDocumentType] = useState("individual");
  const [attrs, setAttrs] = useState([{ key: "", value: "" }]);
  const [fileStatus, setFileStatus] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileStatus(`Reading ${file.name}…`);
    try {
      const extracted = await extractText(file);
      setText(extracted);
      if (!title.trim()) setTitle(file.name.replace(/\.(txt|md|docx|pdf)$/i, ""));
      setFileStatus(`Loaded ${file.name} — ${extracted.length.toLocaleString()} characters. Review below before adding.`);
    } catch (err) { setFileStatus(err.message || "Couldn't read that file — try pasting the text instead."); }
    e.target.value = "";
  }

  return (
    <div className="p-4 rounded-sm space-y-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full text-sm border rounded-sm px-2 py-1 font-serif" style={{ borderColor: COLORS.border }} />
      <div className="flex gap-2">
        {[["individual", "Individual transcript"], ["group", "Group discussion (no individual IDs)"]].map(([val, lab]) => (
          <button key={val} type="button" onClick={() => setDocumentType(val)} className="text-xs font-mono px-2 py-1 rounded-sm"
            style={documentType === val ? { background: COLORS.accent, color: "#fff" } : { border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}>{lab}</button>
        ))}
      </div>
      {documentType === "group" && (
        <p className="text-xs" style={{ color: COLORS.inkMuted }}>Coders can still tag a speaker on individual excerpts if one is identifiable, but this document won't be treated as a single participant in the framework or quantitative matrices.</p>
      )}
      <label className="flex items-center gap-1.5 text-xs font-mono px-2 py-1.5 rounded-sm cursor-pointer w-fit" style={{ border: `1px dashed ${COLORS.border}`, color: COLORS.accent }}>
        <Upload size={13} /> upload .txt / .docx / .pdf
        <input type="file" accept=".txt,.md,.docx,.pdf" onChange={handleFile} className="hidden" />
      </label>
      {fileStatus && <p className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>{fileStatus}</p>}
      <textarea placeholder="…or paste transcript or field notes here" value={text} onChange={(e) => setText(e.target.value)} rows={6}
        className="w-full text-sm border rounded-sm px-2 py-1 font-serif" style={{ borderColor: COLORS.border }} />
      <div className="space-y-1">
        <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Attributes (for the quantitative matrix)</span>
        {attrs.map((a, i) => (
          <div key={i} className="flex gap-1">
            <input placeholder="key" value={a.key} onChange={(e) => setAttrs((arr) => arr.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
              className="w-1/2 text-xs border rounded-sm px-1.5 py-0.5 font-mono" style={{ borderColor: COLORS.border }} />
            <input placeholder="value" value={a.value} onChange={(e) => setAttrs((arr) => arr.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
              className="w-1/2 text-xs border rounded-sm px-1.5 py-0.5 font-mono" style={{ borderColor: COLORS.border }} />
          </div>
        ))}
        <button onClick={() => setAttrs((a) => [...a, { key: "", value: "" }])} className="text-xs font-mono hover:underline" style={{ color: COLORS.accent }}>+ attribute</button>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => {
          if (!title.trim() || !text.trim()) return;
          const attributes = {};
          attrs.forEach((a) => { if (a.key.trim()) attributes[a.key.trim()] = a.value.trim(); });
          onAdd({ id: uid(), title: title.trim(), text: text.trim(), documentType, attributes, addedBy: me?.name || "Researcher" });
        }} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>Add document</button>
        <button onClick={onCancel} className="text-xs font-mono px-3 py-1.5" style={{ color: COLORS.inkMuted }}>Cancel</button>
      </div>
    </div>
  );
}
function EmptyState({ onNew }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-3" style={{ color: COLORS.inkMuted }}>
      <FileText size={28} />
      <p className="text-sm max-w-xs">No document open. Add documents from Setup to start coding.</p>
      <button onClick={onNew} className="text-sm font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>Go to Setup</button>
    </div>
  );
}

// ---------- document list / reader / segments ----------
function DocList({ documents, activeDocId, setActiveDocId, onGoToSetup }) {
  return (
    <aside className="w-64 border-r overflow-y-auto flex-shrink-0" style={{ borderColor: COLORS.border, background: COLORS.panel }}>
      <div className="p-3 flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Documents</span>
        <button onClick={onGoToSetup} className="text-xs font-mono hover:underline" style={{ color: COLORS.accent }}>manage</button>
      </div>
      {documents.map((d) => (
        <div key={d.id} onClick={() => setActiveDocId(d.id)} className="px-3 py-2 border-t cursor-pointer" style={{ borderColor: COLORS.border, background: d.id === activeDocId ? COLORS.bg : "transparent" }}>
          <div className="text-sm truncate flex items-center gap-1.5">
            {d.title}
            {d.documentType === "group" && <span className="text-[9px] font-mono px-1 py-0.5 rounded-sm text-white flex-shrink-0" style={{ background: COLORS.gold }}>group</span>}
          </div>
          {d.attributes && Object.keys(d.attributes).length > 0 && (
            <div className="text-xs font-mono truncate" style={{ color: COLORS.inkMuted }}>{Object.entries(d.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>
          )}
        </div>
      ))}
      {documents.length === 0 && <p className="text-xs p-3" style={{ color: COLORS.inkMuted }}>No documents yet — add some in Setup.</p>}
    </aside>
  );
}
function DocReader({ doc, segments, codings, codeById, containerRef, onMouseUp, filterCodeId, colorBy, onSegmentClick }) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
        {doc.title}
        {doc.documentType === "group" && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm text-white" style={{ background: COLORS.gold }}>group discussion — no individual IDs</span>}
      </h2>
      {doc.attributes && Object.keys(doc.attributes).length > 0 && (
        <div className="text-xs font-mono mb-4" style={{ color: COLORS.inkMuted }}>{Object.entries(doc.attributes).map(([k, v]) => `${k}: ${v}`).join("   ·   ")}</div>
      )}
      <div ref={containerRef} onMouseUp={onMouseUp} className="text-[15px] leading-8 select-text rounded-sm p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
        <SegmentedText doc={doc} segments={segments} codings={codings} codeById={codeById} filterCodeId={filterCodeId} colorBy={colorBy} onSegmentClick={onSegmentClick} />
      </div>
    </div>
  );
}
function SegmentedText({ doc, segments, codings, codeById, filterCodeId, colorBy, onSegmentClick }) {
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {segments.map((seg, i) => {
        const text = doc.text.slice(seg.start, seg.end);
        const segCodings = seg.codingIds.map((id) => codings.find((k) => k.id === id)).filter(Boolean);
        const codeIds = segCodings.map((k) => k.codeId);
        const codeObjs = codeIds.map((id) => codeById(id)).filter(Boolean);
        const dimmed = filterCodeId && !codeIds.includes(filterCodeId);
        const colors = colorBy === "researcher" ? segCodings.map((k) => hashColor(k.researcherName)) : codeObjs.map((c) => c.color);
        const anyUnsaved = segCodings.some((k) => !k.draftId);
        const style = { ...segStyle(colors), opacity: dimmed ? 0.35 : 1, cursor: colors.length ? "pointer" : "text" };
        if (anyUnsaved && colors.length) style.outline = `1px dashed ${COLORS.inkMuted}`;
        const label = colorBy === "researcher"
          ? segCodings.map((k) => `${k.researcherName}: ${codeById(k.codeId)?.name || ""}`).join(", ")
          : codeObjs.map((c) => c.name).join(", ");
        return <span key={i} style={style} onClick={() => onSegmentClick(seg)} title={label}>{text}</span>;
      })}
    </span>
  );
}

// ---------- inspector ----------
function Inspector({ selection, onCancel, codes, onAssign, onCreate, inspect, inspectCodings, codeById, onRemoveCoding, filterCodeId, setFilterCodeId, project, isGroupDoc }) {
  const [newName, setNewName] = useState("");
  const [speaker, setSpeaker] = useState("");
  return (
    <aside className="w-72 border-l overflow-y-auto flex-shrink-0 p-4" style={{ borderColor: COLORS.border, background: COLORS.panel }}>
      {selection ? (
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Assign code</div>
          <blockquote className="text-sm italic border-l-2 pl-2" style={{ borderColor: COLORS.gold }}>"{selection.text}"</blockquote>
          {isGroupDoc && (
            <div className="space-y-1">
              <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Speaker (optional — this is a group discussion, so identities may not be known)</label>
              <input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="e.g. Voice 2, or leave blank"
                className="w-full text-xs border rounded-sm px-2 py-1 font-mono" style={{ borderColor: COLORS.border }} />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {codes.map((c) => <button key={c.id} onClick={() => onAssign(c.id, speaker)} className="text-xs font-mono px-2 py-1 rounded-sm text-white" style={{ background: c.color }}>{c.name}</button>)}
          </div>
          <div className="flex gap-1.5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new code name" className="flex-1 text-xs border rounded-sm px-2 py-1 font-mono" style={{ borderColor: COLORS.border }}
              onKeyDown={(e) => { if (e.key === "Enter") { onCreate(newName, speaker); setNewName(""); } }} />
            <button onClick={() => { onCreate(newName, speaker); setNewName(""); }} className="text-xs font-mono px-2 py-1 rounded-sm text-white" style={{ background: COLORS.accent }}>+ create</button>
          </div>
          <p className="text-[11px]" style={{ color: COLORS.inkMuted }}>New codes start as inductive — mark them deductive and link a theory later in the Master Codebook.</p>
          <button onClick={onCancel} className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>cancel</button>
        </div>
      ) : inspect && inspectCodings.length ? (
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Coded excerpt</div>
          <blockquote className="text-sm italic border-l-2 pl-2" style={{ borderColor: COLORS.gold }}>"{inspectCodings[0].text}"</blockquote>
          <div className="space-y-1.5">
            {inspectCodings.map((k) => {
              const c = codeById(k.codeId);
              if (!c) return null;
              return (
                <div key={k.id} className="rounded-sm text-white overflow-hidden" style={{ background: c.color }}>
                  <div className="flex items-center justify-between text-xs font-mono px-2 py-1">
                    <span>{c.name}</span>
                    <button onClick={() => onRemoveCoding(k.id)}><X size={13} /></button>
                  </div>
                  <div className="text-[10px] font-mono px-2 pb-1 opacity-90">
                    {k.researcherName} · {draftLabel(project, k.draftId)}
                    {isGroupDoc && <> · {k.speaker ? k.speaker : "unidentified speaker"}</>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Codebook</div>
          <p className="text-xs" style={{ color: COLORS.inkMuted }}>Select text in the reader to apply a code. Click a code below to highlight only its excerpts.</p>
          <div className="space-y-1">
            {codes.map((c) => {
              const active = filterCodeId === c.id;
              return (
                <button key={c.id} onClick={() => setFilterCodeId(active ? null : c.id)} className="w-full flex items-center justify-between text-xs font-mono px-2 py-1.5 rounded-sm"
                  style={{ background: active ? c.color : COLORS.bg, color: active ? "#fff" : COLORS.ink, border: `1px solid ${c.color}55` }}>
                  <span className="flex items-center gap-1.5"><Tag size={12} />{c.name}</span>
                </button>
              );
            })}
            {codes.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No codes yet.</p>}
          </div>
        </div>
      )}
    </aside>
  );
}

// ---------- memos ----------
function MemoBlock({ title, hint, entries, onAdd, documents, allowDocLink }) {
  const [text, setText] = useState("");
  const [docId, setDocId] = useState("");
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  return (
    <section className="space-y-2 rounded-sm p-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>{title}</h3>
      <p className="text-xs" style={{ color: COLORS.inkMuted }}>{hint}</p>
      {allowDocLink && (
        <select value={docId} onChange={(e) => setDocId(e.target.value)} className="text-xs font-mono border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}>
          <option value="">General / project-level</option>
          {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Write here…"
        className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif" style={{ borderColor: COLORS.border }} />
      <button onClick={() => { if (text.trim()) { onAdd(text.trim(), docId || null); setText(""); } }} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>Add</button>
      <div className="space-y-2 pt-2">
        {sorted.map((m) => (
          <div key={m.id} className="rounded-sm p-2.5" style={{ background: COLORS.bg }}>
            <div className="flex items-center justify-between text-xs font-mono mb-1" style={{ color: COLORS.inkMuted }}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: hashColor(m.researcherName) }} />{m.researcherName}</span>
              <span>{new Date(m.timestamp).toLocaleString()}</span>
            </div>
            {m.docId && <div className="text-xs font-mono mb-1" style={{ color: COLORS.accent }}>{documents.find((d) => d.id === m.docId)?.title || "deleted document"}</div>}
            <p className="text-sm whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
        {sorted.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>None yet.</p>}
      </div>
    </section>
  );
}
function MemosStage({ project, setProject, me }) {
  function addMemo(text, docId) {
    setProject((p) => ({ ...p, memos: [...p.memos, { id: uid(), researcherName: me.name, timestamp: Date.now(), text, docId }] }));
  }
  function addReflexivity(text) {
    setProject((p) => ({ ...p, reflexivityMemos: [...(p.reflexivityMemos || []), { id: uid(), researcherName: me.name, timestamp: Date.now(), text }] }));
  }
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-6">
      <MemoBlock title="Analytic memos" hint="Capture your evolving interpretation as you move from data to findings — hunches, tensions, questions for the group. Visible to everyone on this project."
        entries={project.memos} onAdd={addMemo} documents={project.documents} allowDocLink={true} />
      <MemoBlock title="Reflexivity memos" hint="Document your own position, assumptions, and potential bias as a researcher — separate from analytic notes about the data."
        entries={project.reflexivityMemos || []} onAdd={(text) => addReflexivity(text)} documents={project.documents} allowDocLink={false} />
    </div>
  );
}

// ---------- master codebook ----------
function MasterCodebookStage({ project, setProject, onMarkFinal, readOnly }) {
  const drafts = [...project.drafts].sort((a, b) => b.createdAt - a.createdAt);
  const [expanded, setExpanded] = useState(null);
  function countFor(draft) { return project.codings.filter((k) => k.draftId === draft.id).length; }
  function updateCode(codeId, patch) { setProject((p) => ({ ...p, codes: p.codes.map((c) => (c.id === codeId ? { ...c, ...patch } : c)) })); }
  function deleteCode(codeId) { setProject((p) => ({ ...p, codes: p.codes.filter((c) => c.id !== codeId), codings: p.codings.filter((k) => k.codeId !== codeId) })); }
  function dataSourcesFor(codeId) {
    const docIds = new Set(project.codings.filter((k) => k.codeId === codeId).map((k) => k.docId));
    const types = new Set();
    docIds.forEach((id) => { const d = project.documents.find((x) => x.id === id); if (d) types.add(d.documentType === "group" ? "group discussion" : "individual / survey"); });
    return Array.from(types);
  }
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-8">
      {readOnly && (
        <p className="text-xs rounded-sm p-2 flex items-center gap-1.5" style={{ background: "#F4EBD8", color: "#7A5B1E", border: `1px solid ${COLORS.gold}55` }}>
          <Lock size={12} /> Read-only — the master codebook can only be revised from the Group role.
        </p>
      )}
      {!readOnly && <InterCoderOverlapPanel project={project} />}
      <section className="space-y-2">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Saved drafts</h3>
        <p className="text-xs" style={{ color: COLORS.inkMuted }}>Save individual drafts from Code, then switch to "Group consensus" there to merge and revise. When the group agrees on a version, mark it final here to unlock Categories.</p>
        <div className="space-y-1.5">
          {drafts.map((d) => {
            const isFinal = project.finalMasterCodebookDraftId === d.id;
            return (
              <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-sm text-sm" style={{ background: isFinal ? "#FBF3DD" : COLORS.panel, border: `1px solid ${isFinal ? COLORS.gold : COLORS.border}` }}>
                <div>
                  <span className="font-mono text-xs" style={{ color: COLORS.inkMuted }}>{new Date(d.createdAt).toLocaleDateString()}</span>{" "}
                  {d.scope === "group" ? `Group Draft ${d.draftNumber}` : `${d.researcherName} · Draft ${d.draftNumber}`}
                  <span className="text-xs font-mono ml-2" style={{ color: COLORS.inkMuted }}>{countFor(d)} excerpts</span>
                </div>
                {isFinal ? (
                  <span className="text-xs font-mono flex items-center gap-1" style={{ color: COLORS.gold }}><Check size={13} /> final master codebook</span>
                ) : !readOnly ? (
                  <button onClick={() => onMarkFinal(d.id)} className="text-xs font-mono px-2.5 py-1 rounded-sm" style={{ border: `1px solid ${COLORS.border}`, color: COLORS.accent }}>mark as final</button>
                ) : null}
              </div>
            );
          })}
          {drafts.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No drafts saved yet — go to Code and save your first draft.</p>}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Codes &amp; examples</h3>
        <div className="space-y-1.5">
          {project.codes.map((c) => {
            const count = project.codings.filter((k) => k.codeId === c.id).length;
            const open = expanded === c.id;
            const sources = dataSourcesFor(c.id);
            return (
              <div key={c.id} className="rounded-sm" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <input disabled={readOnly} value={c.name} onChange={(e) => updateCode(c.id, { name: e.target.value })} className="text-sm flex-1 bg-transparent outline-none disabled:opacity-80" />
                  <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>{count}</span>
                  <button onClick={() => setExpanded(open ? null : c.id)} style={{ color: COLORS.inkMuted }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  {!readOnly && <button onClick={() => deleteCode(c.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={13} /></button>}
                </div>
                {open && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Origin:</span>
                      {["inductive", "deductive"].map((o) => (
                        <button key={o} disabled={readOnly} onClick={() => updateCode(c.id, { origin: o })} className="text-xs font-mono px-2 py-0.5 rounded-sm disabled:opacity-60"
                          style={(c.origin || "inductive") === o ? { background: COLORS.accent, color: "#fff" } : { border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}>{o}</button>
                      ))}
                      {c.origin === "deductive" && (
                        <select disabled={readOnly} value={c.theoryId || ""} onChange={(e) => updateCode(c.id, { theoryId: e.target.value || null })} className="text-xs font-mono border rounded-sm px-1.5 py-0.5 disabled:opacity-60" style={{ borderColor: COLORS.border }}>
                          <option value="">Which theory?</option>
                          {project.learningTheories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      )}
                      {sources.length > 0 && <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>· from: {sources.join(", ")}</span>}
                    </div>
                    <textarea disabled={readOnly} value={c.memo || ""} onChange={(e) => updateCode(c.id, { memo: e.target.value })} rows={2} placeholder="Definition / inclusion criteria / examples…"
                      className="w-full text-sm border rounded-sm px-2 py-1 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
                    {project.codings.filter((k) => k.codeId === c.id).map((k) => (
                      <p key={k.id} className="text-sm italic" style={{ color: COLORS.inkMuted }}>"{k.text}" — {k.researcherName}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {project.codes.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No codes yet.</p>}
        </div>
      </section>
    </div>
  );
}

function InterCoderOverlapPanel({ project }) {
  const { researchers, perDoc, overallDoubleCodedPct } = useMemo(() => computeInterCoderOverlap(project), [project.codings, project.documents]);
  return (
    <section className="space-y-2 rounded-sm p-3" style={{ background: "#EAF1EF", border: `1px solid ${COLORS.border}` }}>
      <h3 className="text-xs font-mono uppercase tracking-wide flex items-center gap-1.5" style={{ color: COLORS.inkMuted }}>
        <Users size={12} /> Inter-coder overlap (group view only)
      </h3>
      {researchers.length < 2 ? (
        <p className="text-xs" style={{ color: COLORS.inkMuted }}>Needs at least two researchers with individual-scope coding to compute.</p>
      ) : (
        <>
          <p className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>
            Corpus-wide double-coded coverage: {overallDoubleCodedPct === null ? "—" : `${overallDoubleCodedPct.toFixed(0)}%`} of coded text has been independently flagged by 2+ researchers.
          </p>
          <div className="space-y-1">
            {perDoc.filter((d) => d.pairs.length > 0).map((d) => (
              <div key={d.doc} className="text-xs font-mono">
                <span style={{ color: COLORS.inkMuted }}>{d.doc}:</span>{" "}
                {d.pairs.map((p, i) => <span key={i}>{p.r1} × {p.r2}: {(p.jaccard * 100).toFixed(0)}% overlap{i < d.pairs.length - 1 ? " · " : ""}</span>)}
              </div>
            ))}
            {perDoc.every((d) => d.pairs.length === 0) && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No document has been coded by more than one researcher yet.</p>}
          </div>
          <p className="text-[11px]" style={{ color: COLORS.inkMuted }}>Overlap = the proportion of shared vs. combined coded text between two coders on the same document (a Jaccard index on character spans) — a rough proxy for double-coding coverage, not a formal kappa statistic.</p>
        </>
      )}
    </section>
  );
}

// ---------- categories ----------
function CategoriesStage({ project, setProject, onFinalize, readOnly }) {
  const [newCat, setNewCat] = useState("");
  function addCategory() {
    if (!newCat.trim()) return;
    setProject((p) => ({ ...p, categories: [...p.categories, { id: uid(), name: newCat.trim(), memo: "" }] }));
    setNewCat("");
  }
  function assignCategory(codeId, categoryId) { setProject((p) => ({ ...p, codes: p.codes.map((c) => (c.id === codeId ? { ...c, categoryId: categoryId || null } : c)) })); }
  function deleteCategory(catId) { setProject((p) => ({ ...p, categories: p.categories.filter((c) => c.id !== catId), codes: p.codes.map((c) => (c.categoryId === catId ? { ...c, categoryId: null } : c)) })); }
  const grouped = [{ id: null, name: "Ungrouped" }, ...project.categories].map((cat) => ({ ...cat, codes: project.codes.filter((c) => (c.categoryId || null) === cat.id) }));
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
      {readOnly && (
        <p className="text-xs rounded-sm p-2 flex items-center gap-1.5" style={{ background: "#F4EBD8", color: "#7A5B1E", border: `1px solid ${COLORS.gold}55` }}>
          <Lock size={12} /> Read-only — categories can only be revised from the Group role.
        </p>
      )}
      <p className="text-xs rounded-sm p-3" style={{ background: "#EAF1EF", color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}>Group related codes into categories (axial coding), using your Final Master Codebook.</p>
      <div className="flex gap-2 items-center flex-wrap">
        {!readOnly && (
          <>
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name" className="text-sm border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}
              onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
            <button onClick={addCategory} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>+ category</button>
          </>
        )}
        {!project.categoriesFinalized ? (
          !readOnly && <button onClick={onFinalize} className="ml-auto text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.gold }}>Finalize category set</button>
        ) : (
          <span className="ml-auto text-xs font-mono flex items-center gap-1" style={{ color: COLORS.gold }}><Check size={13} /> categories finalized</span>
        )}
      </div>
      {grouped.map((cat) => (
        <div key={cat.id ?? "none"}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">{cat.name}</h3>
            {cat.id && !readOnly && <button onClick={() => deleteCategory(cat.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={13} /></button>}
          </div>
          <div className="space-y-1">
            {cat.codes.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-sm" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                <span className="text-sm flex-1">{c.name}</span>
                <select disabled={readOnly} value={c.categoryId || ""} onChange={(e) => assignCategory(c.id, e.target.value)} className="text-xs font-mono border rounded-sm disabled:opacity-60" style={{ borderColor: COLORS.border }}>
                  <option value="">Ungrouped</option>
                  {project.categories.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                </select>
              </div>
            ))}
            {cat.codes.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No codes here.</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- themes ----------
function emptyChecklistLocal() { return emptyChecklist(); }
function ThemesStage({ project, setProject, readOnly }) {
  const [newName, setNewName] = useState("");
  function addTheme() {
    if (!newName.trim()) return;
    const theme = { id: uid(), name: newName.trim(), categoryIds: [], pattern: "", mechanism: "", consequenceOrTension: "", meaning: "", whyItMatters: "", conditions: "", relationToTheory: "", theoryIds: [], theoryNotes: {}, checklist: emptyChecklistLocal() };
    setProject((p) => ({ ...p, themes: [...p.themes, theme] }));
    setNewName("");
  }
  function updateTheme(id, patch) { setProject((p) => ({ ...p, themes: p.themes.map((t) => (t.id === id ? { ...t, ...patch } : t)) })); }
  function updateChecklist(themeId, key, patch) { setProject((p) => ({ ...p, themes: p.themes.map((t) => (t.id === themeId ? { ...t, checklist: { ...t.checklist, [key]: { ...t.checklist[key], ...patch } } } : t)) })); }
  function deleteTheme(id) { setProject((p) => ({ ...p, themes: p.themes.filter((t) => t.id !== id) })); }
  function toggleCategory(themeId, catId) {
    setProject((p) => ({ ...p, themes: p.themes.map((t) => { if (t.id !== themeId) return t; const has = t.categoryIds.includes(catId); return { ...t, categoryIds: has ? t.categoryIds.filter((id) => id !== catId) : [...t.categoryIds, catId] }; }) }));
  }
  function toggleTheory(themeId, theoryId) {
    setProject((p) => ({ ...p, themes: p.themes.map((t) => { if (t.id !== themeId) return t; const has = (t.theoryIds || []).includes(theoryId); return { ...t, theoryIds: has ? t.theoryIds.filter((id) => id !== theoryId) : [...(t.theoryIds || []), theoryId] }; }) }));
  }
  function updateTheoryNote(themeId, theoryId, text) {
    setProject((p) => ({ ...p, themes: p.themes.map((t) => (t.id === themeId ? { ...t, theoryNotes: { ...(t.theoryNotes || {}), [theoryId]: text } } : t)) }));
  }
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
      {readOnly && (
        <p className="text-xs rounded-sm p-2 flex items-center gap-1.5" style={{ background: "#EAF1EF", color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}>
          <Lock size={12} /> Read-only — themes can only be revised from the Group role.
        </p>
      )}
      <p className="text-xs rounded-sm p-3" style={{ background: "#F4EBD8", color: "#7A5B1E", border: `1px solid ${COLORS.gold}55` }}>Themes are interpretive, not descriptive. Do not retain a theme merely because it is interesting.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Target number of themes</label>
        <input disabled={readOnly} type="number" min="1" value={project.targetThemeCount || ""} onChange={(e) => setProject((p) => ({ ...p, targetThemeCount: e.target.value ? Number(e.target.value) : null }))}
          className="w-16 text-sm border rounded-sm px-2 py-1 disabled:opacity-60" style={{ borderColor: COLORS.border }} />
        <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>· {project.themes.length} drafted</span>
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New theme name" className="text-sm border rounded-sm px-2 py-1 flex-1" style={{ borderColor: COLORS.border }}
            onKeyDown={(e) => { if (e.key === "Enter") addTheme(); }} />
          <button onClick={addTheme} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>+ theme</button>
        </div>
      )}
      {project.themes.map((t) => (
        <div key={t.id} className="rounded-sm p-4 space-y-3" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center justify-between">
            <input disabled={readOnly} value={t.name} onChange={(e) => updateTheme(t.id, { name: e.target.value })} className="text-base font-semibold bg-transparent outline-none flex-1 disabled:opacity-80" />
            {!readOnly && <button onClick={() => deleteTheme(t.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={14} /></button>}
          </div>
          <div className="space-y-1">
            <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Supporting categories</span>
            <ChipToggle items={project.categories} activeIds={t.categoryIds} onToggle={(id) => toggleCategory(t.id, id)} disabled={readOnly} />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <ThemeField label="What pattern is present?" value={t.pattern} onChange={(v) => updateTheme(t.id, { pattern: v })} disabled={readOnly} />
            <ThemeField label="Mechanism (what drives it?)" value={t.mechanism} onChange={(v) => updateTheme(t.id, { mechanism: v })} disabled={readOnly} />
            <ThemeField label="Consequence or tension" value={t.consequenceOrTension} onChange={(v) => updateTheme(t.id, { consequenceOrTension: v })} disabled={readOnly} />
            <ThemeField label="What does it mean?" value={t.meaning} onChange={(v) => updateTheme(t.id, { meaning: v })} disabled={readOnly} />
            <ThemeField label="Why does it matter?" value={t.whyItMatters} onChange={(v) => updateTheme(t.id, { whyItMatters: v })} disabled={readOnly} />
            <ThemeField label="Under what conditions does it occur?" value={t.conditions} onChange={(v) => updateTheme(t.id, { conditions: v })} disabled={readOnly} />
            <ThemeField label="Overall relationship to theory (summary)" value={t.relationToTheory} onChange={(v) => updateTheme(t.id, { relationToTheory: v })} disabled={readOnly} />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Theories this theme relates to</span>
            <ChipToggle items={project.learningTheories} activeIds={t.theoryIds || []} onToggle={(id) => toggleTheory(t.id, id)} disabled={readOnly} />
            {(t.theoryIds || []).map((tid) => {
              const theory = project.learningTheories.find((x) => x.id === tid);
              if (!theory) return null;
              return (
                <div key={tid}>
                  <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>How does this relate to {theory.name}?</label>
                  <textarea disabled={readOnly} value={(t.theoryNotes || {})[tid] || ""} onChange={(e) => updateTheoryNote(t.id, tid, e.target.value)} rows={2}
                    className="w-full text-sm border rounded-sm px-2 py-1 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Quality check</span>
            {CHECKLIST_ITEMS.map((item) => (
              <div key={item.key} className="flex items-start gap-2">
                <input disabled={readOnly} type="checkbox" checked={t.checklist[item.key]?.checked || false} onChange={(e) => updateChecklist(t.id, item.key, { checked: e.target.checked })} className="mt-1" />
                <div className="flex-1">
                  <div className="text-xs font-mono">{item.label} <span style={{ color: COLORS.inkMuted }}>— {item.question}</span></div>
                  <input disabled={readOnly} value={t.checklist[item.key]?.note || ""} onChange={(e) => updateChecklist(t.id, item.key, { note: e.target.value })} placeholder="note / justification"
                    className="w-full text-xs border-b bg-transparent outline-none py-0.5 disabled:opacity-60" style={{ borderColor: COLORS.border }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {project.themes.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No themes drafted yet.</p>}
    </div>
  );
}
function ThemeField({ label, value, onChange, disabled }) {
  return (
    <div>
      <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>{label}</label>
      <textarea disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full text-sm border rounded-sm px-2 py-1 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
    </div>
  );
}

// ---------- negative cases ----------
function NegativeCasesStage({ project, setProject, me, readOnly }) {
  const [docId, setDocId] = useState(project.documents[0]?.id || "");
  const [selection, setSelection] = useState(null);
  const [type, setType] = useState(NEGATIVE_TYPES[0]);
  const [explanation, setExplanation] = useState("");
  const containerRef = useRef(null);
  const doc = project.documents.find((d) => d.id === docId);
  function handleMouseUp() {
    if (readOnly) return;
    const sel = window.getSelection();
    const container = containerRef.current;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !container || !doc) return;
    if (!container.contains(sel.anchorNode) || !container.contains(sel.focusNode)) return;
    const a = getOffset(container, sel.anchorNode, sel.anchorOffset);
    const f = getOffset(container, sel.focusNode, sel.focusOffset);
    const start = Math.min(a, f), end = Math.max(a, f);
    if (end <= start) return;
    setSelection({ start, end, text: doc.text.slice(start, end) });
  }
  function save() {
    if (!selection || !explanation.trim()) return;
    const nc = { id: uid(), docId, start: selection.start, end: selection.end, text: selection.text, type, explanation: explanation.trim(), addedBy: me.name, createdAt: Date.now() };
    setProject((p) => ({ ...p, negativeCases: [...p.negativeCases, nc] }));
    setSelection(null); setExplanation(""); window.getSelection()?.removeAllRanges();
  }
  function remove(id) { setProject((p) => ({ ...p, negativeCases: p.negativeCases.filter((n) => n.id !== id) })); }
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
      {readOnly && (
        <p className="text-xs rounded-sm p-2 flex items-center gap-1.5" style={{ background: "#F4EBD8", color: "#7A5B1E", border: `1px solid ${COLORS.gold}55` }}>
          <Lock size={12} /> Read-only — negative cases can only be logged from the Group role.
        </p>
      )}
      <p className="text-xs rounded-sm p-3" style={{ background: "#EAF1EF", color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}>
        Negative and discordant cases can reveal boundary conditions, differences in learner experience, design flaws, variation by experience level, or a need for adaptive rather than uniform support. Select an excerpt below and explain why it doesn't fit the emerging pattern.
      </p>
      <select value={docId} onChange={(e) => { setDocId(e.target.value); setSelection(null); }} className="text-sm border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}>
        {project.documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
      </select>
      {doc && (
        <div ref={containerRef} onMouseUp={handleMouseUp} className="text-[15px] leading-8 rounded-sm p-5" style={{ whiteSpace: "pre-wrap", background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>{doc.text}</div>
      )}
      {selection && !readOnly && (
        <div className="space-y-2 rounded-sm p-3" style={{ background: COLORS.panel, border: `1px solid ${COLORS.gold}` }}>
          <blockquote className="text-sm italic border-l-2 pl-2" style={{ borderColor: COLORS.gold }}>"{selection.text}"</blockquote>
          <select value={type} onChange={(e) => setType(e.target.value)} className="text-xs font-mono border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}>
            {NEGATIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} placeholder="Why doesn't this fit the emerging pattern?" className="w-full text-sm border rounded-sm px-2 py-1 font-serif" style={{ borderColor: COLORS.border }} />
          <div className="flex gap-2">
            <button onClick={save} className="text-xs font-mono px-3 py-1.5 rounded-sm text-white" style={{ background: COLORS.accent }}>Save case</button>
            <button onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }} className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Logged cases</h3>
        {project.negativeCases.map((nc) => (
          <div key={nc.id} className="rounded-sm p-3" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono px-2 py-0.5 rounded-sm text-white" style={{ background: COLORS.accent }}>{nc.type}</span>
              {!readOnly && <button onClick={() => remove(nc.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={13} /></button>}
            </div>
            <p className="text-sm italic mt-1.5">"{nc.text}"</p>
            <p className="text-sm mt-1">{nc.explanation}</p>
            <p className="text-xs font-mono mt-1" style={{ color: COLORS.inkMuted }}>{project.documents.find((d) => d.id === nc.docId)?.title} · {nc.addedBy}</p>
          </div>
        ))}
        {project.negativeCases.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>None logged yet.</p>}
      </div>
    </div>
  );
}

// ---------- matrices ----------
function DivergingStackedBar({ label, stats, width = 460 }) {
  const cats = stats.freqTable.map((f) => ({ ...f, num: Number(f.value) })).filter((f) => !isNaN(f.num)).sort((a, b) => a.num - b.num);
  if (cats.length < 2 || cats.length > 9) return null;
  const n = cats.length;
  const hasNeutral = n % 2 === 1;
  const midIdx = hasNeutral ? (n - 1) / 2 : null;
  const negCats = hasNeutral ? cats.slice(0, midIdx) : cats.slice(0, n / 2);
  const posCats = hasNeutral ? cats.slice(midIdx + 1) : cats.slice(n / 2);
  const neutral = hasNeutral ? cats[midIdx] : null;
  const negColors = ["#8C3E52", "#B24A73", "#C1592F", "#9C5B2E"];
  const posColors = ["#4C9A8D", "#2E7D8C", "#3E6B99", "#7A5FB0"];
  const neutralColor = "#C7C7B8";

  const segs = [];
  let cursor = hasNeutral ? -neutral.pct / 2 : 0;
  [...negCats].reverse().forEach((c, i) => {
    const start = cursor - c.pct;
    segs.push({ start, w: c.pct, color: negColors[Math.min(i, negColors.length - 1)], label: c.value, pct: c.pct });
    cursor = start;
  });
  if (hasNeutral) segs.push({ start: -neutral.pct / 2, w: neutral.pct, color: neutralColor, label: neutral.value, pct: neutral.pct });
  cursor = hasNeutral ? neutral.pct / 2 : 0;
  posCats.forEach((c, i) => {
    segs.push({ start: cursor, w: c.pct, color: posColors[Math.min(i, posColors.length - 1)], label: c.value, pct: c.pct });
    cursor += c.pct;
  });

  const scale = 100;
  const toX = (v) => ((v + scale) / (2 * scale)) * width;

  return (
    <div className="mb-3">
      <div className="text-xs font-mono mb-1" style={{ color: COLORS.inkMuted }}>{label}</div>
      <svg width={width} height={40} viewBox={`0 0 ${width} 40`}>
        <line x1={toX(0)} y1={0} x2={toX(0)} y2={30} stroke={COLORS.inkMuted} strokeWidth={1} />
        {segs.map((s, i) => <rect key={i} x={toX(s.start)} y={4} width={Math.max(0, toX(s.start + s.w) - toX(s.start))} height={20} fill={s.color} />)}
        {segs.filter((s) => s.pct >= 8).map((s, i) => (
          <text key={i} x={toX(s.start + s.w / 2)} y={18} fontSize="9" textAnchor="middle" fill="#fff" fontFamily="monospace">{s.label}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-2 text-[10px] font-mono" style={{ color: COLORS.inkMuted }}>
        {cats.map((c) => <span key={c.value}>{c.value}: {c.pct.toFixed(0)}%</span>)}
      </div>
    </div>
  );
}

function DescriptiveStatsTable({ columns, rows, showCharts }) {
  const stats = columns.map((c) => describeColumn(rows, c));
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Descriptive statistics</h4>
      <div className="overflow-x-auto">
        <table className="text-xs font-mono border-collapse w-full">
          <thead><tr>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Item</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>N</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Missing</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Median</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>IQR (Q1–Q3)</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Floor %</th>
            <th className="p-2 border text-left" style={{ borderColor: COLORS.border }}>Ceiling %</th>
          </tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.col}>
                <td className="p-2 border" style={{ borderColor: COLORS.border }}>{s.col}</td>
                <td className="p-2 border" style={{ borderColor: COLORS.border }}>{s.n}</td>
                <td className="p-2 border" style={{ borderColor: COLORS.border }}>{s.missing}</td>
                <td className="p-2 border" style={{ borderColor: COLORS.border }}>{s.isNumeric ? s.median.toFixed(2) : "—"}</td>
                <td className="p-2 border" style={{ borderColor: COLORS.border }}>{s.isNumeric ? `${s.q1.toFixed(2)}–${s.q3.toFixed(2)} (${s.iqr.toFixed(2)})` : "—"}</td>
                <td className="p-2 border" style={{ borderColor: COLORS.border, color: s.isNumeric && s.floorPct >= 15 ? "#B24A73" : COLORS.ink, fontWeight: s.isNumeric && s.floorPct >= 15 ? 700 : 400 }}>{s.isNumeric ? `${s.floorPct.toFixed(0)}%` : "—"}</td>
                <td className="p-2 border" style={{ borderColor: COLORS.border, color: s.isNumeric && s.ceilPct >= 15 ? "#B24A73" : COLORS.ink, fontWeight: s.isNumeric && s.ceilPct >= 15 ? 700 : 400 }}>{s.isNumeric ? `${s.ceilPct.toFixed(0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px]" style={{ color: COLORS.inkMuted }}>Floor/ceiling % in bold flags ≥15% of responses sitting at the observed minimum/maximum for that item.</p>
      {showCharts && (
        <div className="pt-2">
          <h4 className="text-xs font-mono uppercase tracking-wide mb-2" style={{ color: COLORS.inkMuted }}>Diverging stacked-bar charts</h4>
          {stats.filter((s) => s.isNumeric).map((s) => <DivergingStackedBar key={s.col} label={s.col} stats={s} />)}
        </div>
      )}
      <details>
        <summary className="text-xs font-mono cursor-pointer" style={{ color: COLORS.accent }}>Response frequency breakdown (number and % selecting each response)</summary>
        <div className="space-y-3 mt-2">
          {stats.map((s) => (
            <div key={s.col}>
              <div className="text-xs font-mono mb-1" style={{ color: COLORS.inkMuted }}>{s.col}</div>
              <table className="text-xs font-mono border-collapse">
                <thead><tr><th className="p-1 border" style={{ borderColor: COLORS.border }}>Response</th><th className="p-1 border" style={{ borderColor: COLORS.border }}>n</th><th className="p-1 border" style={{ borderColor: COLORS.border }}>%</th></tr></thead>
                <tbody>{s.freqTable.map((f) => (
                  <tr key={f.value}><td className="p-1 border" style={{ borderColor: COLORS.border }}>{f.value}</td><td className="p-1 border" style={{ borderColor: COLORS.border }}>{f.count}</td><td className="p-1 border" style={{ borderColor: COLORS.border }}>{f.pct.toFixed(1)}%</td></tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function PairedAnalysisSection({ quantData, setProject, readOnly }) {
  const [preCol, setPreCol] = useState(quantData.columns[0] || "");
  const [postCol, setPostCol] = useState(quantData.columns[1] || "");
  const [label, setLabel] = useState("");
  const pairs = quantData.pairs || [];
  function addPair() {
    if (!preCol || !postCol || preCol === postCol) return;
    const pair = { id: uid(), label: label.trim() || `${preCol} → ${postCol}`, preCol, postCol };
    setProject((p) => ({ ...p, quantData: { ...p.quantData, pairs: [...(p.quantData.pairs || []), pair] } }));
    setLabel("");
  }
  function removePair(id) { setProject((p) => ({ ...p, quantData: { ...p.quantData, pairs: (p.quantData.pairs || []).filter((x) => x.id !== id) } })); }
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Pre/post paired analysis</h4>
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <select value={preCol} onChange={(e) => setPreCol(e.target.value)} className="text-xs font-mono border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}>
            {quantData.columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs" style={{ color: COLORS.inkMuted }}>→</span>
          <select value={postCol} onChange={(e) => setPostCol(e.target.value)} className="text-xs font-mono border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}>
            {quantData.columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (optional)" className="text-xs border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }} />
          <button onClick={addPair} className="text-xs font-mono px-2.5 py-1 rounded-sm text-white" style={{ background: COLORS.accent }}>+ pair</button>
        </div>
      )}
      {pairs.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No pre/post pairs defined yet.</p>}
      {pairs.map((pair) => <PairResult key={pair.id} pair={pair} quantData={quantData} onRemove={() => removePair(pair.id)} readOnly={readOnly} />)}
    </div>
  );
}
function PairResult({ pair, quantData, onRemove, readOnly }) {
  const pre = quantData.rows.map((r) => toNumber(r[pair.preCol]));
  const post = quantData.rows.map((r) => toNumber(r[pair.postCol]));
  const wilcoxon = useMemo(() => wilcoxonSignedRank(pre, post), [quantData, pair]);
  const change = useMemo(() => pairedChangeTable(quantData.rows.map((r) => r[pair.preCol]), quantData.rows.map((r) => r[pair.postCol])), [quantData, pair]);
  const ordinal = useMemo(() => fitOrdinalLogistic(pre, post), [quantData, pair]);
  return (
    <div className="rounded-sm p-3 space-y-3" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{pair.label}</span>
        {!readOnly && <button onClick={onRemove} style={{ color: COLORS.inkMuted }}><Trash2 size={13} /></button>}
      </div>
      <div>
        <div className="text-xs font-mono mb-1" style={{ color: COLORS.inkMuted }}>Response-category change ({pair.preCol} → {pair.postCol})</div>
        <div className="overflow-x-auto">
          <table className="text-xs font-mono border-collapse">
            <thead><tr><th className="p-1 border" style={{ borderColor: COLORS.border }}></th>{change.cats.map((c) => <th key={c} className="p-1 border" style={{ borderColor: COLORS.border }}>{c}</th>)}</tr></thead>
            <tbody>{change.cats.map((r) => (
              <tr key={r}><td className="p-1 border font-semibold" style={{ borderColor: COLORS.border }}>{r}</td>{change.cats.map((c) => <td key={c} className="p-1 border text-center" style={{ borderColor: COLORS.border }}>{change.table[r][c]}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {wilcoxon ? (
        <div className="text-xs font-mono space-y-0.5">
          <div className="font-semibold" style={{ color: COLORS.ink }}>Wilcoxon signed-rank test</div>
          <div>n = {wilcoxon.n} (non-zero differences), W = {wilcoxon.W.toFixed(1)}, z = {wilcoxon.z.toFixed(2)}, p = {wilcoxon.p < 0.001 ? "<0.001" : wilcoxon.p.toFixed(3)}</div>
          <div>Effect size (matched-pairs rank-biserial, r) = {wilcoxon.effectR.toFixed(2)}</div>
        </div>
      ) : <p className="text-xs" style={{ color: COLORS.inkMuted }}>Not enough paired numeric data (or no non-zero differences) for a Wilcoxon test.</p>}
      {ordinal ? (
        <div className="text-xs font-mono space-y-0.5">
          <div className="font-semibold" style={{ color: COLORS.ink }}>Ordinal logistic regression (proportional odds)</div>
          <div>Predictor: time (pre=0, post=1). OR = {ordinal.oddsRatio.toFixed(2)}, 95% CI [{isNaN(ordinal.ciLow) ? "—" : ordinal.ciLow.toFixed(2)}, {isNaN(ordinal.ciHigh) ? "—" : ordinal.ciHigh.toFixed(2)}], p = {isNaN(ordinal.p) ? "—" : (ordinal.p < 0.001 ? "<0.001" : ordinal.p.toFixed(3))}</div>
          <div style={{ color: COLORS.inkMuted }}>Numerical MLE, exploratory — confirm in dedicated stats software before publication.</div>
        </div>
      ) : <p className="text-xs" style={{ color: COLORS.inkMuted }}>Not enough data to fit an ordinal regression model.</p>}
    </div>
  );
}

function QuoteChecklist({ candidates, activeIds, onToggle, disabled }) {
  return (
    <div className="space-y-1">
      {candidates.map((k) => (
        <label key={k.id} className="flex items-start gap-2 text-sm">
          <input type="checkbox" disabled={disabled} checked={activeIds.includes(k.id)} onChange={() => onToggle(k.id)} className="mt-1" />
          <span className="italic">"{k.text}"</span>
        </label>
      ))}
      {candidates.length === 0 && <span className="text-xs" style={{ color: COLORS.inkMuted }}>No coded excerpts available yet.</span>}
    </div>
  );
}

function IndividualResponseMatrix({ project, setProject, readOnly }) {
  const participantDocs = project.documents.filter((d) => d.documentType !== "group");
  function rowFor(docId) {
    return (project.individualMatrix || []).find((r) => r.docId === docId) || { docId, componentNotes: {}, helpful: "", limiting: "", evidence: "", futureApplication: "", contradictions: "", memo: "", quoteIds: [] };
  }
  function updateRow(docId, patch) {
    setProject((p) => {
      const exists = (p.individualMatrix || []).some((r) => r.docId === docId);
      const individualMatrix = exists ? p.individualMatrix.map((r) => (r.docId === docId ? { ...r, ...patch } : r)) : [...(p.individualMatrix || []), { ...rowFor(docId), ...patch }];
      return { ...p, individualMatrix };
    });
  }
  function toggleQuote(docId, id) {
    const r = rowFor(docId);
    const has = r.quoteIds.includes(id);
    updateRow(docId, { quoteIds: has ? r.quoteIds.filter((x) => x !== id) : [...r.quoteIds, id] });
  }
  function exportCSV() {
    const header = ["Participant", "Helpful", "Limiting", "Evidence of learning", "Future application", "Contradictions", "Memo"];
    const rows = participantDocs.map((d) => { const r = rowFor(d.id); return [d.title, r.helpful, r.limiting, r.evidence, r.futureApplication, r.contradictions, r.memo].map(csvEscape).join(","); });
    download("individual_response_matrix.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>1. Individual Response Framework Matrix</h3>
        <button onClick={exportCSV} className="text-xs font-mono px-2.5 py-1 rounded-sm flex items-center gap-1" style={{ border: `1px solid ${COLORS.border}` }}><Download size={12} /> export CSV</button>
      </div>
      <p className="text-xs rounded-sm p-2" style={{ background: "#EAF1EF", color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}>
        Summarize rather than reproduce entire responses. Preserve links to the original text. Do not force every response into a theoretical category. Distinguish satisfaction, confidence, usability, and learning. Record negative, mixed, and contradictory experiences.
      </p>
      {participantDocs.map((doc) => {
        const r = rowFor(doc.id);
        const candidateQuotes = project.codings.filter((k) => k.docId === doc.id);
        return (
          <div key={doc.id} className="rounded-sm p-4 space-y-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <h4 className="text-sm font-semibold">{doc.title}</h4>
            {project.components.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Experience with each component</span>
                {project.components.map((c) => (
                  <div key={c.id}>
                    <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>{c.name}</label>
                    <textarea disabled={readOnly} value={r.componentNotes?.[c.id] || ""} onChange={(e) => updateRow(doc.id, { componentNotes: { ...r.componentNotes, [c.id]: e.target.value } })} rows={2}
                      className="w-full text-sm border rounded-sm px-2 py-1 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
                  </div>
                ))}
              </div>
            )}
            <ThemeField label="Helpful features" value={r.helpful} onChange={(v) => updateRow(doc.id, { helpful: v })} disabled={readOnly} />
            <ThemeField label="Limiting or frustrating features" value={r.limiting} onChange={(v) => updateRow(doc.id, { limiting: v })} disabled={readOnly} />
            <ThemeField label="Evidence of learning, reflection, or change (engagement, reflection, revised understanding, recognizing a gap, questioning an assumption, an alternative perspective, intended application, perspective reconsideration)" value={r.evidence} onChange={(v) => updateRow(doc.id, { evidence: v })} disabled={readOnly} />
            <ThemeField label="Intended future application" value={r.futureApplication} onChange={(v) => updateRow(doc.id, { futureApplication: v })} disabled={readOnly} />
            <ThemeField label="Important contradictions or tensions" value={r.contradictions} onChange={(v) => updateRow(doc.id, { contradictions: v })} disabled={readOnly} />
            <ThemeField label="Brief analytic memo" value={r.memo} onChange={(v) => updateRow(doc.id, { memo: v })} disabled={readOnly} />
            <div>
              <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Linked quotations</span>
              <QuoteChecklist candidates={candidateQuotes} activeIds={r.quoteIds} onToggle={(id) => toggleQuote(doc.id, id)} disabled={readOnly} />
            </div>
          </div>
        );
      })}
      {participantDocs.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No individually-identified documents yet.</p>}
    </div>
  );
}

function GroupDiscussionMatrix({ project, setProject, readOnly }) {
  const rows = project.groupMatrix || [];
  const groupCodings = project.codings.filter((k) => project.documents.find((d) => d.id === k.docId)?.documentType === "group");
  function addRow() {
    setProject((p) => ({ ...p, groupMatrix: [...(p.groupMatrix || []), { id: uid(), topic: "New topic", sharedView: "", variation: "", minorityView: "", componentId: null, learningChange: "", interpretation: "", quoteIds: [] }] }));
  }
  function updateRow(id, patch) { setProject((p) => ({ ...p, groupMatrix: p.groupMatrix.map((r) => (r.id === id ? { ...r, ...patch } : r)) })); }
  function deleteRow(id) { setProject((p) => ({ ...p, groupMatrix: p.groupMatrix.filter((r) => r.id !== id) })); }
  function toggleQuote(id, quoteId) {
    const r = rows.find((x) => x.id === id);
    const has = r.quoteIds.includes(quoteId);
    updateRow(id, { quoteIds: has ? r.quoteIds.filter((x) => x !== quoteId) : [...r.quoteIds, quoteId] });
  }
  function exportCSV() {
    const header = ["Topic", "Shared/dominant view", "Variation/disagreement", "Minority/negative perspective", "Learning/change", "Analytic interpretation"];
    const csvRows = rows.map((r) => [r.topic, r.sharedView, r.variation, r.minorityView, r.learningChange, r.interpretation].map(csvEscape).join(","));
    download("group_discussion_matrix.csv", [header.join(","), ...csvRows].join("\n"), "text/csv");
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>2. Group Discussion Matrix</h3>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="text-xs font-mono px-2.5 py-1 rounded-sm flex items-center gap-1" style={{ border: `1px solid ${COLORS.border}` }}><Download size={12} /> export CSV</button>
          {!readOnly && <button onClick={addRow} className="text-xs font-mono px-2.5 py-1 rounded-sm text-white flex items-center gap-1" style={{ background: COLORS.accent }}><Plus size={12} /> topic</button>}
        </div>
      </div>
      <p className="text-xs rounded-sm p-2" style={{ background: "#EAF1EF", color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}>
        Analyze how participants interacted, not only what they said. Do not treat each comment as an independent observation. Preserve disagreement and minority views. Do not use frequency alone to determine importance. Distinguish individual opinions from views developed through group interaction.
      </p>
      {rows.map((r) => (
        <div key={r.id} className="rounded-sm p-4 space-y-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center justify-between">
            <input disabled={readOnly} value={r.topic} onChange={(e) => updateRow(r.id, { topic: e.target.value })} className="text-sm font-semibold bg-transparent outline-none flex-1 disabled:opacity-80" />
            {!readOnly && <button onClick={() => deleteRow(r.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={13} /></button>}
          </div>
          {project.components.length > 0 && (
            <select disabled={readOnly} value={r.componentId || ""} onChange={(e) => updateRow(r.id, { componentId: e.target.value || null })} className="text-xs font-mono border rounded-sm px-2 py-1 disabled:opacity-60" style={{ borderColor: COLORS.border }}>
              <option value="">No specific component</option>
              {project.components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <ThemeField label="Shared or dominant view" value={r.sharedView} onChange={(v) => updateRow(r.id, { sharedView: v })} disabled={readOnly} />
          <ThemeField label="Variation or disagreement" value={r.variation} onChange={(v) => updateRow(r.id, { variation: v })} disabled={readOnly} />
          <ThemeField label="Minority or negative perspective" value={r.minorityView} onChange={(v) => updateRow(r.id, { minorityView: v })} disabled={readOnly} />
          <ThemeField label="Learning or change described (agreement, disagreement, elaboration, challenge, perspective comparison, shift in direction, normalization of uncertainty, collective recommendation)" value={r.learningChange} onChange={(v) => updateRow(r.id, { learningChange: v })} disabled={readOnly} />
          <ThemeField label="Analytic interpretation" value={r.interpretation} onChange={(v) => updateRow(r.id, { interpretation: v })} disabled={readOnly} />
          <div>
            <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Representative quotations</span>
            <QuoteChecklist candidates={groupCodings} activeIds={r.quoteIds} onToggle={(id) => toggleQuote(r.id, id)} disabled={readOnly} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No topics logged yet.</p>}
    </div>
  );
}

function JointDisplayMatrix({ project, setProject, readOnly }) {
  const rows = project.jointDisplay || [];
  const allCodings = project.codings;
  const quantCols = project.quantData?.columns || [];
  function addRow() {
    setProject((p) => ({ ...p, jointDisplay: [...(p.jointDisplay || []), { id: uid(), finding: "New finding", quantColumn: "", quantEvidenceText: "", individualEvidence: "", groupEvidence: "", componentId: null, relationship: "", theoryInterpretation: "", negativeCase: "", metaInference: "" }] }));
  }
  function updateRow(id, patch) { setProject((p) => ({ ...p, jointDisplay: p.jointDisplay.map((r) => (r.id === id ? { ...r, ...patch } : r)) })); }
  function deleteRow(id) { setProject((p) => ({ ...p, jointDisplay: p.jointDisplay.filter((r) => r.id !== id) })); }
  function insertStats(rowId, col) {
    if (!col || !project.quantData?.rows?.length) { updateRow(rowId, { quantColumn: col }); return; }
    const s = describeColumn(project.quantData.rows, col);
    const text = s.isNumeric
      ? `${col}: n=${s.n}, median=${s.median.toFixed(1)}, IQR=${s.q1.toFixed(1)}–${s.q3.toFixed(1)}, missing=${s.missing}`
      : `${col}: n=${s.n}, missing=${s.missing}`;
    updateRow(rowId, { quantColumn: col, quantEvidenceText: text });
  }
  function exportCSV() {
    const header = ["Integrated finding", "Quantitative evidence", "Individual qualitative evidence", "Group-discussion evidence", "Relationship", "Theory interpretation", "Negative/boundary case", "Meta-inference"];
    const csvRows = rows.map((r) => [r.finding, r.quantEvidenceText, r.individualEvidence, r.groupEvidence, r.relationship, r.theoryInterpretation, r.negativeCase, r.metaInference].map(csvEscape).join(","));
    download("mixed_methods_joint_display.csv", [header.join(","), ...csvRows].join("\n"), "text/csv");
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>3. Mixed Methods Joint Display</h3>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="text-xs font-mono px-2.5 py-1 rounded-sm flex items-center gap-1" style={{ border: `1px solid ${COLORS.border}` }}><Download size={12} /> export CSV</button>
          {!readOnly && <button onClick={addRow} className="text-xs font-mono px-2.5 py-1 rounded-sm text-white flex items-center gap-1" style={{ background: COLORS.accent }}><Plus size={12} /> finding</button>}
        </div>
      </div>
      <p className="text-xs rounded-sm p-2" style={{ background: "#EAF1EF", color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}>
        Organize rows around interpretive findings, not data sources. Do not merely place findings side by side — explain how they relate. Include contradictions and negative cases. Use theory to support interpretation rather than force classification. Avoid causal or performance claims unless the design and data support them.
      </p>
      {rows.map((r) => {
        const candidateQuotes = allCodings;
        return (
          <div key={r.id} className="rounded-sm p-4 space-y-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between">
              <input disabled={readOnly} value={r.finding} onChange={(e) => updateRow(r.id, { finding: e.target.value })} className="text-sm font-semibold bg-transparent outline-none flex-1 disabled:opacity-80" />
              {!readOnly && <button onClick={() => deleteRow(r.id)} style={{ color: COLORS.inkMuted }}><Trash2 size={13} /></button>}
            </div>
            {project.components.length > 0 && (
              <select disabled={readOnly} value={r.componentId || ""} onChange={(e) => updateRow(r.id, { componentId: e.target.value || null })} className="text-xs font-mono border rounded-sm px-2 py-1 disabled:opacity-60" style={{ borderColor: COLORS.border }}>
                <option value="">No specific component / context factor</option>
                {project.components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <div className="space-y-1">
              <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Quantitative evidence</span>
              {quantCols.length > 0 && !readOnly && (
                <div className="flex items-center gap-2">
                  <select value={r.quantColumn || ""} onChange={(e) => insertStats(r.id, e.target.value)} className="text-xs font-mono border rounded-sm px-2 py-1" style={{ borderColor: COLORS.border }}>
                    <option value="">Pull stats from item…</option>
                    {quantCols.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <textarea disabled={readOnly} value={r.quantEvidenceText} onChange={(e) => updateRow(r.id, { quantEvidenceText: e.target.value })} rows={2} placeholder="Item/construct, N, distribution, median/IQR, or other relevant result"
                className="w-full text-sm border rounded-sm px-2 py-1 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
            </div>
            <ThemeField label="Individual qualitative evidence" value={r.individualEvidence} onChange={(v) => updateRow(r.id, { individualEvidence: v })} disabled={readOnly} />
            <ThemeField label="Group-discussion evidence" value={r.groupEvidence} onChange={(v) => updateRow(r.id, { groupEvidence: v })} disabled={readOnly} />
            <div>
              <label className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Relationship between data sources</label>
              <div className="flex flex-wrap gap-1.5">
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <button key={opt} disabled={readOnly} onClick={() => updateRow(r.id, { relationship: opt })} className="text-xs font-mono px-2 py-1 rounded-sm disabled:opacity-60"
                    style={r.relationship === opt ? { background: COLORS.accent, color: "#fff" } : { border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}>{opt}</button>
                ))}
              </div>
            </div>
            <ThemeField label="Theory-informed interpretation" value={r.theoryInterpretation} onChange={(v) => updateRow(r.id, { theoryInterpretation: v })} disabled={readOnly} />
            <ThemeField label="Negative or boundary case" value={r.negativeCase} onChange={(v) => updateRow(r.id, { negativeCase: v })} disabled={readOnly} />
            <div>
              <label className="text-xs font-mono font-semibold" style={{ color: COLORS.gold }}>Meta-inference — what can be concluded only by considering both sources together</label>
              <textarea disabled={readOnly} value={r.metaInference} onChange={(e) => updateRow(r.id, { metaInference: e.target.value })} rows={2}
                className="w-full text-sm border rounded-sm px-2 py-1 font-serif disabled:opacity-60" style={{ borderColor: COLORS.gold }} />
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>No integrated findings yet.</p>}
    </div>
  );
}

function MatricesStage({ project, setProject, readOnly }) {
  const usingUploadedQuant = project.quantData && project.quantData.rows && project.quantData.rows.length > 0;
  function exportQuant() {
    const header = project.quantData.columns;
    const rows = project.quantData.rows.map((r) => header.map((c) => csvEscape(r[c])).join(","));
    download("quantitative_data.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  }
  const domains = project.quantData?.domains || [];
  const domainCols = new Set(domains.flatMap((d) => d.columnKeys));
  const otherCols = (project.quantData?.columns || []).filter((c) => !domainCols.has(c));

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-10">
      <IndividualResponseMatrix project={project} setProject={setProject} readOnly={readOnly} />
      {project.documents.some((d) => d.documentType === "group") && (
        <GroupDiscussionMatrix project={project} setProject={setProject} readOnly={readOnly} />
      )}
      {project.studyType === "mixed" && <JointDisplayMatrix project={project} setProject={setProject} readOnly={readOnly} />}

      {usingUploadedQuant && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono uppercase tracking-wide" style={{ color: COLORS.inkMuted }}>Quantitative summary</h3>
            <button onClick={exportQuant} className="text-xs font-mono px-3 py-1.5 rounded-sm flex items-center gap-1.5" style={{ border: `1px solid ${COLORS.border}` }}><Download size={13} /> export raw data (CSV)</button>
          </div>
          {project.quantData.description && <p className="text-xs" style={{ color: COLORS.inkMuted }}>{project.quantData.description}</p>}
          {domains.length > 0 ? (
            <>
              {domains.map((d) => (
                <div key={d.id} className="space-y-2">
                  <h4 className="text-sm font-semibold">{d.name}</h4>
                  <DescriptiveStatsTable columns={d.columnKeys} rows={project.quantData.rows} showCharts={project.quantData.showCharts} />
                </div>
              ))}
              {otherCols.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Other items</h4>
                  <DescriptiveStatsTable columns={otherCols} rows={project.quantData.rows} showCharts={project.quantData.showCharts} />
                </div>
              )}
            </>
          ) : (
            <DescriptiveStatsTable columns={project.quantData.columns} rows={project.quantData.rows} showCharts={project.quantData.showCharts} />
          )}
          <p className="text-xs" style={{ color: COLORS.inkMuted }}>Statistics are exploratory — appropriate for small pilot samples common in simulation education research. Treat p-values and confidence intervals as indicative, not confirmatory, especially below n=10.</p>
          <PairedAnalysisSection quantData={project.quantData} setProject={setProject} readOnly={readOnly} />
        </section>
      )}
      {!usingUploadedQuant && project.studyType === "mixed" && (
        <p className="text-xs" style={{ color: COLORS.inkMuted }}>No quantitative dataset uploaded yet — add one in Setup for descriptive and paired statistics here.</p>
      )}
    </div>
  );
}

// ---------- theme summary ----------
function emptySummary(themeId) {
  return { themeId, definition: "", centralClaim: "", mainCodeIds: [], typicalExperiences: "", contradictoryCases: "", relationToTheory: "", relationToQuant: "", quoteIds: [], practicalImplication: "" };
}
function ThemeSummaryStage({ project, setProject, readOnly }) {
  function summaryFor(themeId) { return project.themeSummaries.find((s) => s.themeId === themeId) || emptySummary(themeId); }
  function updateSummary(themeId, patch) {
    if (readOnly) return;
    setProject((p) => {
      const exists = p.themeSummaries.some((s) => s.themeId === themeId);
      const themeSummaries = exists ? p.themeSummaries.map((s) => (s.themeId === themeId ? { ...s, ...patch } : s)) : [...p.themeSummaries, { ...emptySummary(themeId), ...patch }];
      return { ...p, themeSummaries };
    });
  }
  function toggleArrayField(themeId, field, id) {
    if (readOnly) return;
    const s = summaryFor(themeId);
    const has = s[field].includes(id);
    updateSummary(themeId, { [field]: has ? s[field].filter((x) => x !== id) : [...s[field], id] });
  }
  function exportTable() {
    const header = ["Theme", "Definition", "Central claim", "Main supporting codes", "Typical participant experiences", "Contradictory cases", "Relationship to learning theory", "Relationship to quantitative findings", "Representative quotations", "Practical implication"];
    const rows = project.themes.map((t) => {
      const s = summaryFor(t.id);
      const codeNames = s.mainCodeIds.map((id) => project.codes.find((c) => c.id === id)?.name).filter(Boolean).join("; ");
      const quotes = s.quoteIds.map((id) => { const k = project.codings.find((k) => k.id === id); return k ? `"${k.text}"` : ""; }).filter(Boolean).join(" / ");
      return [t.name, s.definition, s.centralClaim, codeNames, s.typicalExperiences, s.contradictoryCases, s.relationToTheory, s.relationToQuant, quotes, s.practicalImplication].map(csvEscape).join(",");
    });
    download("theme_summary_table.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  }
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
      {readOnly && (
        <p className="text-xs rounded-sm p-2 flex items-center gap-1.5" style={{ background: "#F4EBD8", color: "#7A5B1E", border: `1px solid ${COLORS.gold}55` }}>
          <Lock size={12} /> Read-only — theme summaries can only be revised from the Group role.
        </p>
      )}
      <div className="flex justify-end">
        <button onClick={exportTable} className="text-xs font-mono px-3 py-1.5 rounded-sm flex items-center gap-1.5" style={{ border: `1px solid ${COLORS.border}` }}><Download size={13} /> export table (CSV)</button>
      </div>
      {project.themes.map((t) => {
        const s = summaryFor(t.id);
        const relevantCodes = project.codes.filter((c) => t.categoryIds.includes(c.categoryId));
        const candidateQuotes = project.codings.filter((k) => relevantCodes.some((c) => c.id === k.codeId));
        return (
          <div key={t.id} className="rounded-sm p-4 space-y-3" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <h3 className="text-base font-semibold">{t.name}</h3>
            <ThemeField label="Theme definition" value={s.definition} onChange={(v) => updateSummary(t.id, { definition: v })} disabled={readOnly} />
            <ThemeField label="Central interpretive claim" value={s.centralClaim} onChange={(v) => updateSummary(t.id, { centralClaim: v })} disabled={readOnly} />
            <div>
              <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Main supporting codes</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {relevantCodes.map((c) => {
                  const active = s.mainCodeIds.includes(c.id);
                  return <button key={c.id} disabled={readOnly} onClick={() => toggleArrayField(t.id, "mainCodeIds", c.id)} className="text-xs font-mono px-2 py-1 rounded-sm disabled:opacity-60" style={active ? { background: c.color, color: "#fff" } : { border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}>{c.name}</button>;
                })}
                {relevantCodes.length === 0 && <span className="text-xs" style={{ color: COLORS.inkMuted }}>No codes linked to this theme's categories yet.</span>}
              </div>
            </div>
            <ThemeField label="Typical participant experiences" value={s.typicalExperiences} onChange={(v) => updateSummary(t.id, { typicalExperiences: v })} disabled={readOnly} />
            <ThemeField label="Contradictory / negative cases" value={s.contradictoryCases} onChange={(v) => updateSummary(t.id, { contradictoryCases: v })} disabled={readOnly} />
            <ThemeField label="Relationship to the learning theory" value={s.relationToTheory} onChange={(v) => updateSummary(t.id, { relationToTheory: v })} disabled={readOnly} />
            <ThemeField label="Relationship to quantitative findings" value={s.relationToQuant} onChange={(v) => updateSummary(t.id, { relationToQuant: v })} disabled={readOnly} />
            <div>
              <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>Representative quotations (pick 2–3)</span>
              <div className="space-y-1 mt-1">
                {candidateQuotes.map((k) => {
                  const active = s.quoteIds.includes(k.id);
                  const sourceDoc = project.documents.find((d) => d.id === k.docId);
                  const sourceLabel = sourceDoc?.documentType === "group" ? `${sourceDoc.title} — ${k.speaker || "unidentified speaker"}` : sourceDoc?.title;
                  return (
                    <label key={k.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" disabled={readOnly} checked={active} onChange={() => toggleArrayField(t.id, "quoteIds", k.id)} className="mt-1" />
                      <span><span className="italic">"{k.text}"</span> <span className="text-xs font-mono" style={{ color: COLORS.inkMuted }}>— {sourceLabel}</span></span>
                    </label>
                  );
                })}
                {candidateQuotes.length === 0 && <span className="text-xs" style={{ color: COLORS.inkMuted }}>No coded excerpts under this theme's categories yet.</span>}
              </div>
            </div>
            <ThemeField label="Practical implication for simulation design" value={s.practicalImplication} onChange={(v) => updateSummary(t.id, { practicalImplication: v })} disabled={readOnly} />
          </div>
        );
      })}
      {project.themes.length === 0 && <p className="text-xs" style={{ color: COLORS.inkMuted }}>Draft at least one theme first.</p>}
    </div>
  );
}

// ---------- meta-inferences ----------
function MetaInferencesStage({ project, setProject, readOnly }) {
  const mi = project.metaInferences || emptyMetaInferences();
  function update(key, patch) {
    if (readOnly) return;
    setProject((p) => ({ ...p, metaInferences: { ...emptyMetaInferences(), ...p.metaInferences, [key]: { ...(p.metaInferences?.[key] || { text: "", themeIds: [] }), ...patch } } }));
  }
  function updateOverall(v) {
    if (readOnly) return;
    setProject((p) => ({ ...p, metaInferences: { ...emptyMetaInferences(), ...p.metaInferences, overallStatement: v } }));
  }
  function toggleTheme(key, themeId) {
    const cur = mi[key]?.themeIds || [];
    const has = cur.includes(themeId);
    update(key, { themeIds: has ? cur.filter((id) => id !== themeId) : [...cur, themeId] });
  }
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
      {readOnly && (
        <p className="text-xs rounded-sm p-2 flex items-center gap-1.5" style={{ background: "#F4EBD8", color: "#7A5B1E", border: `1px solid ${COLORS.gold}55` }}>
          <Lock size={12} /> Read-only — meta-inferences can only be revised from the Group role.
        </p>
      )}
      <p className="text-xs rounded-sm p-3" style={{ background: "#EAF1EF", color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}>
        Integrate the quantitative and qualitative strands. For each lens below, note what you're seeing and which themes it relates to.
      </p>
      {META_TYPES.map((t) => (
        <div key={t.key} className="rounded-sm p-4 space-y-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
          <h3 className="text-base font-semibold">{t.label}</h3>
          <p className="text-xs" style={{ color: COLORS.inkMuted }}>{t.question}</p>
          <textarea disabled={readOnly} value={mi[t.key]?.text || ""} onChange={(e) => update(t.key, { text: e.target.value })} rows={3}
            className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
          <ChipToggle items={project.themes} activeIds={mi[t.key]?.themeIds || []} onToggle={(id) => toggleTheme(t.key, id)} disabled={readOnly} />
        </div>
      ))}
      <div className="rounded-sm p-4 space-y-2" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
        <h3 className="text-base font-semibold">Overall integrated statement</h3>
        <textarea disabled={readOnly} value={mi.overallStatement || ""} onChange={(e) => updateOverall(e.target.value)} rows={3}
          className="w-full text-sm border rounded-sm px-2 py-1.5 font-serif disabled:opacity-60" style={{ borderColor: COLORS.border }} />
      </div>
    </div>
  );
}
