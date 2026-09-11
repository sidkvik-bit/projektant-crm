import { Mail, CalendarPlus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * `mail.google.com`'s own compose URL — ne `mailto:`, protože ten otevře cokoliv je nastavené
 * jako OS výchozí (často ne Gmail vůbec) a appka nemá vlastní odesílání e-mailů. Stejný přístup
 * jako CalendarLink níž (skutečná Google web URL, ne obecný OS handler).
 */
export function EmailLink({
  email,
  subject,
  body,
  label = "Napsat e-mail",
}: {
  email: string | null;
  subject?: string;
  body?: string | null;
  label?: string;
}) {
  if (!email) return null;
  const params = new URLSearchParams({ view: "cm", fs: "1", to: email });
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  const href = `https://mail.google.com/mail/?${params.toString()}`;
  return (
    <Button
      variant="outline"
      size="sm"
      render={
        <a href={href} target="_blank" rel="noreferrer">
          <Mail className="size-4" />
          {label}
        </a>
      }
    />
  );
}

export function CalendarLink({
  title,
  guestEmail,
  details,
  label = "Nová schůzka",
}: {
  title: string;
  guestEmail?: string | null;
  details?: string | null;
  label?: string;
}) {
  const params = new URLSearchParams({ action: "TEMPLATE", text: title });
  if (guestEmail) params.set("add", guestEmail);
  if (details) params.set("details", details);
  const href = `https://calendar.google.com/calendar/render?${params.toString()}`;
  return (
    <Button
      variant="outline"
      size="sm"
      render={
        <a href={href} target="_blank" rel="noreferrer">
          <CalendarPlus className="size-4" />
          {label}
        </a>
      }
    />
  );
}

export function DriveLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      render={
        <a href={url} target="_blank" rel="noreferrer">
          <FolderOpen className="size-4" />
          Otevřít složku projektu
        </a>
      }
    />
  );
}
