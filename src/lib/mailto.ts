import type { ContactDoc } from "./types";

/** Where the send buttons should open the pre-filled letter. */
export type MailMode = "mailto" | "gmail";

export const MAIL_MODE_STORAGE_KEY = "melodia:mail-mode";

type MailFields = Pick<
  ContactDoc,
  "primaryEmail" | "emails" | "emailSubject" | "emailBody"
>;

function recipients(contact: MailFields): { to: string; cc: string[] } {
  const to = contact.primaryEmail ?? "";
  return { to, cc: contact.emails.filter((email) => email && email !== to) };
}

/** URLSearchParams encodes spaces as "+", which mail clients show literally. */
function query(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

export function mailtoLink(contact: MailFields): string {
  const { to, cc } = recipients(contact);
  const params = query({
    subject: contact.emailSubject,
    body: contact.emailBody,
    cc: cc.join(","),
  });
  return `mailto:${to}?${params}`;
}

/**
 * Gmail web compose window with everything pre-filled.
 * No account index in the path, so Gmail uses whichever account is signed in.
 */
export function gmailLink(contact: MailFields): string {
  const { to, cc } = recipients(contact);
  const params = query({
    view: "cm",
    fs: "1",
    tf: "1",
    to,
    su: contact.emailSubject,
    body: contact.emailBody,
    cc: cc.join(","),
  });
  return `https://mail.google.com/mail/?${params}`;
}

export function composeLink(contact: MailFields, mode: MailMode): string {
  return mode === "gmail" ? gmailLink(contact) : mailtoLink(contact);
}

export function googleSearchLink(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function companyLink(
  contact: Pick<ContactDoc, "website" | "company">,
): string {
  return contact.website ?? googleSearchLink(contact.company);
}
