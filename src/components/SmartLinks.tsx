import { Mail, CalendarPlus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmailLink({ email, subject }: { email: string | null; subject?: string }) {
  if (!email) return null;
  const href = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return (
    <Button
      variant="outline"
      size="sm"
      render={
        <a href={href}>
          <Mail className="size-4" />
          Napsat e-mail
        </a>
      }
    />
  );
}

export function CalendarLink({ title, guestEmail }: { title: string; guestEmail?: string | null }) {
  const params = new URLSearchParams({ action: "TEMPLATE", text: title });
  if (guestEmail) params.set("add", guestEmail);
  const href = `https://calendar.google.com/calendar/render?${params.toString()}`;
  return (
    <Button
      variant="outline"
      size="sm"
      render={
        <a href={href} target="_blank" rel="noreferrer">
          <CalendarPlus className="size-4" />
          Nová schůzka
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
