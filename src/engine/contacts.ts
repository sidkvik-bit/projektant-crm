export interface ContactLike {
  first_name?: string | null;
  last_name?: string | null;
}

/**
 * Jméno kontaktu do mřížek, karet a dokladů. Stejné složení, jaké má Contact v entityRegistry
 * (`labelFields: ["first_name", "last_name"]`), jen na jednom místě — kontakt je nově klientem
 * projektu i odběratelem na dokladech, takže se to skládá na spoustě míst.
 */
export function formatContactName(contact: ContactLike | null | undefined): string {
  if (!contact) return "—";
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  return name || "—";
}
