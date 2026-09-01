// Shared between server (validation, cookie expiry) and client (Settings
// input bounds) — kept free of server-only imports so it can be used from
// "use client" components.
export const PASSWORD_RECONFIRM_MIN_MINUTES = 1;
export const PASSWORD_RECONFIRM_MAX_MINUTES = 120;
export const PASSWORD_RECONFIRM_DEFAULT_MINUTES = 20;
