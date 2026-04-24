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
  { day: "Miércoles", subtitle: "Estudios, revisitas y pastoreos" },
  { day: "Jueves", subtitle: "Solo en la mañana" },
  { day: "Viernes", subtitle: "Estudios, revisitas y pastoreos" },
];
const CAROLINA_VISITS = [
  { day: "Miércoles", subtitle: "Estudios y revisitas" },
  { day: "Jueves", subtitle: "En la mañana" },
  { day: "Viernes", subtitle: "Estudios y revisitas" },
];
const LUNCH_DAYS = [
  { day: "Martes", time: "12 M", note: "Preguntar" },
  { day: "Miércoles", time: "12 M", note: "" },
  { day: "Jueves", time: "12 M", note: "" },
  { day: "Viernes", time: "12 M", note: "" },
  { day: "Sábado", time: "12 M", note: "" },
  { day: "Domingo", time: "12 M", note: "" },
];

let dom = {};

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
    setSaveStatus("Conectado con Firestore");
  } catch (error) {
    clearSessionState(false);
    appState.agenda = buildDefaultAgenda();
    showAgendaMessage(error.message || "No pudimos cargar la agenda.");
    showAgendaScreen();
    renderAgenda();
    setSaveStatus("Acceso pendiente");
  }
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
      day: entry.day,
      time: "",
      sister: "",
      lesson: "",
      subtitle: entry.subtitle,
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
}

function renderMeetings() {
  dom.meetingsList.innerHTML = "";

  appState.agenda.meetings.forEach((meeting, index) => {
    const fragment = dom.meetingTemplate.content.cloneNode(true);
    fragment.querySelector(".card__title").textContent = meeting.title;
    fragment.querySelector(".card__subtitle").textContent = "Complete solo lo necesario";

    const grid = fragment.querySelector(".grid");
    grid.append(
      createField({
        label: "Día",
        type: "select",
        value: meeting.day,
        options: getMeetingOptions(meeting.title),
        onInput: (value) => updateNested("meetings", index, "day", value),
      }),
      createField({
        label: "Hora",
        type: "time",
        value: meeting.time,
        onInput: (value) => updateNested("meetings", index, "time", value),
      }),
      createField({
        label: "Lugar",
        value: meeting.place,
        placeholder: "Dirección o salón",
        onInput: (value) => updateNested("meetings", index, "place", value),
      }),
    );

    dom.meetingsList.append(fragment);
  });
}

function renderFieldService() {
  dom.fieldServiceList.innerHTML = "";

  appState.agenda.fieldService.forEach((entry, index) => {
    const fragment = dom.fieldServiceTemplate.content.cloneNode(true);
    fragment.querySelector(".card__title").textContent = entry.day;
    fragment.querySelector(".tag").textContent = entry.pm === "No programar" ? "PM libre" : "Día activo";

    const grid = fragment.querySelector(".grid");
    grid.append(
      createField({
        label: "AM",
        value: entry.am,
        placeholder: "Hora de salida",
        onInput: (value) => updateNested("fieldService", index, "am", value),
      }),
      createField({
        label: "Lugar AM",
        value: entry.amPlace,
        placeholder: "Punto de encuentro",
        onInput: (value) => updateNested("fieldService", index, "amPlace", value),
      }),
      createField({
        label: "PM",
        value: entry.pm,
        placeholder: "Hora de salida",
        onInput: (value) => updateNested("fieldService", index, "pm", value),
      }),
      createField({
        label: "Lugar PM",
        value: entry.pmPlace,
        placeholder: "Punto de encuentro",
        onInput: (value) => updateNested("fieldService", index, "pmPlace", value),
      }),
    );

    dom.fieldServiceList.append(fragment);
  });
}

function renderHenry() {
  dom.henryList.innerHTML = "";

  appState.agenda.henry.forEach((entry, index) => {
    const fragment = dom.visitTemplate.content.cloneNode(true);
    fragment.querySelector(".card__title").textContent = entry.day;
    fragment.querySelector(".card__subtitle").textContent = entry.subtitle;

    const grid = fragment.querySelector(".grid");
    grid.append(
      createField({
        label: "Hora",
        value: entry.time,
        placeholder: "Ej. 10:30 a. m.",
        onInput: (value) => updateNested("henry", index, "time", value),
      }),
      createField({
        label: "Estudio / Pastoreo",
        value: entry.type,
        placeholder: "Tipo de visita",
        onInput: (value) => updateNested("henry", index, "type", value),
      }),
      createField({
        label: "Acompañante",
        value: entry.companion,
        placeholder: "Nombre y celular",
        onInput: (value) => updateNested("henry", index, "companion", value),
      }),
      createField({
        label: "Lección o información",
        type: "textarea",
        value: entry.notes,
        placeholder: "Anote detalles importantes",
        onInput: (value) => updateNested("henry", index, "notes", value),
      }),
    );

    dom.henryList.append(fragment);
  });
}

function renderCarolina() {
  dom.carolinaList.innerHTML = "";

  appState.agenda.carolina.forEach((entry, index) => {
    const fragment = dom.visitTemplate.content.cloneNode(true);
    fragment.querySelector(".card__title").textContent = entry.day;
    fragment.querySelector(".card__subtitle").textContent = entry.subtitle;

    const grid = fragment.querySelector(".grid");
    grid.append(
      createField({
        label: "Hora",
        value: entry.time,
        placeholder: "Ej. 9:00 a. m.",
        onInput: (value) => updateNested("carolina", index, "time", value),
      }),
      createField({
        label: "Hermana",
        value: entry.sister,
        placeholder: "Nombre y celular",
        onInput: (value) => updateNested("carolina", index, "sister", value),
      }),
      createField({
        label: "Lección",
        type: "textarea",
        value: entry.lesson,
        placeholder: "Lección o notas",
        onInput: (value) => updateNested("carolina", index, "lesson", value),
      }),
    );

    dom.carolinaList.append(fragment);
  });
}

function renderLunches() {
  dom.lunchList.innerHTML = "";

  appState.agenda.lunches.forEach((entry, index) => {
    const fragment = dom.lunchTemplate.content.cloneNode(true);
    const title = entry.note ? `${entry.day} (${entry.note})` : entry.day;
    fragment.querySelector(".card__title").textContent = title;

    const grid = fragment.querySelector(".grid");
    grid.append(
      createField({
        label: "Hora",
        value: entry.time,
        placeholder: "Ej. 12 M",
        onInput: (value) => updateNested("lunches", index, "time", value),
      }),
      createField({
        label: "Familia",
        value: entry.family,
        placeholder: "Apellido o familia",
        onInput: (value) => updateNested("lunches", index, "family", value),
      }),
      createField({
        label: "Dirección / Teléfono",
        type: "textarea",
        value: entry.contact,
        placeholder: "Dirección, teléfono o referencia",
        onInput: (value) => updateNested("lunches", index, "contact", value),
      }),
      createField({
        label: "Nota",
        value: entry.note,
        placeholder: "Ej. Confirmar el martes",
        onInput: (value) => updateNested("lunches", index, "note", value),
      }),
    );

    dom.lunchList.append(fragment);
  });
}

function createField({ label, value, onInput, type = "text", placeholder = "", options = [] }) {
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
  }

  input.addEventListener(type === "select" ? "change" : "input", (event) => onInput(event.target.value));

  field.append(caption, input);
  return field;
}

function updateNested(section, index, key, value) {
  appState.agenda[section][index][key] = value;
  renderSummary();
  queueSave();
}

function queueSave() {
  if (!appState.agendaRef) {
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
      setSaveStatus("Cambios guardados en Firestore");
    } catch (error) {
      setSaveStatus("No se pudo guardar");
      showAgendaMessage(normalizeFirebaseError(error, "No se pudo guardar la agenda en Firestore."));
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
