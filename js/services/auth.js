import { config } from "../config.js";

function buildUserFromSupabase(user, fallbackMemberKey = null) {
  const metadata = user.user_metadata || {};
  const firstName = metadata.first_name || "";
  const lastName = metadata.last_name || "";
  const memberKey =
    metadata.member_key || fallbackMemberKey || `LUCI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  return {
    name: `${firstName} ${lastName}`.trim() || "Usuario",
    memberKey,
    email: user.email || "",
    city: "Ciudad",
    birthDate: "",
    tier: "Nuevo",
    points: 0,
    lifetimePoints: 0,
    nextTierAt: 1000,
    joinedAt: "Hoy"
  };
}

function persistUser(user) {
  localStorage.setItem(config.storageKey, JSON.stringify(user));
}

export function restoreUser() {
  const raw = localStorage.getItem(config.storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function signOut() {
  localStorage.removeItem(config.storageKey);
}

async function request(path, payload) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      json.msg || json.error_description || json.message || `Error de autenticacion (${response.status})`;
    throw new Error(message);
  }
  return json;
}

export async function signIn(email, password) {
  const data = await request("/auth/v1/token?grant_type=password", {
    email: email.trim(),
    password
  });
  if (!data.user) throw new Error("No se pudo recuperar el usuario.");
  const user = buildUserFromSupabase(data.user);
  persistUser(user);
  return user;
}

export async function signUp(firstName, lastName, email, password) {
  const memberKey = `LUCI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const data = await request("/auth/v1/signup", {
    email: email.trim(),
    password,
    data: {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      member_key: memberKey
    }
  });
  if (!data.user) {
    throw new Error("Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesion.");
  }
  const user = buildUserFromSupabase(data.user, memberKey);
  persistUser(user);
  return user;
}
