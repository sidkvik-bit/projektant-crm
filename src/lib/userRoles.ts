/** Platform Superadmin je role NAD všemi organizacemi (přístup do /admin sekce). System
 * Customizer smí upravovat svou firmu — vrstvu úprav (Nastavení → Přizpůsobení); Platform
 * Superadmin to smí taky. Basic User appku jen používá. Zvlášť od currentUser.ts, ať jde
 * importovat i z klientských komponent. */
export type UserRole = "Basic User" | "System Customizer" | "Platform Superadmin";

export const USER_ROLES: UserRole[] = ["Basic User", "System Customizer", "Platform Superadmin"];
