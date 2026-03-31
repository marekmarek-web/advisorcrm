/** Stable codes from server actions — map to user-facing copy in UI. */
export const FA_ERROR_NO_WRITE = "ERR_FA_NO_WRITE_PERMISSION";
export const FA_ERROR_NO_READ = "ERR_FA_NO_READ_PERMISSION";

export function translateFinancialAnalysisActionError(message: string): string {
  switch (message) {
    case FA_ERROR_NO_WRITE:
      return "Nemáte oprávnění ukládat finanční analýzy. Požádejte správce účtu o přístup.";
    case FA_ERROR_NO_READ:
      return "Nemáte oprávnění zobrazit finanční analýzy. Požádejte správce účtu o přístup.";
    case "Forbidden":
      return "Tuto akci nemůžete provést (chybí oprávnění).";
    default:
      if (message.startsWith("ERR_FA_")) {
        return "Operace s finanční analýzou selhala. Zkuste to znovu nebo kontaktujte podporu.";
      }
      return message;
  }
}
