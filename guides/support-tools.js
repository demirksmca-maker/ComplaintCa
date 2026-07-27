/* ComplaintCA — in-guide support tools (deadline calculator, draft letter, evidence checklist)
   Single source of truth. Include on any guide page with:
     <script src="/guides/support-tools.js" defer></script>
   and mark each relevant card with  data-dc="<category>"  (optionally data-dc-open to
   render a standalone bar). Deadlines below are conservative and each carries a note; a
   value of 9999 means "no fixed statutory deadline" and shows guidance instead of a countdown. */
(function () {
  "use strict";

  var CATS = {
    consumer: {
      label: "Consumer & Business Disputes", days: 730, deadlineLabel: "Deadline",
      resultName: "Provincial civil claim — 2-year limitation",
      note: "In most provinces you have 2 years from when you discovered the problem to start a legal claim (Limitations Act). Filing a complaint with the consumer-protection office has no strict deadline, but act early.",
      template: "To: Consumer Protection Office\n\nSubject: Formal Complaint — [Company Name]\n\nOn [date] I purchased [product/service]. The problem arose as follows: [brief description].\n\nI contacted the company [X] times but the issue was not resolved. I am requesting [refund / replacement / compensation].\n\nAttached: receipt, photos and correspondence.\n\nSincerely,\n[Full Name]",
      checklist: ["Receipt or invoice", "Photo of the product/service", "Correspondence with the company", "Warranty document (if any)"]
    },
    consumer_qc: {
      label: "Consumer Disputes (Quebec)", days: 1095, deadlineLabel: "Deadline",
      resultName: "Quebec civil claim — 3-year limitation",
      note: "In Quebec the general limitation period to sue is 3 years (Civil Code, art. 2925). A complaint to the Office de la protection du consommateur has no strict deadline, but act early.",
      template: "À : Office de la protection du consommateur\n\nObjet : Plainte formelle — [Nom de l'entreprise]\n\nLe [date], j'ai acheté [produit/service]. Le problème : [brève description].\n\nJ'ai contacté l'entreprise [X] fois sans résolution. Je demande [remboursement / remplacement / indemnisation].\n\nCordialement,\n[Nom complet]",
      checklist: ["Reçu ou facture", "Photo du produit/service", "Correspondance avec l'entreprise", "Document de garantie (le cas échéant)"]
    },
    legal: {
      label: "Legal Dispute", days: 730, deadlineLabel: "Deadline",
      resultName: "Provincial civil claim — 2-year limitation",
      note: "In most provinces you generally have 2 years from when you discovered the issue to start a legal claim (Limitations Act).",
      template: "To: ComplaintCA Lawyer Panel\n\nSubject: Request for Legal Guidance\n\nThe issue I am facing: [brief summary].\n\nSteps I have taken so far: [if any].\n\nI would like legal guidance on this matter.\n\nSincerely,\n[Full Name]",
      checklist: ["Written summary of events", "Relevant documents / contracts", "Previous correspondence", "Witness information (if any)"]
    },
    legal_qc: {
      label: "Legal Dispute (Quebec)", days: 1095, deadlineLabel: "Deadline",
      resultName: "Quebec civil claim — 3-year limitation",
      note: "In Quebec you generally have 3 years to bring a civil action (Civil Code, art. 2925).",
      template: "À : Panel d'avocats ComplaintCA\n\nObjet : Demande d'orientation juridique\n\nMon problème : [résumé].\n\nDémarches déjà entreprises : [le cas échéant].\n\nJe souhaite une orientation juridique.\n\nCordialement,\n[Nom complet]",
      checklist: ["Résumé écrit des faits", "Documents / contrats pertinents", "Correspondance antérieure", "Coordonnées des témoins (le cas échéant)"]
    },
    cyber: {
      label: "Cyber Crime — Bank Dispute", days: 120, deadlineLabel: "Recovery Window", pillLabel: "Recovery", icon: "shield",
      resultName: "Bank / card chargeback window",
      note: "Visa and Mastercard generally allow ~120 days from the transaction date to dispute a charge; for fraud this can extend up to 540 days. Confirm with your bank — and report to the Canadian Anti-Fraud Centre.",
      template: "To: [Bank] Customer Service / Fraud Department\n\nSubject: Unauthorized Transaction Dispute\n\nOn [date] I found an unauthorized transaction of [amount] on my account. I did not make this transaction and I am disputing it immediately.\n\nTransaction details: [transaction no, date, amount].\n\nPlease secure my account and reverse the transaction.\n\nSincerely,\n[Full Name]",
      checklist: ["Screenshot of the transaction", "Bank account statement", "Copy of the suspicious message/email", "Canadian Anti-Fraud Centre report number"]
    },
    municipal: {
      label: "Municipal / Ombudsman", days: 9999, deadlineLabel: "Deadline",
      resultName: "Municipal ombudsman complaint",
      note: "No strict statutory deadline, but you must usually raise the issue with the city department first and act promptly.",
      template: "To: Municipal Ombudsman\n\nSubject: Unresolved Complaint about [City Department]\n\nOn [date] I contacted [department] about [issue] (Reference No: [if any]). It is still not resolved. I request an independent review.\n\nSincerely,\n[Full Name]",
      checklist: ["Complaint reference number (if any)", "Photos / evidence", "Correspondence with the department", "Dates and times of the incident"]
    },
    provincial_dept: {
      label: "Provincial Department / Ombudsman", days: 9999, deadlineLabel: "Deadline",
      resultName: "Provincial ombudsman complaint",
      note: "No strict statutory deadline, but raise it with the department first and act promptly.",
      template: "To: Provincial Ombudsman\n\nSubject: Complaint about [Department / Public Body]\n\nOn [date] I dealt with [department] regarding [issue] (Reference: [if any]). The matter is unresolved and I request an independent review.\n\nSincerely,\n[Full Name]",
      checklist: ["Reference / file number", "Correspondence with the department", "Supporting documents", "Timeline of events"]
    },
    mp: {
      label: "Federal Service / MP", days: 9999, deadlineLabel: "Deadline",
      resultName: "Federal / MP complaint",
      note: "No strict legal deadline for contacting your MP, but raising it early speeds up the process.",
      template: "To: [Member of Parliament], MP\n\nSubject: Federal Service Issue\n\nAs a constituent in your riding, I am experiencing a problem with [federal agency]: [description]. My file/application number: [if any].\n\nI would appreciate your office intervening.\n\nSincerely,\n[Full Name]",
      checklist: ["Application / file number", "ID / proof of residence", "Relevant correspondence", "Timeline of events"]
    },
    tenancy: {
      label: "Residential Tenancy Dispute", days: 9999, deadlineLabel: "Deadline",
      resultName: "Tenancy board deadlines are short",
      note: "Tenancy deadlines are short and vary by province — for example, disputing an eviction/notice to end tenancy can be as little as 10–15 days. Contact your provincial tenancy board immediately; do not wait.",
      template: "To: [Provincial Tenancy Board]\n\nSubject: Tenancy Dispute — [Address]\n\nMy landlord [description of the issue: deposit / repairs / notice]. The relevant date is [date] and my lease clause is [clause].\n\nI am requesting [remedy].\n\nSincerely,\n[Full Name]",
      checklist: ["Written lease/agreement", "Photos of the disputed condition (timestamped)", "All texts/emails/notices with the landlord", "Deposit / rent payment records"]
    },
    humanrights: {
      label: "Human Rights Complaint", days: 365, deadlineLabel: "Deadline",
      resultName: "Human rights application — 1-year limit",
      note: "Human rights tribunals (Ontario HRTO, provincial commissions, and the federal Canadian Human Rights Commission) generally require you to file within 1 year of the last incident. Late filings are rarely accepted.",
      template: "To: [Human Rights Tribunal / Commission]\n\nSubject: Human Rights Application\n\nI experienced discrimination/harassment based on [ground] on [date(s)], as follows: [description].\n\nI am filing within the 1-year limitation period and request that this be reviewed.\n\nSincerely,\n[Full Name]",
      checklist: ["Dates of each incident", "Witness names/contacts", "Emails, texts, notes", "The protected ground (e.g. disability, race, sex)"]
    },
    employment: {
      label: "Workplace Complaint", days: 9999, deadlineLabel: "Deadline",
      resultName: "Employment deadlines vary",
      note: "Deadlines vary: most provinces give ~2 years to recover unpaid wages through employment standards; federally regulated complaints are often shorter. Workplace discrimination goes to a human rights tribunal within 1 year. Act promptly and confirm with the relevant body.",
      template: "To: [Employment Standards Office]\n\nSubject: Employment Standards Complaint — [Employer]\n\nI worked at [employer] from [dates]. The issue: [unpaid wages / termination / hours]. Amount owed (if any): [amount].\n\nI am requesting an investigation.\n\nSincerely,\n[Full Name]",
      checklist: ["Employment contract / offer letter", "Pay stubs / records of hours", "Termination letter (if any)", "Correspondence with the employer"]
    },
    healthcare: {
      label: "Healthcare Complaint", days: 9999, deadlineLabel: "Deadline",
      resultName: "Healthcare complaint",
      note: "No single statutory countdown, but complaints to a hospital's patient-relations office or a provincial body are best filed promptly while records are fresh.",
      template: "To: [Hospital Patient Relations / Provincial Health Body]\n\nSubject: Complaint about care received\n\nOn [date] at [facility] I received [description of the care and concern]. The staff involved: [if known].\n\nI am requesting a review and response.\n\nSincerely,\n[Full Name]",
      checklist: ["Dates and facility name", "Names of staff involved (if known)", "Copies of records / discharge notes", "A written summary of what happened"]
    },
    doctor_conduct: {
      label: "Doctor's Conduct", days: 9999, deadlineLabel: "Deadline",
      resultName: "College of Physicians complaint",
      note: "Complaints about a physician's conduct go to your provincial College of Physicians and Surgeons. There is no strict deadline, but file promptly.",
      template: "To: College of Physicians and Surgeons of [Province]\n\nSubject: Complaint about Dr. [Name]\n\nOn [date] Dr. [Name] at [clinic/hospital] [description of the conduct/concern].\n\nI am requesting that the College review this matter.\n\nSincerely,\n[Full Name]",
      checklist: ["Doctor's full name and clinic", "Dates of the visits", "Records / prescriptions", "Written account of the concern"]
    },
    cra_objection: {
      label: "CRA — Notice of Objection", days: 90, deadlineLabel: "Deadline",
      resultName: "CRA objection — 90-day window",
      note: "For individuals, the deadline is the LATER of 90 days from the date of your Notice of Assessment, or one year after your filing due date. This counts 90 days from the assessment date (the earliest bound) — you may have longer, but do not rely on it.",
      template: "To: Canada Revenue Agency — Appeals\n\nSubject: Notice of Objection\n\nI object to the [assessment/reassessment] dated [date] for the [year] tax year.\n\nReasons: [explain why you disagree].\n\nRelevant facts: [facts]. Supporting documents attached.\n\nSincerely,\n[Full Name], SIN [xxx]",
      checklist: ["Your Notice of Assessment (with date)", "The tax year in dispute", "Reasons you disagree", "Supporting documents/receipts"]
    },
    cra_service: {
      label: "CRA — Service Complaint", days: 9999, deadlineLabel: "Deadline",
      resultName: "CRA Service Feedback",
      note: "A complaint about how CRA treated you (Service Feedback, then the Taxpayers' Ombudsperson) has no strict deadline, but file while details are fresh. This is separate from objecting to an assessment.",
      template: "To: CRA Service Feedback Program\n\nSubject: Service Complaint\n\nOn [date] I dealt with a CRA agent/service regarding [matter]. The problem: [description].\n\nI am requesting that this service issue be reviewed.\n\nSincerely,\n[Full Name]",
      checklist: ["Date and channel of contact (phone/mail)", "Agent ID or reference (if any)", "What went wrong", "Any correspondence"]
    },
    airline: {
      label: "Airline Complaint", days: 365, deadlineLabel: "Claim Deadline", pillLabel: "Deadline",
      resultName: "Airline compensation claim — 1 year",
      note: "To claim compensation for a delay/cancellation you must file with the airline in writing within 1 year of the flight. The airline has 30 days to respond; if unsatisfied you can then escalate to the Canadian Transportation Agency (CTA).",
      template: "To: [Airline] Customer Relations\n\nSubject: APPR Compensation Claim — Flight [number], [date]\n\nMy flight [number] on [date] from [origin] to [destination] was [delayed/cancelled/denied boarding] by [duration]. Under the Air Passenger Protection Regulations I am claiming [compensation/refund].\n\nBooking reference: [PNR].\n\nSincerely,\n[Full Name]",
      checklist: ["Booking reference (PNR) and ticket", "Flight number and date", "Proof of delay/cancellation (email/screenshot)", "Boarding passes / receipts for expenses"]
    },
    banking: {
      label: "Banking Complaint — OBSI", days: 180, deadlineLabel: "Escalation Deadline", pillLabel: "Deadline",
      resultName: "OBSI escalation — 180 days",
      note: "First complain to the bank and let its process run (up to 56 days). If unsatisfied, you generally have 180 days from the bank's final response to escalate to OBSI (free).",
      template: "To: [Bank] — Complaints / Ombudsman\n\nSubject: Formal Complaint\n\nOn [date] I experienced [issue: fees / error / service]. Account: [xxxx]. I contacted the bank on [dates] but the matter is unresolved.\n\nI am requesting a final resolution before escalating to OBSI.\n\nSincerely,\n[Full Name]",
      checklist: ["Account/reference number", "The bank's final response letter", "Statements showing the issue", "Dates of each contact"]
    },
    telecom: {
      label: "Telecom / TV — CCTS", days: 365, deadlineLabel: "Deadline",
      resultName: "CCTS complaint window",
      note: "The Commission for Complaints for Telecom-Television Services (CCTS) generally handles issues that arose within the last 12 months. Complain to your provider first; if unresolved, file with the CCTS (free).",
      template: "To: [Provider] — Complaints\n\nSubject: Formal Complaint — Account [number]\n\nSince [date] I have had [billing / service / contract] issue: [description]. I contacted the provider on [dates] without resolution.\n\nIf unresolved I will file with the CCTS.\n\nSincerely,\n[Full Name]",
      checklist: ["Account number", "Bills showing the disputed charge", "Contract / plan terms", "Dates of each contact"]
    },
    insurance: {
      label: "Insurance Complaint", days: 9999, deadlineLabel: "Deadline",
      resultName: "Insurance ombudservice",
      note: "First get your insurer's final position in writing. Then escalate to the General Insurance OmbudService (GIO, home/auto) or the OmbudService for Life & Health Insurance (OLHI). Act promptly after the final position — timelines can apply.",
      template: "To: [Insurer] — Complaints / Ombudsperson\n\nSubject: Complaint — Policy [number]\n\nMy claim [number] for [event] on [date] was [denied/underpaid]. I disagree because [reasons].\n\nI am requesting your final written position before escalating to the ombudservice.\n\nSincerely,\n[Full Name]",
      checklist: ["Policy number and claim number", "The insurer's decision letter", "Your evidence of the loss", "Correspondence with the adjuster"]
    },
    wsib: {
      label: "Workers' Compensation Appeal", days: 180, deadlineLabel: "Appeal Deadline", pillLabel: "Deadline",
      resultName: "Workers' comp appeal — ~6 months",
      note: "Most provinces require you to object/appeal a workers' compensation decision within about 6 months of the decision letter (e.g. Ontario WSIB Intent to Object; then WSIAT). Deadlines vary — confirm with your board and act fast.",
      template: "To: [Workers' Compensation Board]\n\nSubject: Intent to Object / Appeal — Claim [number]\n\nI am objecting to the decision dated [date] denying/reducing my claim [number].\n\nReasons: [why the decision is wrong]. Supporting medical evidence attached.\n\nSincerely,\n[Full Name]",
      checklist: ["The decision letter (with date)", "Claim number", "Medical reports supporting your injury", "Reasons the decision is wrong"]
    },
    immigration: {
      label: "Immigration Delay", days: 9999, deadlineLabel: "Deadline",
      resultName: "IRCC delay escalation",
      note: "There is no complaint 'deadline' for a delayed application — the trigger is the posted processing time. Once yours is past it: submit a Case Specific Enquiry, then contact your MP, and (last resort) consider a Federal Court mandamus.",
      template: "To: [Member of Parliament], MP\n\nSubject: Delayed IRCC Application — [type]\n\nMy [application type] (number [UCI/app no]) was submitted on [date]. IRCC's posted processing time is [X]; it is now past that with no decision.\n\nI request your office's help to obtain a status update.\n\nSincerely,\n[Full Name]",
      checklist: ["Application/UCI number", "Date submitted + posted processing time", "Any GCKey / portal messages", "Proof you are past the processing time"]
    },
    canadapost: {
      label: "Canada Post Complaint", days: 9999, deadlineLabel: "Deadline",
      resultName: "Canada Post Ombudsman",
      note: "Open a service ticket with Canada Post first — the Ombudsman is the final appeal, not the first step, and needs a closed ticket. No strict deadline, but file while tracking details are available.",
      template: "To: Canada Post — Customer Service\n\nSubject: Service Complaint — Tracking [number]\n\nMy item (tracking [number]) sent on [date] was [lost/delayed/damaged]. Expected delivery: [date].\n\nI am requesting an investigation and, if unresolved, will appeal to the Ombudsman.\n\nSincerely,\n[Full Name]",
      checklist: ["Tracking number", "Proof of mailing / receipt", "Photos if item was damaged", "The support ticket number once opened"]
    },
    chargeback: {
      label: "Online Purchase Dispute", days: 100, deadlineLabel: "Chargeback Window", pillLabel: "Deadline", icon: "shield",
      resultName: "Credit card chargeback window",
      note: "Chargeback deadlines vary by card network and issuer, but are commonly in the 90–120 day range from the transaction date. This estimate uses 100 days as a mid-range figure — confirm the exact deadline with your card issuer and don't wait.",
      template: "To: [Merchant] Customer Service\n\nSubject: Order Not Received / Not As Described — Order [number]\n\nI ordered [item] on [date] (Order #[number], $[amount]). [It never arrived / It arrived significantly different from described: describe].\n\nI am requesting a full refund within [X] days, after which I will file a chargeback with my card issuer.\n\nSincerely,\n[Full Name]",
      checklist: ["Order confirmation and receipt", "Payment method used (credit/debit)", "Tracking information (if any)", "Screenshots of the listing/description", "Your message(s) to the merchant"]
    },
    debtcollector: {
      label: "Debt Collector Complaint", days: 9999, deadlineLabel: "Deadline",
      resultName: "Provincial collection agency complaint",
      note: "No strict statutory deadline to report a collector's conduct, but file promptly with dates and details while they're fresh. If it's a bank collecting its own debt directly (not a third-party agency), also consider the Financial Consumer Agency of Canada.",
      template: "To: [Collector / Agency Name] — cc: [Provincial Consumer Protection Office]\n\nSubject: Formal Complaint — Collection Conduct\n\nOn [date(s)], your agency contacted me regarding [debt/account]. The following occurred: [describe: excessive calls, workplace contact after being told not to, threats, etc.].\n\nI am requesting that all further contact be in writing only [or: through my lawyer, [name]]. I am also filing a complaint about this conduct with [provincial regulator].\n\nSincerely,\n[Full Name]",
      checklist: ["Dates and times of each contact", "Collector's agency name and licence number", "Notes on what was said", "Any voicemails or messages saved", "Account/reference number they cited"]
    },
    utility: {
      label: "Utility Billing Complaint", days: 9999, deadlineLabel: "Deadline",
      resultName: "Energy regulator complaint",
      note: "No strict statutory deadline, but you must file with your utility's own complaints process first — regulators like the OEB, BCUC, AUC, or Régie de l'énergie expect proof of that attempt before they'll review an escalation.",
      template: "To: [Utility Name] — Customer Service / Complaints\n\nSubject: Billing Dispute — Account [number]\n\nMy account [number] shows [describe: an unexplained increase / a billing error / a service issue] starting [date]. I have reviewed my usage and believe this is incorrect because [reason].\n\nI am requesting a review and correction. If unresolved, I will escalate to [OEB/BCUC/AUC/Régie de l'énergie].\n\nSincerely,\n[Full Name]",
      checklist: ["Account number", "Recent bills showing the disputed charge", "Meter reading photos (if relevant)", "Dates of any outages or service issues", "Prior correspondence with the utility"]
    }
  };

  var ns = "http://www.w3.org/2000/svg";
  function icon(name) {
    var p = {
      clock: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 16 14"></polyline>',
      doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="13" y2="17"></line>',
      check: '<polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',
      shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"></path><line x1="12" y1="8" x2="12" y2="13"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'
    };
    return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">' + (p[name] || p.clock) + "</svg>";
  }

  var CSS = [
    ".dc-pill-row{display:flex;gap:4px;flex-wrap:nowrap;margin-top:12px}",
    ".dc-pill{display:flex;align-items:center;justify-content:center;gap:4px;flex:1 1 0;min-width:0;background:linear-gradient(135deg,#1fc8db,#0e9cb5);border:none;border-radius:10px;padding:6px 6px;cursor:pointer;font-family:'Inter',sans-serif;-webkit-tap-highlight-color:transparent;box-shadow:0 2px 7px rgba(14,156,181,.28);transition:filter .15s}",
    ".dc-pill:hover,.dc-pill:active{filter:brightness(1.06)}",
    ".dc-pill .dc-pi{display:flex;color:#fff;flex-shrink:0}.dc-pill .dc-pi svg{display:block}",
    ".dc-pill .dc-pl{color:#fff;font-size:.62rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".dc-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:1000;opacity:0;pointer-events:none;transition:opacity .25s}",
    ".dc-backdrop.open{opacity:1;pointer-events:auto}",
    ".dc-sheet{position:fixed;left:0;right:0;bottom:0;z-index:1001;background:#fff;border-radius:20px 20px 0 0;max-width:640px;margin:0 auto;box-shadow:0 -8px 30px rgba(15,41,82,.25);transform:translateY(100%);transition:transform .28s cubic-bezier(.32,.72,0,1);max-height:88vh;overflow-y:auto;padding:10px 22px 26px;font-family:'Inter',sans-serif}",
    ".dc-sheet.open{transform:translateY(0)}",
    ".dc-handle{width:38px;height:4px;background:var(--border);border-radius:3px;margin:0 auto 14px}",
    ".dc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}",
    ".dc-head-l{display:flex;align-items:center;gap:10px;min-width:0}",
    ".dc-hi{width:32px;height:32px;border-radius:9px;flex-shrink:0;background:linear-gradient(135deg,var(--blue),var(--navy));display:flex;align-items:center;justify-content:center;color:#fff}.dc-hi svg{display:block}",
    ".dc-sheet h3{margin:0;font-size:.96rem;font-weight:700;color:var(--navy);line-height:1.3;font-family:'Inter',sans-serif}",
    ".dc-x{background:var(--off);border:none;border-radius:50%;width:30px;height:30px;color:var(--muted);font-size:1rem;cursor:pointer;flex-shrink:0}",
    ".dc-tabs{display:flex;gap:6px;margin:16px 0 18px;border-bottom:1px solid var(--border)}",
    ".dc-tab{flex:1;background:none;border:none;padding:9px 4px 11px;cursor:pointer;font-size:.72rem;font-weight:700;color:var(--muted);border-bottom:2.5px solid transparent;margin-bottom:-1px;text-align:center;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px}.dc-tab svg{display:block}",
    ".dc-tab.on{color:var(--navy);border-bottom-color:var(--blue)}",
    ".dc-panel{display:none}.dc-panel.on{display:block}",
    ".dc-field{margin-bottom:14px}",
    ".dc-field label{display:block;font-size:.72rem;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}",
    ".dc-field input[type=date]{width:100%;border:1.5px solid var(--border);border-radius:9px;padding:11px 12px;font-size:.9rem;font-family:'Inter',sans-serif;background:var(--off);color:var(--text)}",
    ".dc-field input:focus{outline:none;border-color:var(--blue);background:#fff}",
    ".dc-go{width:100%;background:linear-gradient(135deg,var(--blue),var(--navy));border:none;border-radius:10px;color:#fff;font-family:'Inter',sans-serif;font-weight:700;font-size:.85rem;padding:13px;cursor:pointer;box-shadow:0 3px 10px rgba(26,79,160,.3)}",
    ".dc-res{margin-top:16px;border-radius:12px;padding:15px 16px;display:none;border:1.5px solid var(--border)}.dc-res.on{display:block}",
    ".dc-rt{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px}",
    ".dc-rd{font-family:'Cinzel',serif;font-weight:900;font-size:1.7rem;line-height:1}",
    ".dc-rlbl{font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:3px}",
    ".dc-rb{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:5px 10px;border-radius:20px;color:#fff;white-space:nowrap}",
    ".dc-rdet{font-size:.82rem;color:var(--sub);line-height:1.6;border-top:1px dashed var(--border);padding-top:9px}.dc-rdet b{color:var(--text)}",
    ".dc-res.ok{background:#f0faf4;border-color:#bfe6cc}.dc-res.ok .dc-rd{color:#1a8a52}.dc-res.ok .dc-rb{background:#1a8a52}",
    ".dc-res.warn{background:#fdf7ea;border-color:#eeddb0}.dc-res.warn .dc-rd{color:#b8863a}.dc-res.warn .dc-rb{background:#b8863a}",
    ".dc-res.bad{background:#fdeeee;border-color:#f0c4c4}.dc-res.bad .dc-rd{color:var(--crimson)}.dc-res.bad .dc-rb{background:var(--crimson)}",
    ".dc-foot{font-size:.7rem;color:var(--muted);margin-top:12px;text-align:center}",
    ".dc-remind{width:100%;margin-top:10px;background:#fff;border:1.3px solid var(--blue);border-radius:9px;color:var(--blue);font-size:.76rem;font-weight:700;padding:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;font-family:'Inter',sans-serif}",
    ".dc-toast{display:none;margin-top:8px;font-size:.72rem;color:#1a8a52;text-align:center;font-weight:600}.dc-toast.on{display:block}",
    ".dc-tpl{background:var(--off);border:1px solid var(--border);border-radius:10px;padding:14px 15px;font-size:.82rem;color:var(--text);line-height:1.7;white-space:pre-wrap;margin-bottom:12px;max-height:260px;overflow-y:auto}.dc-tpl .ph{color:var(--blue);font-weight:600}",
    ".dc-copy{width:100%;background:linear-gradient(135deg,var(--blue),var(--navy));border:none;border-radius:9px;color:#fff;font-size:.8rem;font-weight:700;padding:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;font-family:'Inter',sans-serif}",
    ".dc-chk{display:flex;flex-direction:column;gap:9px}",
    ".dc-ci{display:flex;align-items:center;gap:10px;background:var(--off);border:1px solid var(--border);border-radius:9px;padding:11px 13px;cursor:pointer}",
    ".dc-ci input{width:17px;height:17px;accent-color:var(--blue);flex-shrink:0}",
    ".dc-ci span{font-size:.84rem;color:var(--text)}",
    ".dc-ci.done{opacity:.5}.dc-ci.done span{text-decoration:line-through}"
  ].join("\n");

  var cur = "consumer";

  function el(id) { return document.getElementById(id); }

  function buildSheet() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="dc-backdrop" id="dc-bd"></div>' +
      '<div class="dc-sheet" id="dc-sh" role="dialog" aria-modal="true">' +
        '<div class="dc-handle"></div>' +
        '<div class="dc-head"><div class="dc-head-l"><div class="dc-hi">' + icon("clock") + '</div><h3 id="dc-title">—</h3></div>' +
        '<button class="dc-x" id="dc-close" aria-label="Close">&times;</button></div>' +
        '<div class="dc-tabs">' +
          '<button class="dc-tab" id="dc-t-d">' + icon("clock") + '<span id="dc-t-d-l">Deadline</span></button>' +
          '<button class="dc-tab" id="dc-t-t">' + icon("doc") + 'Draft Letter</button>' +
          '<button class="dc-tab" id="dc-t-c">' + icon("check") + 'What You Need</button>' +
        '</div>' +
        '<div class="dc-panel" id="dc-p-d">' +
          '<div class="dc-field"><label for="dc-date">Date of the incident / decision</label><input type="date" id="dc-date"></div>' +
          '<button class="dc-go" id="dc-go">Calculate my deadline &rarr;</button>' +
          '<div class="dc-res" id="dc-res"><div class="dc-rt"><div><div class="dc-rd" id="dc-days">—</div><div class="dc-rlbl">days left</div></div>' +
          '<div class="dc-rb" id="dc-badge">—</div></div><div class="dc-rdet" id="dc-det"></div>' +
          '<button class="dc-remind" id="dc-remind">' + icon("bell") + 'Remind me of this date</button><div class="dc-toast" id="dc-rtoast">Reminder set (demo) &#10003;</div></div>' +
          '<div class="dc-foot">This is an estimate — always confirm the exact rules with the authority itself.</div>' +
        '</div>' +
        '<div class="dc-panel" id="dc-p-t"><div class="dc-tpl" id="dc-tpl"></div><button class="dc-copy" id="dc-copy">' + icon("copy") + 'Copy this draft</button><div class="dc-toast" id="dc-ctoast">Copied &#10003;</div></div>' +
        '<div class="dc-panel" id="dc-p-c"><div class="dc-chk" id="dc-chk"></div></div>' +
      '</div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    el("dc-bd").addEventListener("click", close);
    el("dc-close").addEventListener("click", close);
    el("dc-t-d").addEventListener("click", function () { tab("d"); });
    el("dc-t-t").addEventListener("click", function () { tab("t"); });
    el("dc-t-c").addEventListener("click", function () { tab("c"); });
    el("dc-go").addEventListener("click", calc);
    el("dc-remind").addEventListener("click", function () { el("dc-rtoast").classList.add("on"); });
    el("dc-copy").addEventListener("click", copy);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function open(key, which) {
    if (!CATS[key]) return;
    cur = key;
    var c = CATS[key];
    el("dc-title").textContent = c.label;
    el("dc-t-d-l").textContent = c.deadlineLabel || "Deadline";
    el("dc-res").classList.remove("on");
    el("dc-rtoast").classList.remove("on");
    el("dc-ctoast").classList.remove("on");
    el("dc-date").value = "";
    renderTpl(key);
    renderChk(key);
    tab(which || "d");
    el("dc-bd").classList.add("open");
    el("dc-sh").classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function close() {
    el("dc-bd").classList.remove("open");
    el("dc-sh").classList.remove("open");
    document.body.style.overflow = "";
  }
  function tab(w) {
    ["d", "t", "c"].forEach(function (t) {
      el("dc-t-" + t).classList.toggle("on", t === w);
      el("dc-p-" + t).classList.toggle("on", t === w);
    });
  }
  function calc() {
    var c = CATS[cur];
    var v = el("dc-date").value;
    var box = el("dc-res");
    if (!v) { el("dc-date").style.borderColor = "var(--crimson)"; return; }
    el("dc-date").style.borderColor = "";
    var start = new Date(v + "T00:00:00");
    var dl = new Date(start); dl.setDate(dl.getDate() + c.days);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var left = Math.round((dl - today) / 86400000);
    box.classList.remove("ok", "warn", "bad");
    var badge;
    if (c.days >= 9999) { box.classList.add("ok"); badge = "No fixed deadline"; }
    else if (left < 0) { box.classList.add("bad"); badge = "Passed"; }
    else if (left <= 30) { box.classList.add("bad"); badge = "Urgent"; }
    else if (left <= 90) { box.classList.add("warn"); badge = "Approaching"; }
    else { box.classList.add("ok"); badge = "You have time"; }
    el("dc-days").textContent = c.days >= 9999 ? "∞" : (left < 0 ? "0" : left);
    el("dc-badge").textContent = badge;
    var ds = dl.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
    el("dc-det").innerHTML = "<b>" + c.resultName + "</b>" +
      (c.days >= 9999 ? "<br>" + c.note :
        "<br>Estimated final date: <b>" + ds + "</b><br>" + c.note +
        (left < 0 ? "<br><b>This window may have passed</b> — contact the authority anyway; some allow exceptions." : ""));
    box.classList.add("on");
    el("dc-rtoast").classList.remove("on");
  }
  function renderTpl(key) {
    var c = CATS[key];
    var esc = c.template.replace(/[&<>]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]; });
    el("dc-tpl").innerHTML = esc.replace(/\[([^\]]+)\]/g, '<span class="ph">[$1]</span>');
    el("dc-ctoast").classList.remove("on");
  }
  function copy() {
    var c = CATS[cur];
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c.template).catch(function () {});
    el("dc-ctoast").classList.add("on");
  }
  function renderChk(key) {
    var c = CATS[key];
    var list = el("dc-chk");
    list.innerHTML = "";
    c.checklist.forEach(function (item) {
      var row = document.createElement("label");
      row.className = "dc-ci";
      var cb = document.createElement("input"); cb.type = "checkbox";
      cb.addEventListener("change", function () { row.classList.toggle("done", cb.checked); });
      var sp = document.createElement("span"); sp.textContent = item;
      row.appendChild(cb); row.appendChild(sp);
      list.appendChild(row);
    });
  }

  function pill(key, which, label, ic) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "dc-pill";
    b.innerHTML = '<span class="dc-pi">' + icon(ic) + '</span><span class="dc-pl">' + label + "</span>";
    b.addEventListener("click", function () { open(key, which); });
    return b;
  }

  function attach() {
    var nodes = document.querySelectorAll("[data-dc]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute("data-dc");
      if (!CATS[key] || node.querySelector(".dc-pill-row")) continue;
      var c = CATS[key];
      var row = document.createElement("div");
      row.className = "dc-pill-row";
      row.appendChild(pill(key, "d", c.pillLabel || c.deadlineLabel || "Deadline", c.icon === "shield" ? "shield" : "clock"));
      row.appendChild(pill(key, "t", "Draft Letter", "doc"));
      row.appendChild(pill(key, "c", "Checklist", "check"));
      node.appendChild(row);
    }
  }

  function init() { buildSheet(); attach(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
