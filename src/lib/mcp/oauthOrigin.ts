/**
 * Veřejná adresa serveru. Za proxy (Vercel) `request.url` ukazuje na vnitřní host, takže se
 * vychází z forwardovaných hlaviček — OAuth metadata i redirecty musí nést adresu, na kterou
 * se klient reálně dovolá, jinak discovery neprojde.
 */
export function publicOrigin(request: Request) {
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
