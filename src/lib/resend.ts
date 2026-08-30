import { Resend } from "resend";

export function createResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

// Sandbox adresa Resend — funguje bez ověřené domény, ale doručí jen na e-mail
// registrovaný k tvému Resend účtu. Až bude ověřená vlastní doména, přepnout.
export const DIGEST_FROM_ADDRESS = "Projektant CRM <onboarding@resend.dev>";
