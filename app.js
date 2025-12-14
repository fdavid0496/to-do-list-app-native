// =========================
// VARIABLES GLOBALES / SELECTORES
// =========================
const STORAGE_KEY = "todo_native_v1";

/** @type {{id:string, text:string, completed:boolean, createdAt:number}[]} */
let tasks = [];

const $form = document.getElementById("taskForm");
const $input = document.getElementById("taskInput");
const $list = document.getElementById("taskList");
const $counter = document.getElementById("counter");
const $error = document.getElementById("formError");
const $empty = document.getElementById("emptyState");
const $clearCompleted = document.getElementById("clearCompletedBtn");

// Estado de edición (para manejar focus y cancelar con ESC)
let editingId = null;

// =========================
// UTILIDADES / HELPERS
// =========================
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const normalize = (s) => s.trim().replace(/\s+/g, " ");
const now = () => Date.now();

function announce(message) {
    // Mensajes breves para validación/feedback accesible.
    $error.textContent = message || "";
}

// =========================
// PERSISTENCIA (localStorage)
// =========================
function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(t => t && typeof t.id === "string")
            .map(t => ({
                id: t.id,
                text: typeof t.text === "string" ? t.text : "",
                completed: Boolean(t.completed),
                createdAt: typeof t.createdAt === "number" ? t.createdAt : now()
            }));
    } catch {
        return [];
    }
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// =========================
// FUNCIONES PURAS (DATA)
// =========================
function addTask(text) {
    const newTask = { id: uid(), text, completed: false, createdAt: now() };
    tasks = [newTask, ...tasks];
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
}

function toggleTask(id) {
    tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
}

function editTask(id, newText) {
    tasks = tasks.map(t => t.id === id ? { ...t, text: newText } : t);
}

function clearCompleted() {
    tasks = tasks.filter(t => !t.completed);
}

// =========================
// RENDER / UI
// =========================
function updateCounter() {
    const completed = tasks.filter(t => t.completed).length;
    const pending = tasks.length - completed;
    $counter.textContent = `${pending} pendientes · ${completed} completadas`;
}

function setEmptyState() {
    const isEmpty = tasks.length === 0;
    $empty.hidden = !isEmpty;
    $list.hidden = isEmpty;
}

function createIcon(svgPathD) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", svgPathD);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    return svg;
}

function render() {
    // Limpieza rápida
    $list.textContent = "";

    // Render items
    for (const task of tasks) {
        const li = document.createElement("li");
        li.className = "task" + (task.completed ? " completed" : "");
        li.dataset.id = task.id;

        // Checkbox
        const checkWrap = document.createElement("div");
        checkWrap.className = "check";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.completed;
        checkbox.setAttribute("aria-label", task.completed ? "Marcar como pendiente" : "Marcar como completada");
        checkbox.addEventListener("change", () => {
            toggleTask(task.id);
            saveToStorage();
            render();
        });

        checkWrap.appendChild(checkbox);

        // Texto / contenido
        const textWrap = document.createElement("div");
        textWrap.className = "taskText";

        const title = document.createElement("p");
        title.className = "taskTitle";
        title.textContent = task.text;
        title.tabIndex = 0; // navegable por teclado
        title.setAttribute("role", "button");
        title.setAttribute("aria-label", "Editar tarea (doble clic o Enter)");
        title.addEventListener("dblclick", () => startEditing(task.id));
        title.addEventListener("keydown", (e) => {
            if (e.key === "Enter") startEditing(task.id);
        });

        const meta = document.createElement("p");
        meta.className = "meta";
        const date = new Date(task.createdAt);
        meta.textContent = `Creada: ${date.toLocaleString()}`;

        textWrap.appendChild(title);
        textWrap.appendChild(meta);

        // Acciones
        const actions = document.createElement("div");
        actions.className = "actions";

        const editBtn = document.createElement("button");
        editBtn.className = "iconBtn warn";
        editBtn.type = "button";
        editBtn.setAttribute("aria-label", "Editar tarea");
        editBtn.appendChild(createIcon("M4 20h4l10.5-10.5a2.12 2.12 0 0 0 0-3L16.5 3.5a2.12 2.12 0 0 0-3 0L3 14v6z"));
        editBtn.addEventListener("click", () => startEditing(task.id));

        const delBtn = document.createElement("button");
        delBtn.className = "iconBtn danger";
        delBtn.type = "button";
        delBtn.setAttribute("aria-label", "Eliminar tarea");
        delBtn.appendChild(createIcon("M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"));
        delBtn.addEventListener("click", () => animateRemove(li, () => {
            deleteTask(task.id);
            saveToStorage();
            render();
        }));

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        // Composición
        li.appendChild(checkWrap);
        li.appendChild(textWrap);
        li.appendChild(actions);

        // Si esta tarea está en edición, reemplaza el texto por un input inline
        if (editingId === task.id) {
            applyInlineEditor(li, task);
        }

        $list.appendChild(li);
    }

    updateCounter();
    setEmptyState();
}

function animateRemove(element, onDone) {
    element.classList.add("removing");
    // Respeta reduce motion (CSS lo desactiva), pero igual removemos en el siguiente frame.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
    window.setTimeout(onDone, duration);
}

// =========================
// EDICIÓN INLINE
// =========================
function startEditing(id) {
    editingId = id;
    render();

    // Mover foco al input de edición
    const li = $list.querySelector(`.task[data-id="${CSS.escape(id)}"]`);
    const input = li?.querySelector("input.editInput");
    input?.focus();
    input?.select();
}

function cancelEditing() {
    editingId = null;
    render();
}

function commitEditing(id, value) {
    const text = normalize(value);
    if (!text) {
        announce("La edición no puede quedar vacía.");
        return;
    }
    const duplicate = tasks.some(t => t.id !== id && normalize(t.text).toLowerCase() === text.toLowerCase());
    if (duplicate) {
        announce("Ya existe una tarea con ese texto.");
        return;
    }
    editTask(id, text);
    editingId = null;
    announce("");
    saveToStorage();
    render();
}

function applyInlineEditor(li, task) {
    const textWrap = li.querySelector(".taskText");
    if (!textWrap) return;

    // Limpia el contenido y crea editor
    textWrap.textContent = "";

    const editor = document.createElement("input");
    editor.className = "editInput";
    editor.type = "text";
    editor.value = task.text;
    editor.setAttribute("aria-label", "Editar texto de la tarea");
    editor.autocomplete = "off";

    const help = document.createElement("p");
    help.className = "meta";
    help.textContent = "Enter: guardar · Esc: cancelar";

    editor.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            cancelEditing();
        }
        if (e.key === "Enter") {
            e.preventDefault();
            commitEditing(task.id, editor.value);
        }
    });

    editor.addEventListener("blur", () => {
        // Guardar al perder foco, pero solo si sigue en modo edición
        if (editingId === task.id) commitEditing(task.id, editor.value);
    });

    textWrap.appendChild(editor);
    textWrap.appendChild(help);
}

// =========================
// VALIDACIÓN + AGREGAR
// =========================
function handleAddTask(raw) {
    const text = normalize(raw);

    if (!text) {
        announce("Escribe una tarea antes de agregar.");
        $input.focus();
        return;
    }

    const duplicate = tasks.some(t => normalize(t.text).toLowerCase() === text.toLowerCase());
    if (duplicate) {
        announce("Esa tarea ya existe. Prueba con un texto diferente.");
        $input.focus();
        $input.select();
        return;
    }

    addTask(text);
    announce("");
    saveToStorage();
    render();

    // UX: limpiar y mantener foco
    $input.value = "";
    $input.focus();
}

// =========================
// EVENT LISTENERS (AL CARGAR)
// =========================
window.addEventListener("DOMContentLoaded", () => {
    tasks = loadFromStorage();
    render();

    $form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleAddTask($input.value);
    });

    $clearCompleted.addEventListener("click", () => {
        const hasCompleted = tasks.some(t => t.completed);
        if (!hasCompleted) {
            announce("No hay tareas completadas para limpiar.");
            return;
        }
        clearCompleted();
        announce("");
        saveToStorage();
        render();
        $input.focus();
    });

    // Accesibilidad: si estás editando y presionas Escape fuera del input (por ejemplo, botón),
    // cancela edición.
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && editingId !== null) {
            cancelEditing();
        }
    });

    // Focus inicial
    $input.focus();
});