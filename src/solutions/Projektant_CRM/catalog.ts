import { buildStatusViews } from "@/engine/statusViews";
import type { EntityDefinition, FormDefinition, ViewDefinition, ViewTemplate } from "@/engine/types";

import AccountEntity from "./Entities/Account/Entity.json";
import AccountForm from "./Entities/Account/FormXml/main_form.json";
import AccountTemplate from "./Entities/Account/SavedQueries/active_accounts.json";
import AccountMy from "./Entities/Account/SavedQueries/my_accounts.json";
import ActivityEntity from "./Entities/Activity/Entity.json";
import ActivityForm from "./Entities/Activity/FormXml/main_form.json";
import ActivityTemplate from "./Entities/Activity/SavedQueries/active_activities.json";
import ActivityMy from "./Entities/Activity/SavedQueries/my_activities.json";
import BugEntity from "./Entities/Bug/Entity.json";
import BugForm from "./Entities/Bug/FormXml/main_form.json";
import BugTemplate from "./Entities/Bug/SavedQueries/active_bugs.json";
import BugMy from "./Entities/Bug/SavedQueries/my_bugs.json";
import ContactEntity from "./Entities/Contact/Entity.json";
import ContactForm from "./Entities/Contact/FormXml/main_form.json";
import ContactTemplate from "./Entities/Contact/SavedQueries/active_contacts.json";
import ContactMy from "./Entities/Contact/SavedQueries/my_contacts.json";
import InvoiceEntity from "./Entities/Invoice/Entity.json";
import InvoiceForm from "./Entities/Invoice/FormXml/main_form.json";
import InvoiceTemplate from "./Entities/Invoice/SavedQueries/active_invoices.json";
import InvoiceMy from "./Entities/Invoice/SavedQueries/my_invoices.json";
import LeadEntity from "./Entities/Lead/Entity.json";
import LeadForm from "./Entities/Lead/FormXml/main_form.json";
import LeadTemplate from "./Entities/Lead/SavedQueries/active_leads.json";
import LeadMy from "./Entities/Lead/SavedQueries/my_leads.json";
import ProjectEntity from "./Entities/Project/Entity.json";
import ProjectForm from "./Entities/Project/FormXml/main_form.json";
import ProjectTemplate from "./Entities/Project/SavedQueries/active_projects.json";
import ProjectMy from "./Entities/Project/SavedQueries/my_projects.json";
import ProjectTemplateEntity from "./Entities/ProjectTemplate/Entity.json";
import ProjectTemplateForm from "./Entities/ProjectTemplate/FormXml/main_form.json";
import ProjectTemplateTemplate from "./Entities/ProjectTemplate/SavedQueries/active_project_templates.json";
import ProjectTemplateMy from "./Entities/ProjectTemplate/SavedQueries/my_project_templates.json";
import QuoteEntity from "./Entities/Quote/Entity.json";
import QuoteForm from "./Entities/Quote/FormXml/main_form.json";
import QuoteTemplate from "./Entities/Quote/SavedQueries/active_quotes.json";
import QuoteMy from "./Entities/Quote/SavedQueries/my_quotes.json";

/** Entita základního řešení se vším, co z ní vidí stránky — pro studio úprav a validaci. */
export interface BaseEntityEntry {
  entity: EntityDefinition;
  form: FormDefinition;
  views: ViewDefinition[];
}

function entry(entity: unknown, form: unknown, template: unknown, my: unknown): BaseEntityEntry {
  const e = entity as EntityDefinition;
  return {
    entity: e,
    form: form as FormDefinition,
    views: [...buildStatusViews(e, template as ViewTemplate), my as ViewDefinition],
  };
}

/**
 * Katalog základního řešení (src/solutions/Projektant_CRM) — stejné JSONy, jaké importují
 * stránky entit. Nová entita základu = řádek sem, jinak ji vrstva úprav firmy neuvidí.
 */
export const baseCatalog: Record<string, BaseEntityEntry> = {
  Account: entry(AccountEntity, AccountForm, AccountTemplate, AccountMy),
  Activity: entry(ActivityEntity, ActivityForm, ActivityTemplate, ActivityMy),
  Bug: entry(BugEntity, BugForm, BugTemplate, BugMy),
  Contact: entry(ContactEntity, ContactForm, ContactTemplate, ContactMy),
  Invoice: entry(InvoiceEntity, InvoiceForm, InvoiceTemplate, InvoiceMy),
  Lead: entry(LeadEntity, LeadForm, LeadTemplate, LeadMy),
  Project: entry(ProjectEntity, ProjectForm, ProjectTemplate, ProjectMy),
  ProjectTemplate: entry(ProjectTemplateEntity, ProjectTemplateForm, ProjectTemplateTemplate, ProjectTemplateMy),
  Quote: entry(QuoteEntity, QuoteForm, QuoteTemplate, QuoteMy),
};
