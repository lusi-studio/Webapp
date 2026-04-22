import { config } from "../config.js";

const TOKEN_KEY = "luci_session_token";

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
    points: metadata.points ?? 0,
    lifetimePoints: metadata.lifetime_points ?? 0,
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
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveUser(user) {
  persistUser(user);
}

export function signOut() {
  localStorage.removeItem(config.storageKey);
  localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
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
    const message = json.msg || json.error_description || json.message || `Error de autenticacion (${response.status})`;
    throw new Error(message);
  }
  return json;
}

async function fetchProfile(authUserId, token) {
  const res = await fetch(
    `${config.supabaseUrl}/rest/v1/profiles?auth_user_id=eq.${authUserId}&limit=1`,
    {
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

async function upsertProfile(profile, token) {
  await fetch(`${config.supabaseUrl}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(profile)
  });
}

export async function signIn(email, password) {
  const data = await request("/auth/v1/token?grant_type=password", {
    email: email.trim(),
    password
  });
  if (!data.user) throw new Error("No se pudo recuperar el usuario.");
  localStorage.setItem(TOKEN_KEY, data.access_token);

  const profile = await fetchProfile(data.user.id, data.access_token);
  const user = {
    name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "Usuario",
    memberKey: profile?.member_key || `LUCI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    email: data.user.email || "",
    city: profile?.city || "Ciudad",
    tier: profile?.tier || "Nuevo",
    points: profile?.points ?? 0,
    lifetimePoints: profile?.lifetime_points ?? 0,
    nextTierAt: profile?.next_tier_at ?? 1000,
    joinedAt: "Hoy"
  };
  persistUser(user);
  return user;
}

export async function signUp(firstName, lastName, email, password) {
  const memberKey = `LUCI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const data = await request("/auth/v1/signup", {
    email: email.trim(),
    password,
    data: { first_name: firstName.trim(), last_name: lastName.trim(), member_key: memberKey }
  });
  if (!data.session) {
    throw new Error("Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesion.");
  }
  if (!data.user) throw new Error("No se pudo crear la cuenta.");

  await upsertProfile({
    auth_user_id: data.user.id,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
    member_key: memberKey,
    points: 0,
    lifetime_points: 0
  }, data.session.access_token);

  const user = {
    name: `${firstName.trim()} ${lastName.trim()}`,
    memberKey,
    email: email.trim(),
    city: "Ciudad",
    tier: "Nuevo",
    points: 0,
    lifetimePoints: 0,
    nextTierAt: 1000,
    joinedAt: "Hoy"
  };
  persistUser(user);
  return user;
}

export async function updatePointsInSupabase(points, lifetimePoints) {
  const token = getToken();
  const user = restoreUser();
  if (!token || !user) return;

  await fetch(
    `${config.supabaseUrl}/rest/v1/profiles?member_key=eq.${user.memberKey}`,
    {
      method: "PATCH",
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ points, lifetime_points: lifetimePoints })
    }
  );
}
