const REMEMBER_ME_KEY = "dokuru_remember_email";

export function getRememberedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REMEMBER_ME_KEY);
}

export function setRememberedEmail(email: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMEMBER_ME_KEY, email);
}

export function removeRememberedEmail(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REMEMBER_ME_KEY);
}

export function clearAppStorage(): void {
  if (typeof window === "undefined") return;
}

if (typeof window !== "undefined") {
  localStorage.removeItem("dokuru_csrf_token");
}
