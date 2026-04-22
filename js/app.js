import { restoreUser, signIn, signOut, signUp, saveUser, updatePointsInSupabase, getToken } from "./services/auth.js";
import { ADMIN_EMAIL } from "./config.js";

const state = {
  user: restoreUser(),
  tab: "home",
  data: { rewards: [], promotions: [], transactions: [], nearbyBrands: [] }
};

const content = document.getElementById("content");
const bottomNav = document.getElementById("bottom-nav");

async function loadData() {
  const response = await fetch("./data/mock-data.json");
  state.data = await response.json();
  const saved = loadPromos();
  if (saved) state.data.promotions = saved;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function isAdmin() {
  return state.user?.email === ADMIN_EMAIL;
}

function loadPromos() {
  try {
    const saved = localStorage.getItem("luci_promos");
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}
function getPointsStore() {
  try { return JSON.parse(localStorage.getItem("luci_points_store") || "{}"); }
  catch { return {}; }
}

function setPointsStore(store) {
  localStorage.setItem("luci_points_store", JSON.stringify(store));
}

async function assignPoints(memberKey, amount) {
  const token = getToken();

  // Leer puntos actuales
  const res = await fetch(
    `${config.supabaseUrl}/rest/v1/profiles?member_key=eq.${memberKey}&limit=1`,
    {
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );
  const rows = await res.json();
  if (!rows?.length) throw new Error("Usuario no encontrado");

  const current = rows[0];
  const newPoints = (current.points || 0) + amount;
  const newLifetime = (current.lifetime_points || 0) + amount;

  // Actualizar en Supabase
  const patch = await fetch(
    `${config.supabaseUrl}/rest/v1/profiles?member_key=eq.${memberKey}`,
    {
      method: "PATCH",
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ points: newPoints, lifetime_points: newLifetime })
    }
  );
  if (!patch.ok) throw new Error(`Error al asignar puntos (${patch.status})`);
}

async function mergeUserPoints() {
  if (!state.user) return;
  const store = getPointsStore();
  const pending = store[state.user.memberKey] || 0;
  if (pending === 0) return;
  state.user.points += pending;
  state.user.lifetimePoints += pending;
  delete store[state.user.memberKey];
  setPointsStore(store);
  saveUser(state.user);
  await updatePointsInSupabase(state.user.points, state.user.lifetimePoints);
}

let qrScanner = null;

function stopScanner() {
  if (qrScanner) { qrScanner.stop().catch(() => {}); qrScanner = null; }
}

function savePromos(promos) {
  localStorage.setItem("luci_promos", JSON.stringify(promos));
  state.data.promotions = promos;
}

function renderAuth() {
  bottomNav.classList.add("hidden");
  content.innerHTML = `
    <section class="card auth-wrap">
      <h1>Bienvenido a Appluci</h1>
      <p>Inicia sesion o registrate para generar tu llave y wallet de beneficios.</p>
      <div class="auth-grid">
        <form id="login-form" class="card pad">
          <h2>Iniciar sesion</h2>
          <input name="email" type="email" placeholder="Correo" required />
          <input name="password" type="password" placeholder="Contrasena" required />
          <button type="submit">Entrar</button>
        </form>
        <form id="register-form" class="card pad">
          <h2>Registro</h2>
          <input name="firstName" placeholder="Nombre" required />
          <input name="lastName" placeholder="Apellido" required />
          <input name="email" type="email" placeholder="Correo" required />
          <input name="password" type="password" placeholder="Contrasena (min 6)" minlength="6" required />
          <button type="submit">Crear cuenta</button>
        </form>
      </div>
      <p id="auth-error" class="error"></p>
    </section>
  `;

  const errorBox = document.getElementById("auth-error");

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      state.user = await signIn(fd.get("email"), fd.get("password"));
      mergeUserPoints();
      render();
    } catch (err) {
      errorBox.textContent = err.message;
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      state.user = await signUp(fd.get("firstName"), fd.get("lastName"), fd.get("email"), fd.get("password"));
      render();
    } catch (err) {
      errorBox.textContent = err.message;
    }
  });
}

function renderNav() {
  bottomNav.classList.remove("hidden");
  const tabs = [
    ["home", "Inicio"],
    ["wallet", "Wallet"],
    ["promos", "Promos"],
    ["perfil", "Perfil"]
  ];
  bottomNav.innerHTML = `
    <div class="nav-shell">
      <div class="nav-inner">
        ${tabs
          .map(
            ([id, label]) =>
              `<button class="${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`
          )
          .join("")}
      </div>
    </div>
  `;
  bottomNav.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      render();
    })
  );
}

function renderHome() {
  const firstName = state.user.name.split(" ")[0];
  const progress = Math.min(100, Math.round((state.user.lifetimePoints / state.user.nextTierAt) * 100));
  const promos = state.data.promotions
    .slice(0, 3)
    .map(
      (p) => `
      <li>
        <div>
          <strong>${esc(p.title)}</strong>
          <div class="item-meta">${esc(p.brand)} · ${esc(p.expires)}</div>
        </div>
        <span class="tiny">⚡</span>
      </li>`
    )
    .join("");

  const nearby = state.data.nearbyBrands
    .slice(0, 3)
    .map(
      (b) => `
      <li>
        <div>
          <strong>${esc(b.emoji)} ${esc(b.name)}</strong>
          <div class="item-meta">${esc(b.category)} · ${esc(b.distance)}</div>
        </div>
      </li>`
    )
    .join("");

  return `
    <section class="pad">
      <p class="tiny">Hola,</p>
      <h1 class="title">${esc(firstName)} 👋</h1>
    </section>
    <section class="card membership">
      <div class="membership-top">
        <div>
          <p class="tiny">Membresia</p>
          <h2>${esc(state.user.name)}</h2>
        </div>
        <span class="tier-pill">${esc(state.user.tier)}</span>
      </div>
      <div class="code-box">${esc(state.user.memberKey)}</div>
      <div id="member-qr" class="qr-box"></div>
      <div class="points-wrap">
        <p class="tiny">Puntos disponibles</p>
        <p class="points-number">${esc(state.user.points)}</p>
        <div class="tiny">${esc(state.user.lifetimePoints)} / ${esc(state.user.nextTierAt)} hacia el siguiente nivel</div>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </div>
    </section>
    <section class="card pad">
      <h3>Promos calientes</h3>
      <ul class="list">${promos}</ul>
    </section>
    <section class="card pad">
      <h3>Cerca de ti</h3>
      <ul class="list">${nearby}</ul>
    </section>
  `;
}

function renderWallet() {
  const rewards = state.data.rewards
    .map(
      (r) => `
      <li>
        <div>
          <strong>${esc(r.image)} ${esc(r.title)}</strong>
          <div class="item-meta">${esc(r.brand)} · ${esc(r.category)}</div>
        </div>
        <strong>${esc(r.cost)} pts</strong>
      </li>`
    )
    .join("");
  const tx = state.data.transactions
    .slice(0, 4)
    .map(
      (t) => `
      <li>
        <div>
          <strong>${esc(t.brand)}</strong>
          <div class="item-meta">${esc(t.date)}</div>
        </div>
        <span class="tag ${t.points >= 0 ? "plus" : "minus"}">${t.points >= 0 ? "+" : ""}${esc(t.points)} pts</span>
      </li>`
    )
    .join("");
  return `
    <section class="card pad">
      <p class="tiny">Tu wallet</p>
      <h2 class="title">Recompensas</h2>
      <p class="subtle">Disponibles: <strong>${esc(state.user.points)}</strong> · Acumulados: <strong>${esc(
    state.user.lifetimePoints
  )}</strong></p>
    </section>
    <section class="card pad">
      <h3>Recompensas</h3>
      <ul class="list">${rewards}</ul>
    </section>
    <section class="card pad">
      <h3>Actividad reciente</h3>
      <ul class="list">${tx}</ul>
    </section>
  `;
}

function renderPromos() {
  const items = state.data.promotions
    .map(
      (p) => `
      <li>
        <div>
          <strong>${esc(p.title)}</strong>
          <div class="item-meta">${esc(p.brand)} · ${esc(p.expires)}</div>
        </div>
      </li>`
    )
    .join("");
  return `
    <section class="card pad">
      <p class="tiny">Hechas para ti</p>
      <h2 class="title">Promociones</h2>
    </section>
    <section class="card hero-promo">
      <p class="tiny">Solo para ti</p>
      <h3 style="margin-top:8px;">Te extrañamos en La Trattoria</h3>
      <p style="margin-top:6px;color:rgba(255,255,255,0.84);">30% de descuento en tu proxima visita esta semana.</p>
      <button type="button">Activar oferta</button>
    </section>
    <section class="card pad">
      <h3>Activas ahora</h3>
      <ul class="list">${items}</ul>
    </section>
  `;
}

function renderPerfil() {
  const tx = state.data.transactions
    .map(
      (t) => `
      <li>
        <div>
          <strong>${esc(t.brand)}</strong>
          <div class="item-meta">${esc(t.date)}</div>
        </div>
        <span class="tag ${t.points > 0 ? "plus" : "minus"}">${t.points > 0 ? "+" : ""}${esc(t.points)} pts</span>
      </li>`
    )
    .join("");
  return `
    <section class="card pad">
      <p class="tiny">Mi perfil</p>
      <h2 class="title">${esc(state.user.name)}</h2>
      <p class="subtle">${esc(state.user.email)}</p>
      <p class="subtle">${esc(state.user.city)} · ${esc(state.user.tier)}</p>
      <button id="logout-btn" class="danger">Cerrar sesion</button>
    </section>
    <section class="card pad">
      <h3>Historial</h3>
      <ul class="list">${tx}</ul>
    </section>
  `;
}

function renderAdmin() {
  bottomNav.classList.add("hidden");
  stopScanner();
  const promos = state.data.promotions;
  const list = promos.map((p, i) => `
    <li>
      <div>
        <strong>${esc(p.title)}</strong>
        <div class="item-meta">${esc(p.brand)} · ${esc(p.expires)}</div>
      </div>
      <button class="danger small" data-del="${i}">✕</button>
    </li>`).join("");

  content.innerHTML = `
    <section class="card pad">
      <p class="tiny">Panel</p>
      <h2 class="title">Admin 🛠️</h2>
      <p class="subtle">${esc(state.user.email)}</p>
      <button id="logout-btn" class="danger">Cerrar sesion</button>
    </section>
    <section class="card pad">
      <h3>Asignar puntos</h3>
      <div id="scanner-wrap">
        <button id="btn-scan">📷 Escanear QR de usuario</button>
      </div>
      <div id="qr-reader" style="width:100%;display:none;"></div>
      <div id="scan-result" class="hidden">
        <p class="subtle" id="scan-key"></p>
        <input id="pts-amount" type="number" placeholder="Cantidad de puntos" min="1" />
        <button id="btn-assign">Asignar puntos</button>
        <p id="assign-msg" class="subtle"></p>
      </div>
    </section>
    <section class="card pad">
      <h3>Agregar oferta</h3>
      <input id="adm-title" placeholder="Titulo de la oferta" />
      <input id="adm-brand" placeholder="Marca / Negocio" />
      <input id="adm-expires" placeholder="Vigencia (ej: Hasta domingo)" />
      <button id="adm-add">Agregar oferta</button>
    </section>
    <section class="card pad">
      <h3>Ofertas activas</h3>
      <ul class="list" id="adm-list">${list || "<li><span class='subtle'>Sin ofertas.</span></li>"}</ul>
    </section>
  `;

  let scannedKey = null;

  document.getElementById("btn-scan").addEventListener("click", () => {
  document.getElementById("qr-reader").style.display = "block";
  document.getElementById("scan-result").classList.add("hidden");
  scannedKey = null;

  Html5Qrcode.getCameras().then(cameras => {
  if (!cameras.length) throw new Error("Sin camaras disponibles");
  qrScanner = new Html5Qrcode("qr-reader");
  return qrScanner.start(
    cameras[0].id,
    { fps: 10, qrbox: { width: 200, height: 200 } },
    (text) => {
      stopScanner();
      document.getElementById("qr-reader").style.display = "none";
      scannedKey = text;
      document.getElementById("scan-key").textContent = `Clave: ${text}`;
      document.getElementById("scan-result").classList.remove("hidden");
      document.getElementById("assign-msg").textContent = "";
    },
    () => {}
  );
}).catch((err) => {
  document.getElementById("qr-reader").style.display = "none";
  document.getElementById("scan-key").textContent = `Error: ${err}`;
  document.getElementById("scan-result").classList.remove("hidden");
});
  });

  document.getElementById("btn-assign").addEventListener("click", async () => {
  const amount = parseInt(document.getElementById("pts-amount").value, 10);
  if (!scannedKey || !amount || amount < 1) return;
  try {
    await assignPoints(scannedKey, amount);
    document.getElementById("assign-msg").textContent = `✅ ${amount} puntos asignados a ${scannedKey}`;
    document.getElementById("pts-amount").value = "";
  } catch (err) {
    document.getElementById("assign-msg").textContent = `❌ ${err.message}`;
  }
});

  document.getElementById("adm-add").addEventListener("click", () => {
    const title = document.getElementById("adm-title").value.trim();
    const brand = document.getElementById("adm-brand").value.trim();
    const expires = document.getElementById("adm-expires").value.trim();
    if (!title || !brand) return;
    savePromos([...state.data.promotions, { id: Date.now(), title, brand, expires, color: "primary" }]);
    render();
  });

  document.getElementById("adm-list").addEventListener("click", (e) => {
    const idx = e.target.dataset.del;
    if (idx === undefined) return;
    savePromos(state.data.promotions.filter((_, i) => i !== Number(idx)));
    render();
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    signOut(); state.user = null; render();
  });
}

function renderApp() {
  renderNav();
  if (state.tab === "home") {
  content.innerHTML = renderHome();
  new QRCode(document.getElementById("member-qr"), {
    text: state.user.memberKey,
    width: 148,
    height: 148,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}
  if (state.tab === "wallet") content.innerHTML = renderWallet();
  if (state.tab === "promos") content.innerHTML = renderPromos();
  if (state.tab === "perfil") content.innerHTML = renderPerfil();

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      signOut();
      state.user = null;
      state.tab = "home";
      render();
    });
  }
}

function render() {
  if (!state.user) renderAuth();
  else if (isAdmin()) renderAdmin();
  else renderApp();
}


async function bootstrap() {
  await loadData();
  try { await mergeUserPoints(); } catch {}
  render();
}
bootstrap();
