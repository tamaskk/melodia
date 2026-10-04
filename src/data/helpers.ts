export function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function linkedinSearch(name: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    name,
  )}`;
}

export function blank(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

/** Best-effort company website from an email domain. */
export function websiteFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  const generic = [
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
  ];
  if (generic.includes(domain)) return null;
  return `https://${domain}`;
}
