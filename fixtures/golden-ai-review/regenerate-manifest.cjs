/* eslint-disable no-console */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.join(__dirname, "..", "..");
const outPath = path.join(__dirname, "scenarios.manifest.json");

const tracked = new Set(
  execFileSync("git", ["ls-files", "-z", "--", "Test AI/"], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean),
);

/** @param {string} ref */
function gitTracked(ref) {
  return tracked.has(ref);
}

/** @param {string} f */
function T(f) {
  return `Test AI/${f}`;
}

const scenarios = [
  { id: "G01", title: "Finální životní pojistná smlouva", documentFamily: "life_insurance", expectedPrimaryType: "life_insurance_final_contract", publishableAsContract: true, referenceFile: T("30. Pojistná smlouva c. 3282140369.pdf"), coversCorpusIds: ["C002"] },
  { id: "G02", title: "Modelace / návrh životního pojištění", documentFamily: "life_insurance", expectedPrimaryType: "life_insurance_modelation", publishableAsContract: false, referenceFile: T("33543904_Modelace zivotniho pojisteni.pdf"), coversCorpusIds: ["C003", "C007", "C011", "C013"] },
  { id: "G03", title: "Bundle smlouva + zdravotní dotazníky", documentFamily: "life_insurance", expectedPrimaryType: "life_insurance_investment_contract", publishableAsContract: "partial", referenceFile: T("Hanna Havdan GČP.pdf"), coversCorpusIds: ["C009", "C014", "C027"] },
  { id: "G04", title: "Více osob na smlouvě", documentFamily: "life_insurance", expectedPrimaryType: "life_insurance_proposal", publishableAsContract: true, referenceFile: T("Lehnert Metlife.pdf"), coversCorpusIds: ["C008", "C009"] },
  { id: "G05", title: "Investice / DIP / DPS", documentFamily: "investment", expectedPrimaryType: "investment_subscription_document", publishableAsContract: true, referenceFile: T("AMUNDI PLATFORMA - účet CZ KLASIK - DIP (4).pdf"), coversCorpusIds: ["C004", "C005", "C018", "C021", "C022"] },
  { id: "G06", title: "Spotřebitelský úvěr", documentFamily: "consumer_credit", expectedPrimaryType: "consumer_loan_contract", publishableAsContract: true, referenceFile: T("Smlouva o ČSOB Spotřebitelském úvěru.pdf"), coversCorpusIds: ["C019"] },
  { id: "G07", title: "Hypotéka / hypoteční návrh", documentFamily: "mortgage", expectedPrimaryType: "mortgage_document", publishableAsContract: true, referenceFile: T("1045978-001_D102_Smlouva o poskytnutí hypotečního úvěru_navrh.pdf"), coversCorpusIds: ["C001", "C024"] },
  { id: "G08", title: "Leasing / financování", documentFamily: "leasing", expectedPrimaryType: "generic_financial_document", publishableAsContract: true, referenceFile: T("ČSOB Leasing PBI.pdf"), coversCorpusIds: ["C025"] },
  { id: "G09", title: "Jen trezor — AML / servisní smlouva", documentFamily: "compliance", expectedPrimaryType: "consent_or_declaration", publishableAsContract: false, referenceFile: T("komis sml. aml fatca (1).pdf"), coversCorpusIds: ["C006", "C020", "C023", "C016"] },
  { id: "G10", title: "Assistant: upload → chat", documentFamily: "assistant_flow", expectedPrimaryType: null, publishableAsContract: null, referenceFile: null, assistantOnly: true, coversCorpusIds: [] },
  { id: "G11", title: "Assistant: více klientů v jednom vlákně", documentFamily: "assistant_flow", expectedPrimaryType: null, publishableAsContract: null, referenceFile: null, assistantOnly: true, coversCorpusIds: [] },
  { id: "G12", title: "Assistant: slang poradců", documentFamily: "assistant_flow", expectedPrimaryType: null, publishableAsContract: null, referenceFile: null, assistantOnly: true, coversCorpusIds: [] },
];

/** @type {object[]} */
const corpusDocuments = [
  mk("C001", "mortgage_or_mortgage_proposal", "1045978-001_D102_Smlouva o poskytnutí hypotečního úvěru_navrh.pdf", "mortgage_document", "partial", false, ["borrower", "coBorrower", "lender", "collateral", "loanPurpose"], ["principal", "interestRate", "maturityMonths", "fixation", "drawingDate"], ["classify_as_consumer_loan_only", "drop_co_borrower_when_present"], ["review_required", "multi_party_alignment"], "review_detail_context", "Hypoteční návrh; ověřit návrh vs čerpání.", ["G07"]),
  mk("C002", "final_life_contract", "30. Pojistná smlouva c. 3282140369.pdf", "life_insurance_final_contract", true, false, ["policyholder", "insuredPersons", "insurer", "product"], ["contractNumber", "institutionName", "productName", "effectiveDate", "premiumAmount", "paymentFrequency", "risks"], ["apply_as_modelation_without_override", "wrong_client_match_from_attachment"], ["review_required_if_payment_incomplete"], "post_upload_plan", null, ["G01"]),
  mk("C003", "life_modelation", "33543904_Modelace zivotniho pojisteni.pdf", "life_insurance_modelation", false, false, ["participants", "insurer", "product"], ["premiumAmount", "productName", "institutionName", "illustrationDates"], ["publish_as_final_contract_without_override"], ["apply_barrier_modelation", "review_required"], "review_detail_context", null, ["G02"]),
  mk("C004", "investment_or_dip_or_dps", "AMUNDI PLATFORMA - účet CZ KLASIK - DIP (4).pdf", "investment_subscription_document", true, false, ["investor", "custodian", "bankAccount"], ["institutionName", "strategyOrFund", "contributionAmount", "effectiveDate", "iban"], ["classify_as_pure_life_insurance"], ["review_required", "hybrid_type_signals"], "review_detail_context", "DIP; rozlišit od pojistného produktu.", ["G05"]),
  mk("C005", "investment_or_dip_or_dps", "DPPDP9-0009513230-20250325-100501.pdf", "pension_contract", true, false, ["participant", "pensionFund"], ["institutionName", "contributionAmount", "strategy", "contractOrParticipantRef"], ["misclassify_as_consumer_loan"], ["review_required"], "review_detail_context", "DPS smlouva.", ["G05"]),
  mk("C006", "service_or_aml_or_supporting_doc", "Honzajk čpp změna.pdf", "insurance_policy_change_or_service_doc", false, false, ["policyholder", "insurer"], ["policyReference", "changeDescription"], ["create_new_contract_as_greenfield"], ["manual_review_required", "reference_only"], "review_detail_context", "Změna / servis u stávající pojistky.", ["G09"]),
  mk("C007", "life_modelation", "Honzajk_KNZ_1FG_modelace_251107_161032.pdf", "life_insurance_modelation", false, false, ["participants", "insurer"], ["premiumAmount", "productName", "institutionName"], ["publish_as_final_contract_without_override"], ["apply_barrier_modelation"], "review_detail_context", null, ["G02"]),
  mk("C008", "life_proposal", "Lehnert Metlife.pdf", "life_insurance_proposal", "partial", false, ["policyholder", "insuredAdults", "insuredChildren", "insurer"], ["premiumAmount", "smokerStatus", "annualIncome", "risks", "productName"], ["merge_two_persons_into_one_name"], ["multi_person_review_required"], "post_upload_plan", "Multi-person MetLife návrh.", ["G04"]),
  mk("C009", "life_bundle_with_questionnaires", "Navrh_pojistne_smlouvy (1).pdf", "life_insurance_proposal", "partial", true, ["policyholder", "insuredAdults", "insuredChildren", "insurer"], ["premiumAmount", "risks", "healthSectionSignals", "proposalOrContractRef"], ["treat_health_appendix_as_portal_contract"], ["mixed_sensitive_document", "health_data_warnings"], "review_detail_context", "Bundle: návrh + zdravotní části (master plán).", ["G03", "G04"]),
  mk("C010", "life_proposal", "Navrh_pojistne_smlouvy (2).pdf", "nonlife_insurance_contract", "partial", false, ["policyholder", "vehicle", "insurer"], ["licensePlate", "vin", "premiumAmount", "coverageScope"], ["force_life_insurance_taxonomy"], ["review_required"], "review_detail_context", "non_life motor (POV). Bucket life_proposal = insurance offer stage; taxonomie může být rozšířena ve Fázi 2.", []),
  mk("C011", "life_proposal", "Navrh_pojistne_smlouvy (3).pdf", "liability_insurance_offer", "partial", false, ["policyholder", "insurer"], ["coverageLimits", "premiumAmount", "paymentAccount", "variableSymbol"], ["map_motor_rules_onto_liability_doc"], ["apply_barrier_proposal"], "post_upload_plan", "Návrh odpovědnosti (ČSOB dle master plánu).", ["G02"]),
  mk("C012", "life_proposal", "Navrh_pojistne_smlouvy (4).pdf", "nonlife_insurance_contract", "partial", false, ["policyholder", "insuredProperty", "insurer"], ["propertyAddress", "coverageLimits", "premiumAmount"], ["map_to_life_segment_in_crm"], ["review_required"], "review_detail_context", "non_life majetek/domácnost.", []),
  mk("C013", "life_proposal", "Navrh_pojistne_smlouvy_20251201152350427347.PDF", "life_insurance_proposal", "partial", false, ["policyholder", "insuredPersons", "insurer"], ["premiumAmount", "productName"], ["publish_as_final_without_confirmation"], ["apply_barrier_proposal"], "post_upload_plan", "Velký export návrhu; stejná očekávání jako ostatní návrhy.", ["G02"]),
  mk("C014", "life_bundle_with_questionnaires", "Pojistna_smlouva.pdf", "life_insurance_proposal", "partial", true, ["policyholder", "insuredPersons", "insurer"], ["premiumAmount", "healthSignals", "paymentAccount", "variableSymbol"], ["ignore_health_sensitivity"], ["mixed_sensitive_document"], "review_detail_context", "Pillow úraz/nemoc + zdravotní části (master plán).", ["G03"]),
  mk("C015", "life_proposal", "Pojistna_smlouva_Bibiš.pdf", "nonlife_insurance_contract", "partial", false, ["policyholder", "business", "insurer"], ["coverageLimits", "turnover", "premiumAmount"], ["apply_life_insurance_schema"], ["review_required"], "review_detail_context", "Podnikatelská odpovědnost (neživot).", []),
  mk("C016", "service_or_aml_or_supporting_doc", "RSR Quick s.r.o. DP 2024.pdf", "corporate_tax_return", false, false, ["company", "period"], ["taxPeriod", "identifierReferences"], ["publish_as_insurance_contract"], ["reference_only", "manual_review_required"], "low_direct_crm", "DP podklady; evidence / analýza, ne CRM smlouva.", ["G09"]),
  mk("C017", "life_proposal", "Roman Koloburda UNIQA.pdf", "life_insurance_proposal", "partial", false, ["policyholder", "insuredPersons", "insurer"], ["premiumAmount", "productName"], ["commit_final_contract_without_verifying_header"], ["review_required"], "post_upload_plan", "Ověřit návrh vs finální smlouva podle záhlaví (checklist).", []),
  mk("C018", "investment_or_dip_or_dps", "Smlouva (3).pdf", "pension_contract", true, false, ["participant", "fund"], ["institutionName", "contributionAmount", "strategy", "nominatedPersons"], ["classify_as_life_insurance_contract"], ["review_required"], "review_detail_context", "Conseq DPS (master plán).", ["G05"]),
  mk("C019", "consumer_loan", "Smlouva o ČSOB Spotřebitelském úvěru.pdf", "consumer_loan_contract", true, false, ["borrower", "lender"], ["principal", "aprOrRate", "installment", "termMonths", "purpose"], ["classify_as_mortgage"], ["review_required"], "review_detail_context", null, ["G06"], ["Test AI/Smlouva_o_ČSOB_Spotřebitelském_úvěru.pdf"]),
  mk("C020", "service_or_aml_or_supporting_doc", "Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf", "service_agreement", false, false, ["client", "provider"], ["effectiveDate", "scopeSummary"], ["auto_create_client_product_contract"], ["manual_review_required"], "review_detail_context", "CODYA servisní / rámcová investiční smlouva.", ["G09"]),
  mk("C021", "investment_or_dip_or_dps", "Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf", "investment_subscription_document", true, false, ["investor", "fundPlatform"], ["institutionName", "isinOrFundName", "account"], ["treat_as_life_policy"], ["review_required"], "review_detail_context", "CODYA úpis.", ["G05"]),
  mk("C022", "investment_or_dip_or_dps", "VL-202512.pdf", "pension_contract", "partial", false, ["participant"], ["institutionName", "productFramework"], ["confuse_pp_with_pure_investment"], ["review_required"], "review_detail_context", "Penzijní rámec VL; rozlišit PP vs DPS.", ["G05"]),
  mk("C023", "service_or_aml_or_supporting_doc", "komis sml. aml fatca (1).pdf", "consent_or_declaration", false, false, ["clientRepresentative", "intermediary"], ["documentKind", "signatureDate"], ["publish_as_standard_product_contract"], ["manual_review_required", "high_sensitivity"], "review_detail_context", "AML/FATCA / komisionářská dokumentace.", ["G09"]),
  mk("C024", "mortgage_or_mortgage_proposal", "Úvěrová smlouva ČÚ 111 06034 25 (1).pdf", "mortgage_document", true, false, ["borrower", "coBorrower", "lender"], ["principal", "interestRate", "fixation", "purpose", "security"], ["single_borrower_when_two_listed"], ["review_required", "multi_party_alignment"], "review_detail_context", "RB hypotéka / úvěr na bydlení; více stran.", ["G07"]),
  mk("C025", "leasing", "ČSOB Leasing PBI.pdf", "generic_financial_document", true, false, ["lessee", "lessor", "vehicleOrAsset"], ["financedAmount", "vin", "registrationPlate", "businessPurpose"], ["map_to_consumer_loan_schema"], ["review_required"], "review_detail_context", "Leasing / podnikatelské financování; POV/HAV v textu.", ["G08"]),
  mk("C026", "life_proposal", "Čučka tentam GČP.pdf", "liability_insurance_offer", "partial", false, ["policyholder", "insurer"], ["coverageLimits", "coinsurance", "premiumAmount"], ["treat_as_life"], ["review_required"], "review_detail_context", null, []),
  mk("C027", "life_bundle_with_questionnaires", "Hanna Havdan GČP.pdf", "life_insurance_investment_contract", "partial", true, ["policyholder", "insuredPersons", "insurer"], ["contractNumber", "investmentStrategy", "premiumAmount", "healthSegments"], ["publish_health_bundle_as_single_visible_contract"], ["mixed_sensitive_document", "packet_segmentation_needed"], "review_detail_context", "Komplexní balík (master plán); soubor nemusí být fyzicky v každém git checkout – doplnit lokálně do Test AI/.", ["G03"]),
];

function mk(id, familyBucket, file, expectedPrimaryType, publishable, isPacket, expectedEntities, expectedExtractedFields, expectedForbiddenActions, expectedReviewFlags, expectedAssistantRelevance, corpusNote, mapsToGoldenScenarioIds, aliasFileNames) {
  const referenceFile = T(file);
  const out = {
    id,
    familyBucket,
    referenceFile,
    gitTracked: gitTracked(referenceFile),
    expectedPrimaryType,
    publishable,
    isPacket,
    expectedEntities,
    expectedExtractedFields,
    expectedForbiddenActions,
    expectedReviewFlags,
    expectedAssistantRelevance,
    mapsToGoldenScenarioIds,
  };
  if (corpusNote) out.corpusNote = corpusNote;
  if (aliasFileNames && aliasFileNames.length) out.aliasFileNames = aliasFileNames;
  return out;
}

// Fix C026 filename typo: Čučka zamzam GČP.pdf
const c26 = corpusDocuments.find((x) => x.id === "C026");
c26.referenceFile = T("Čučka zamzam GČP.pdf");
c26.gitTracked = gitTracked(c26.referenceFile);
c26.corpusNote = "Generali odpovědnost při výkonu povolání (master plán).";

const manifest = {
  version: 2,
  description: "Phase 1: G01–G12 + corpusDocuments for Test AI/ (wide real corpus). Human table: docs/ai-review-assistant-phase-1-corpus-inventory.md",
  familyBucketDefinitionsDoc: "docs/ai-review-assistant-phase-1-corpus-buckets.md",
  scenarios,
  corpusDocuments,
};

fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Wrote", corpusDocuments.length, "corpus documents to", outPath);
