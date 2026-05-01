import "./styles.css";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, functions, isFirebaseConfigured } from "./firebase.js";

const WEEKDAY_OPTIONS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const CONGREGATION_VISIT_TYPE = "Congregation Visit";
const LOGIN_FUNCTION_NAME = "loginWithCongregationCode";

const MEETING_DEFINITIONS = [
  { title: "Entre semana", defaultDay: "Martes", options: WEEKDAY_OPTIONS },
  { title: "Fin de semana", defaultDay: "", options: ["", "Viernes", "Sábado", "Domingo"] },
  {
    title: "Precursores auxiliares, regulares y especiales",
    defaultDay: "Miércoles",
    options: WEEKDAY_OPTIONS,
  },
  {
    title: "Ancianos y siervos ministeriales",
    defaultDay: "Viernes",
    options: ["", "Miércoles", "Jueves", "Viernes", "Sábado"],
  },
];

const FIELD_SERVICE_DAYS = ["Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const HENRY_VISITS = [
  { day: "Miércoles", subtitle: "Estudios y pastoreos" },
  { day: "Jueves", subtitle: "Solo en la mañana" },
  { day: "Viernes", subtitle: "Estudios y pastoreos" },
];
const CAROLINA_VISITS = [
  { day: "Miércoles", subtitle: "Estudios y revisitas" },
  { day: "Jueves", subtitle: "En la mañana" },
  { day: "Viernes", subtitle: "Estudios y revisitas" },
  { day: "Miércoles", subtitle: "Estudio adicional", isExtra: true },
  { day: "Viernes", subtitle: "Estudio adicional", isExtra: true },
];
const LUNCH_DAYS = [
  { day: "Martes", time: "12:00", note: "Preguntar" },
  { day: "Miércoles", time: "12:00", note: "" },
  { day: "Jueves", time: "12:00", note: "" },
  { day: "Viernes", time: "12:00", note: "" },
  { day: "Sábado", time: "12:00", note: "" },
  { day: "Domingo", time: "12:00", note: "" },
];

let dom = {};
const activeExtras = new Set();
let mobileNavInitialized = false;
let dotTocInitialized = false;

const appState = {
  auth: null,
  db: null,
  functions: null,
  user: null,
  congregationId: null,
  congregationName: "",
  congregationDoc: null,
  activity: null,
  agendaRef: null,
  agendaDoc: null,
  agenda: buildDefaultAgenda(),
  isPreview: false,
};

let saveTimeout;

startApp();

function startApp() {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        initializeAppShell().catch(reportStartupError);
      },
      { once: true },
    );
    return;
  }

  initializeAppShell().catch(reportStartupError);
}

async function initializeAppShell() {
  dom = await waitForDom();
  bindStaticEvents();
  await bootstrap();
}

function resolveDom() {
  return {
    authScreen: document.querySelector("#authScreen"),
    agendaScreen: document.querySelector("#agendaScreen"),
    configPanel: document.querySelector("#configPanel"),
    configMessage: document.querySelector("#configMessage"),
    authMessage: document.querySelector("#authMessage"),
    appMessagePanel: document.querySelector("#appMessagePanel"),
    appMessage: document.querySelector("#appMessage"),
    loginForm: document.querySelector("#loginForm"),
    congregationNameInput: document.querySelector("#congregationNameInput"),
    congregationCodeInput: document.querySelector("#congregationCodeInput"),
    loginButton: document.querySelector("#loginButton"),
    logoutButton: document.querySelector("#logoutButton"),
    clearDataButton: document.querySelector("#clearDataButton"),
    downloadButton: document.querySelector("#downloadButton"),
    congregationInput: document.querySelector("#congregationInput"),
    dateInput: document.querySelector("#dateInput"),
    meetingsList: document.querySelector("#meetingsList"),
    fieldServiceList: document.querySelector("#fieldServiceList"),
    henryList: document.querySelector("#henryList"),
    carolinaList: document.querySelector("#carolinaList"),
    lunchList: document.querySelector("#lunchList"),
    saveStatus: document.querySelector("#saveStatus"),
    completionBar: document.querySelector("#completionBar"),
    summaryCongregation: document.querySelector("#summaryCongregation"),
    summaryDate: document.querySelector("#summaryDate"),
    summaryProgress: document.querySelector("#summaryProgress"),
    userEmail: document.querySelector("#userEmail"),
    meetingTemplate: document.querySelector("#meetingTemplate"),
    fieldServiceTemplate: document.querySelector("#fieldServiceTemplate"),
    visitTemplate: document.querySelector("#visitTemplate"),
    lunchTemplate: document.querySelector("#lunchTemplate"),
  };
}

function bindStaticEvents() {
  const missing = [
    ["loginForm", dom.loginForm],
    ["congregationNameInput", dom.congregationNameInput],
    ["congregationCodeInput", dom.congregationCodeInput],
    ["logoutButton", dom.logoutButton],
    ["clearDataButton", dom.clearDataButton],
    ["downloadButton", dom.downloadButton],
  ]
    .filter(([, element]) => !element)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`No se pudieron enlazar los eventos iniciales. Faltan: ${missing.join(", ")}.`);
  }

  dom.loginForm.addEventListener("submit", handleCongregationLogin);
  dom.logoutButton.addEventListener("click", handleLogout);
  dom.clearDataButton.addEventListener("click", handleResetAgenda);
  dom.downloadButton.addEventListener("click", downloadBackup);
}

async function waitForDom() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const resolved = resolveDom();
    if (
      resolved.loginForm &&
      resolved.congregationNameInput &&
      resolved.congregationCodeInput &&
      resolved.logoutButton &&
      resolved.clearDataButton &&
      resolved.downloadButton
    ) {
      return resolved;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  return resolveDom();
}

function reportStartupError(error) {
  console.error(error);
  document.body.innerHTML = `
    <div style="padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#2d3435">
      <h1 style="margin:0 0 12px;font-size:24px">No se pudo iniciar la agenda</h1>
      <p style="margin:0 0 12px">La aplicación no encontró todos los elementos necesarios para arrancar.</p>
      <p style="margin:0">Haga una recarga completa del navegador. Si el problema sigue, compártame este mensaje: ${escapeHtml(error.message || "Error desconocido")}.</p>
    </div>
  `;
}

async function bootstrap() {
  if (!isFirebaseConfigured || !auth || !db || !functions) {
    showConfigError();
    return;
  }

  appState.auth = auth;
  appState.db = db;
  appState.functions = functions;

  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "true" || params.get("admin") === "true") {
    loadAdminPreviewMode();
    return;
  }

  await setPersistence(auth, browserLocalPersistence);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      clearSessionState();
      showAuthScreen("Escriba la congregación y su número para abrir la agenda.");
      return;
    }

    appState.user = user;
    dom.userEmail.textContent = "Acceso de congregación";
    await loadAgendaForCongregation(user);
  });
}

function showConfigError() {
  dom.configPanel.classList.remove("hidden");
  dom.authScreen.classList.remove("hidden");
  setAuthBusy(false);
  dom.authMessage.textContent =
    "La aplicación necesita la configuración de Firebase y Functions antes de poder abrir la agenda.";
}

async function handleCongregationLogin(event) {
  event.preventDefault();

  if (!appState.auth || !appState.functions) {
    showAuthScreen("Todavía falta configurar Firebase en este proyecto.");
    return;
  }

  const congregationName = dom.congregationNameInput.value.trim();
  const code = dom.congregationCodeInput.value.trim();

  if (!congregationName || !code) {
    showAuthScreen("Escriba la congregación y el número para continuar.");
    return;
  }

  setAuthBusy(true);
  showAuthScreen("Validando acceso...");

  try {
    const loginWithCongregationCode = httpsCallable(appState.functions, LOGIN_FUNCTION_NAME);
    const response = await loginWithCongregationCode({
      congregationName,
      code,
    });

    await signInWithCustomToken(appState.auth, response.data.token);
    dom.congregationCodeInput.value = "";
  } catch (error) {
    showAuthScreen(normalizeFirebaseError(error, "No se pudo validar la congregación y el número."));
  } finally {
    setAuthBusy(false);
  }
}

async function loadAgendaForCongregation(user) {
  showAgendaLoading("Buscando la agenda de su congregación...");

  try {
    const tokenResult = await user.getIdTokenResult();
    const congregationId = tokenResult.claims.congregation_id;
    const rawName = tokenResult.claims.congregation_name || "";
    const congregationName = rawName.split("-")[0].trim();

    if (!congregationId) {
      throw new Error("La sesión actual no tiene `congregation_id` en el token.");
    }

    const congregationDoc = await fetchCongregation(congregationId);
    const activity = await fetchTargetActivity(congregationId);

    if (!activity) {
      throw new Error("No hay visitas de congregación disponibles para esta congregación.");
    }

    const agendaDoc = await ensureAgendaDocument(activity, congregationDoc?.name || congregationName);
    const mergedAgenda = mergeAgendaWithDefaults(agendaDoc.agendaData, buildDefaultAgenda(activity, congregationDoc));

    appState.congregationId = congregationId;
    const docName = congregationDoc?.name || congregationName;
    appState.congregationName = docName.split("-")[0].trim();
    appState.congregationDoc = congregationDoc;
    appState.activity = activity;
    appState.agendaRef = doc(appState.db, "agendas", activity.id);
    appState.agendaDoc = agendaDoc;
    appState.agenda = mergedAgenda;

    renderAgenda();
    hideAppMessage();
    showAgendaScreen();
    setSaveStatus("Agenda cargada");
  } catch (error) {
    clearSessionState(false);
    appState.agenda = buildDefaultAgenda();
    showAgendaMessage(error.message || "No pudimos cargar la agenda.");
    showAgendaScreen();
    renderAgenda();
    setSaveStatus("Acceso pendiente");
  }
}

function loadAdminPreviewMode() {
  appState.isPreview = true;
  appState.congregationName = "Congregación de Prueba";
  appState.agenda = buildDefaultAgenda();

  // Populate some dummy data for the UI check
  appState.agenda.congregation = "Prueba - Ciudad Central";
  appState.agenda.date = new Date().toISOString().split("T")[0];

  appState.agenda.meetings[0].time = "19:00";
  appState.agenda.meetings[0].place = "Salón del Reino A";
  appState.agenda.meetings[1].time = "10:00";
  appState.agenda.meetings[1].place = "Salón del Reino B";

  appState.agenda.fieldService[0].am = "09:00";
  appState.agenda.fieldService[0].amPlace = "Parque Principal";

  appState.agenda.lunches[0].family = "Familia Pérez";
  appState.agenda.lunches[0].contact = "Calle 10 #5-20";
  appState.agenda.lunches[0].time = "12:30";

  renderAgenda();
  dom.userEmail.textContent = "Modo Vista Previa (Admin)";
  showAgendaScreen();
  setSaveStatus("Vista previa - Guardado desactivado");
}

async function fetchCongregation(congregationId) {
  const congregationRef = doc(appState.db, "congregations", congregationId);
  const snapshot = await getDoc(congregationRef);

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

async function fetchTargetActivity(congregationId) {
  const activitiesRef = collection(appState.db, "activities");
  const snapshot = await getDocs(
    query(
      activitiesRef,
      where("congregation_id", "==", congregationId),
      where("type", "==", CONGREGATION_VISIT_TYPE),
    ),
  );

  const activities = snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((entry) => toDate(entry.week_start))
    .sort((left, right) => toDate(left.week_start) - toDate(right.week_start));

  if (!activities.length) {
    return null;
  }

  const today = startOfDay(new Date());
  const nextVisit = activities.find((entry) => startOfDay(toDate(entry.week_start)) >= today);

  return nextVisit || activities[activities.length - 1];
}

async function ensureAgendaDocument(activity, congregationName) {
  const agendaRef = doc(appState.db, "agendas", activity.id);
  const snapshot = await getDoc(agendaRef);

  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }

  const agendaData = buildDefaultAgenda(activity, { name: congregationName });
  const newDoc = {
    activityId: activity.id,
    congregation_id: activity.congregation_id,
    congregationName: (congregationName || activity.congregationName || "").split("-")[0].trim(),
    visitDate: toTimestamp(activity.week_start),
    status: "draft",
    agendaData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(agendaRef, newDoc);

  return {
    id: activity.id,
    ...newDoc,
  };
}

function buildDefaultAgenda(activity = null, congregation = null) {
  const rawCongregationName = congregation?.name || activity?.congregationName || "";
  const congregationName = rawCongregationName.split("-")[0].trim();
  const visitDate = activity?.week_start ? formatDateInput(activity.week_start) : "";

  return {
    congregation: congregationName,
    date: visitDate,
    meetings: MEETING_DEFINITIONS.map((entry) => ({
      title: entry.title,
      day: entry.defaultDay,
      time: "",
      place: "",
    })),
    fieldService: FIELD_SERVICE_DAYS.map((day) => ({
      day,
      am: "",
      amPlace: "",
      pm: day === "Jueves" ? "No programar" : "",
      pmPlace: "",
    })),
    henry: HENRY_VISITS.map((entry) => ({
      day: entry.day,
      time: "",
      type: "",
      companion: "",
      notes: "",
      subtitle: entry.subtitle,
    })),
    carolina: CAROLINA_VISITS.map((entry) => ({
      ...entry,
      time: "",
      sister: "",
      lesson: "",
    })),
    lunches: LUNCH_DAYS.map((entry) => ({
      day: entry.day,
      time: entry.time,
      family: "",
      contact: "",
      note: entry.note,
    })),
  };
}

function mergeAgendaWithDefaults(saved, defaults) {
  if (!saved) {
    return structuredClone(defaults);
  }

  return {
    congregation: saved.congregation ? saved.congregation.split("-")[0].trim() : defaults.congregation,
    date: saved.date ?? defaults.date,
    meetings: defaults.meetings.map((item, index) => ({ ...item, ...(saved.meetings?.[index] || {}) })),
    fieldService: defaults.fieldService.map((item, index) => ({ ...item, ...(saved.fieldService?.[index] || {}) })),
    henry: defaults.henry.map((item, index) => ({ ...item, ...(saved.henry?.[index] || {}) })),
    carolina: defaults.carolina.map((item, index) => ({ ...item, ...(saved.carolina?.[index] || {}) })),
    lunches: defaults.lunches.map((item, index) => ({ ...item, ...(saved.lunches?.[index] || {}) })),
  };
}

function renderAgenda() {
  const displayName = appState.congregationName ? appState.congregationName.split("-")[0].trim() : "Acceso de congregación";
  dom.userEmail.textContent = displayName;
  renderMeetings();
  renderFieldService();
  renderHenry();
  renderCarolina();
  renderLunches();
  renderSummary();
  initMobileNav();
  initDotToc();
}

const NAV_SECTIONS = [
  "section-reuniones",
  "section-predicacion",
  "section-henry",
  "section-carolina",
  "section-almuerzos",
];

function initMobileNav() {
  if (mobileNavInitialized) return;
  mobileNavInitialized = true;

  const nav = document.querySelector("#mobileNav");
  if (!nav) return;

  activateMobileSection(NAV_SECTIONS[0]);

  nav.querySelectorAll(".mobile-nav__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateMobileSection(btn.dataset.section);
    });
  });
}

function activateMobileSection(targetId) {
  const isMobile = window.matchMedia("(max-width: 639px)").matches;
  const nav = document.querySelector("#mobileNav");
  if (!nav) return;

  NAV_SECTIONS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isMobile) {
      el.classList.toggle("section--hidden", id !== targetId);
    } else {
      el.classList.remove("section--hidden");
    }
  });

  nav.querySelectorAll(".mobile-nav__btn").forEach((btn) => {
    btn.classList.toggle("mobile-nav__btn--active", btn.dataset.section === targetId);
  });

  if (isMobile) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function initDotToc() {
  if (dotTocInitialized) return;
  dotTocInitialized = true;

  const nav = document.querySelector("#dotToc");
  if (!nav) return;

  // Click → smooth-scroll to section
  nav.querySelectorAll(".dot-toc__dot").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = document.getElementById(btn.dataset.section);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Scroll → highlight whichever section's top has passed 40% of the viewport
  function updateActiveDot() {
    const threshold = window.scrollY + window.innerHeight * 0.4;
    let activeId = NAV_SECTIONS[0];

    for (const id of NAV_SECTIONS) {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= threshold) {
        activeId = id;
      }
    }

    nav.querySelectorAll(".dot-toc__dot").forEach((btn) => {
      btn.classList.toggle("dot-toc__dot--active", btn.dataset.section === activeId);
    });
  }

  window.addEventListener("scroll", updateActiveDot, { passive: true });
  updateActiveDot();
}

function renderMeetings() {
  dom.meetingsList.innerHTML = "";

  appState.agenda.meetings.forEach((meeting, index) => {
    const fragment = dom.meetingTemplate.content.cloneNode(true);
    const titleEl = fragment.querySelector(".meeting-card__title");
    const timeInput = fragment.querySelector(".meeting-card__time-input");
    const daySelect = fragment.querySelector(".meeting-input--day");
    const placeInput = fragment.querySelector(".meeting-input--place");

    titleEl.textContent = meeting.title;
    timeInput.value = meeting.time || "";

    getMeetingOptions(meeting.title).forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue || "Seleccione un día";
      daySelect.append(option);
    });
    daySelect.value = meeting.day || "";

    placeInput.value = meeting.place || "";

    timeInput.addEventListener("input", (e) => updateNested("meetings", index, "time", e.target.value));
    daySelect.addEventListener("change", (e) => updateNested("meetings", index, "day", e.target.value));
    placeInput.addEventListener("input", (e) => updateNested("meetings", index, "place", e.target.value));

    dom.meetingsList.append(fragment);
  });
}

function renderFieldService() {
  dom.fieldServiceList.innerHTML = "";

  appState.agenda.fieldService.forEach((entry, index) => {
    const fragment = dom.fieldServiceTemplate.content.cloneNode(true);
    const titleEl = fragment.querySelector(".field-service-card__title");
    const tagEl = fragment.querySelector(".field-service-card__tag");
    const amInput = fragment.querySelector(".field-input--am");
    const amPlaceInput = fragment.querySelector(".field-input--am-place");
    const pmInput = fragment.querySelector(".field-input--pm");
    const pmPlaceInput = fragment.querySelector(".field-input--pm-place");

    titleEl.textContent = entry.day;
    tagEl.textContent = entry.pm === "No programar" || entry.day === "Jueves" ? "PM libre" : "Día activo";

    amInput.value = entry.am || "";
    amPlaceInput.value = entry.amPlace || "";
    pmInput.value = entry.pm || "";
    pmPlaceInput.value = entry.pmPlace || "";

    if (entry.day === "Jueves") {
      const fields = fragment.querySelectorAll(".lunch-field");
      if (fields.length > 1) {
        fields[1].style.display = "none";
      }
    }

    amInput.addEventListener("input", (e) => {
      let value = e.target.value;
      const enforced = forceAM(value);
      if (enforced !== value) {
        value = enforced;
        e.target.value = value;
      }
      updateNested("fieldService", index, "am", value);
    });

    amPlaceInput.addEventListener("input", (e) => updateNested("fieldService", index, "amPlace", e.target.value));

    pmInput.addEventListener("input", (e) => {
      let value = e.target.value;
      const enforced = forcePM(value);
      if (enforced !== value) {
        value = enforced;
        e.target.value = value;
      }
      updateNested("fieldService", index, "pm", value);
    });

    pmPlaceInput.addEventListener("input", (e) => updateNested("fieldService", index, "pmPlace", e.target.value));

    dom.fieldServiceList.append(fragment);
  });
}

function renderHenry() {
  dom.henryList.innerHTML = "";

  appState.agenda.henry.forEach((entry, index) => {
    const card = document.createElement("article");
    card.className = "person-card";

    // Header
    const header = document.createElement("div");
    header.className = "person-card__header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "person-card__title-group";

    const dayEl = document.createElement("h3");
    dayEl.className = "person-card__day";
    dayEl.textContent = entry.day;

    const subtitleEl = document.createElement("p");
    subtitleEl.className = "person-card__subtitle";
    subtitleEl.textContent = entry.subtitle;

    titleGroup.append(dayEl, subtitleEl);

    const timePill = document.createElement("div");
    timePill.className = "person-card__time-pill";
    timePill.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.className = "person-card__time-input";
    timeInput.value = entry.time || "";
    timeInput.addEventListener("input", (e) => updateNested("henry", index, "time", e.target.value));
    timePill.append(timeInput);

    header.append(titleGroup, timePill);

    // Body
    const body = document.createElement("div");
    body.className = "person-card__body";

    body.append(
      makePersonField("Estudio / Pastoreo", "text", entry.type, "Tipo de visita", "person-input--type",
        (v) => updateNested("henry", index, "type", v)),
      makePersonField("Acompañante", "text", entry.companion, "Nombre y celular", "",
        (v) => updateNested("henry", index, "companion", v)),
      makePersonField("Lección o información", "textarea", entry.notes, "Anote detalles importantes", "person-input--textarea",
        (v) => updateNested("henry", index, "notes", v)),
    );

    card.append(header, body);
    dom.henryList.append(card);
  });
}

function renderCarolina() {
  dom.carolinaList.innerHTML = "";

  const entriesWithIndex = appState.agenda.carolina.map((entry, index) => ({ entry, index }));
  const dayOrder = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  entriesWithIndex.sort((a, b) => dayOrder.indexOf(a.entry.day) - dayOrder.indexOf(b.entry.day));

  entriesWithIndex.forEach(({ entry, index }) => {
    const isEmpty = !entry.time && !entry.sister && !entry.lesson;
    const isVisible = !entry.isExtra || !isEmpty || activeExtras.has(index);

    if (isVisible) {
      const card = document.createElement("article");
      card.className = "person-card";

      // Header
      const header = document.createElement("div");
      header.className = "person-card__header";

      const titleGroup = document.createElement("div");
      titleGroup.className = "person-card__title-group";

      const dayEl = document.createElement("h3");
      dayEl.className = "person-card__day";
      dayEl.textContent = entry.day;

      const subtitleEl = document.createElement("p");
      subtitleEl.className = "person-card__subtitle";
      subtitleEl.textContent = entry.subtitle;

      titleGroup.append(dayEl, subtitleEl);

      const timePill = document.createElement("div");
      timePill.className = "person-card__time-pill";
      timePill.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
      const timeInput = document.createElement("input");
      timeInput.type = "time";
      timeInput.className = "person-card__time-input";
      timeInput.value = entry.time || "";
      timeInput.addEventListener("input", (e) => updateNested("carolina", index, "time", e.target.value));
      timePill.append(timeInput);

      header.append(titleGroup, timePill);

      // Body
      const body = document.createElement("div");
      body.className = "person-card__body";

      body.append(
        makePersonField("Hermana", "text", entry.sister, "Nombre y celular", "person-input--type",
          (v) => updateNested("carolina", index, "sister", v)),
        makePersonField("Lección", "textarea", entry.lesson, "Lección o notas", "person-input--textarea",
          (v) => updateNested("carolina", index, "lesson", v)),
      );

      card.append(header, body);
      dom.carolinaList.append(card);
    } else {
      const btn = document.createElement("button");
      btn.className = "ghost-button ghost-button--dash";
      btn.textContent = `+ Añadir otro estudio (${entry.day})`;
      btn.onclick = () => {
        activeExtras.add(index);
        renderCarolina();
      };
      dom.carolinaList.append(btn);
    }
  });
}

function renderLunches() {
  dom.lunchList.innerHTML = "";

  appState.agenda.lunches.forEach((entry, index) => {
    // Auto-migrate old "12 M" format from the database
    if (entry.time === "12 M") {
      entry.time = "12:00";
    }

    const fragment = dom.lunchTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".lunch-card");
    const dayEl = fragment.querySelector(".lunch-card__day");
    const timeInput = fragment.querySelector(".lunch-card__time-input");
    const familyInput = fragment.querySelector(".lunch-input--family");
    const addressInput = fragment.querySelector(".lunch-input--address");
    const notesInput = fragment.querySelector(".lunch-input--notes");

    // Title & Color
    dayEl.textContent = entry.day;
    if (entry.day === "Martes" || entry.day === "Domingo") {
      card.classList.add("lunch-card--red");
    }

    // Values
    timeInput.value = entry.time || "";
    familyInput.value = entry.family || "";
    // Note: Previously, contact and note were separate fields. The new design has 2 lines under CONTACT & ADDRESS. 
    // I'll map contact to address, and note to notes.
    addressInput.value = entry.contact || "";
    notesInput.value = entry.note || "";

    // Listeners
    timeInput.addEventListener("input", (e) => updateNested("lunches", index, "time", e.target.value));
    familyInput.addEventListener("input", (e) => updateNested("lunches", index, "family", e.target.value));
    addressInput.addEventListener("input", (e) => updateNested("lunches", index, "contact", e.target.value));
    notesInput.addEventListener("input", (e) => updateNested("lunches", index, "note", e.target.value));

    dom.lunchList.append(fragment);
  });
}

function createField({ label, value, onInput, type = "text", placeholder = "", options = [], min, max }) {
  const field = document.createElement("label");
  field.className = "field";

  const caption = document.createElement("span");
  caption.textContent = label;

  const input =
    type === "textarea"
      ? document.createElement("textarea")
      : type === "select"
        ? document.createElement("select")
        : document.createElement("input");

  if (type === "select") {
    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue || "Seleccione un día";
      input.append(option);
    });
  } else if (type !== "textarea") {
    input.type = type;
  }

  input.value = value || "";
  if (type !== "select") {
    input.placeholder = placeholder;
    if (min) input.min = min;
    if (max) input.max = max;
  }

  input.addEventListener(type === "select" ? "change" : "input", (event) => onInput(event.target.value, event.target));

  field.append(caption, input);
  return field;
}

function makePersonField(label, type, value, placeholder, extraClass, onInput) {
  const wrapper = document.createElement("div");
  wrapper.className = "person-field";

  const eyebrow = document.createElement("span");
  eyebrow.className = "person-eyebrow";
  eyebrow.textContent = label;

  const input = type === "textarea"
    ? document.createElement("textarea")
    : document.createElement("input");

  if (type !== "textarea") {
    input.type = type;
  }

  input.className = `person-input${extraClass ? " " + extraClass : ""}`;
  input.value = value || "";
  input.placeholder = placeholder || "";

  input.addEventListener("input", (e) => onInput(e.target.value));

  wrapper.append(eyebrow, input);
  return wrapper;
}

function updateNested(section, index, key, value) {
  appState.agenda[section][index][key] = value;
  renderSummary();
  queueSave();
}

function queueSave() {
  if (appState.isPreview || !appState.agendaRef) {
    return;
  }

  setSaveStatus("Guardando...");
  window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(async () => {
    try {
      await updateDoc(appState.agendaRef, {
        agendaData: sanitizeAgendaForStorage(appState.agenda),
        updatedAt: serverTimestamp(),
        updatedByCongregation: appState.congregationId || "",
      });
      setSaveStatus("Cambios guardados");
    } catch (error) {
      setSaveStatus("No se pudo guardar");
      showAgendaMessage(normalizeFirebaseError(error, "No se pudo guardar la agenda."));
    }
  }, 300);
}

function sanitizeAgendaForStorage(agenda) {
  return JSON.parse(JSON.stringify(agenda));
}

function renderSummary() {
  const summaryName = appState.agenda.congregation || "";
  dom.summaryCongregation.textContent = summaryName.split("-")[0].trim() || "Sin definir";
  dom.summaryDate.textContent = formatDisplayDate(appState.agenda.date);

  const { filled, total } = countProgress(appState.agenda);
  const percent = total ? Math.round((filled / total) * 100) : 0;
  dom.summaryProgress.textContent = `${percent}%`;
  dom.completionBar.style.width = `${percent}%`;
}

function countProgress(agenda) {
  const values = [
    agenda.congregation,
    agenda.date,
    ...agenda.meetings.flatMap((entry) => [entry.day, entry.time, entry.place]),
    ...agenda.fieldService.flatMap((entry) => [entry.am, entry.amPlace, entry.pm, entry.pmPlace]),
    ...agenda.henry.flatMap((entry) => [entry.time, entry.type, entry.companion, entry.notes]),
    ...agenda.carolina.flatMap((entry) => [entry.time, entry.sister, entry.lesson]),
    ...agenda.lunches.flatMap((entry) => [entry.time, entry.family, entry.contact, entry.note]),
  ];

  const total = values.length;
  const filled = values.filter((value) => typeof value === "string" && value.trim()).length;

  return { filled, total };
}

async function handleResetAgenda() {
  if (!appState.activity || !appState.agendaRef) {
    return;
  }

  if (!window.confirm("Se restaurará la agenda base de esta visita. ¿Desea continuar?")) {
    return;
  }

  appState.agenda = buildDefaultAgenda(appState.activity, appState.congregationDoc);
  renderAgenda();
  queueSave();
}

function downloadBackup() {
  const backup = {
    activityId: appState.activity?.id || null,
    congregation_id: appState.activity?.congregation_id || null,
    congregationName: appState.agenda.congregation,
    visitDate: appState.agenda.date,
    agendaData: appState.agenda,
  };

  const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "agenda-visita.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function handleLogout() {
  if (!appState.auth) {
    return;
  }

  await signOut(appState.auth);
  clearSessionState();
}

function clearSessionState(showAuth = true) {
  appState.user = null;
  appState.isPreview = false;
  appState.congregationId = null;
  appState.congregationName = "";
  appState.congregationDoc = null;
  appState.activity = null;
  appState.agendaRef = null;
  appState.agendaDoc = null;
  appState.agenda = buildDefaultAgenda();
  dom.congregationCodeInput.value = "";
  if (showAuth) {
    showAuthScreen("Escriba la congregación y su número para abrir la agenda.");
  }
}

function showAuthScreen(message) {
  dom.authMessage.textContent = message;
  dom.authScreen.classList.remove("hidden");
  dom.agendaScreen.classList.add("hidden");
}

function showAgendaScreen() {
  dom.authScreen.classList.add("hidden");
  dom.agendaScreen.classList.remove("hidden");
}

function showAgendaLoading(message) {
  showAgendaScreen();
  showAgendaMessage(message, false);
  setSaveStatus("Cargando agenda...");
}

function showAgendaMessage(message, isError = true) {
  dom.appMessage.textContent = message;
  dom.appMessagePanel.classList.remove("hidden");
  dom.appMessagePanel.classList.toggle("notice-panel--error", isError);
}

function hideAppMessage() {
  dom.appMessagePanel.classList.add("hidden");
  dom.appMessagePanel.classList.remove("notice-panel--error");
  dom.appMessage.textContent = "";
}

function setAuthBusy(isBusy) {
  dom.loginButton.disabled = isBusy;
  dom.congregationNameInput.disabled = isBusy;
  dom.congregationCodeInput.disabled = isBusy;
}

function setSaveStatus(message) {
  dom.saveStatus.textContent = message;
}

function getMeetingOptions(title) {
  return MEETING_DEFINITIONS.find((entry) => entry.title === title)?.options || WEEKDAY_OPTIONS;
}

function formatDateInput(value) {
  const date = toDate(value);
  if (!date) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(value) {
  if (!value) {
    return "Pendiente";
  }

  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toTimestamp(value) {
  const date = toDate(value);
  return date ? Timestamp.fromDate(date) : null;
}

function startOfDay(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function normalizeFirebaseError(error, fallback) {
  const code = error?.code || "";
  const message = error?.message || "";

  if (code === "functions/not-found") {
    return "La función de acceso no está desplegada todavía. Publique `loginWithCongregationCode` en Firebase Functions.";
  }

  if (code === "functions/invalid-argument") {
    return "Debe escribir la congregación y el número completos.";
  }

  if (code === "functions/permission-denied") {
    return "La congregación o el número no son válidos.";
  }

  if (code === "functions/failed-precondition") {
    return "El acceso de esta congregación no está habilitado todavía.";
  }

  if (code === "auth/custom-token-mismatch" || message.includes("auth/custom-token-mismatch")) {
    return "El token personalizado pertenece a otro proyecto de Firebase.";
  }

  if (code === "auth/invalid-custom-token" || message.includes("auth/invalid-custom-token")) {
    return "El token de acceso generado por el backend no es válido.";
  }

  if (message.includes("permission-denied")) {
    return "La sesión no tiene permisos para abrir esta agenda.";
  }

  return code ? `${fallback} (${code})` : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function forceAM(value) {
  if (!value) return value;
  let [h, m] = value.split(":");
  let hr = parseInt(h, 10);
  if (hr >= 12) {
    hr = hr % 12;
    return `${String(hr).padStart(2, "0")}:${m}`;
  }
  return value;
}

function forcePM(value) {
  if (!value) return value;
  let [h, m] = value.split(":");
  let hr = parseInt(h, 10);
  if (hr < 12) {
    hr = hr + 12;
    return `${String(hr).padStart(2, "0")}:${m}`;
  }
  return value;
}
