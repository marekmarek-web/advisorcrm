/**
 * Shared form styles for all info-input wizards (source: info wizard.txt).
 */

export const wizardLabelClass =
  "block text-sm font-bold text-slate-700 mb-2";

export const wizardInputClass =
  "w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all text-slate-800 placeholder:text-slate-300";

export const wizardInputWithIconClass = `${wizardInputClass} pl-11`;

export const WIZARD_SLIDE_CSS = `
.wizard-slide-enter { animation: wizardSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes wizardSlideIn {
  0% { opacity: 0; transform: translateX(20px); }
  100% { opacity: 1; transform: translateX(0); }
}
`;
