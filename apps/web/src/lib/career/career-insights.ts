/**
 * Lehké manažerské insighty z existujících dat — nejsou oficiální splnění kariérního řádu.
 */

import type { CareerEvaluationViewModel } from "./career-evaluation-vm";

export type CareerInsight = {
  id: string;
  title: string;
  body: string;
};

export type CareerInsightMetricsSlice = {
  meetingsThisPeriod: number;
  unitsThisPeriod: number;
  activityCount: number;
  daysWithoutActivity: number;
  directReportsCount: number;
};

export type CareerInsightAdaptationSlice = {
  adaptationStatus: string;
  daysInTeam: number;
};

export function buildCareerInsights(
  vm: CareerEvaluationViewModel,
  metrics: CareerInsightMetricsSlice | null,
  adaptation: CareerInsightAdaptationSlice | null
): CareerInsight[] {
  const out: CareerInsight[] = [];

  if (
    metrics &&
    vm.progressionOrder !== null &&
    vm.progressionOrder <= 0 &&
    metrics.daysWithoutActivity >= 14 &&
    metrics.meetingsThisPeriod === 0 &&
    metrics.unitsThisPeriod === 0
  ) {
    out.push({
      id: "starter_low_crm_signal",
      title: "Startovní pozice a dlouhé ticho v CRM",
      body: "Člen je na prvním kroku větve a v měřeném období nejsou schůzky ani jednotky a je evidována delší neaktivita. Nejde o posudek výkonu — spíš signál pro 1:1 a ověření, zda potřebuje podporu při rozjezdu.",
    });
  }

  if (
    vm.careerTrackId === "management_structure" &&
    metrics &&
    metrics.directReportsCount === 0
  ) {
    out.push({
      id: "mgmt_track_no_directs",
      title: "Manažerská větev bez přímých podřízených v CRM",
      body: "V hierarchii aplikace nejsou u tohoto člena evidováni přímí podřízení. Struktura v CRM může být nekompletní — strukturální kritéria z kariérního řádu vždy ověřte ručně.",
    });
  }

  if (
    vm.careerPositionLabel &&
    vm.evaluationCompleteness === "low_confidence" &&
    vm.missingRequirements.length > 0
  ) {
    out.push({
      id: "position_but_low_confidence",
      title: "Pozice je vyplněna, ale evaluace má nízkou jistotu",
      body: "Jsou přítomné nejasné nebo legacy údaje, nebo chybí souvislosti v konfiguraci. Doporučujeme zkontrolovat program, větev a kód pozice v Nastavení → Tým.",
    });
  }

  if (
    adaptation &&
    (adaptation.adaptationStatus === "V adaptaci" || adaptation.adaptationStatus === "Rizikový") &&
    metrics &&
    metrics.meetingsThisPeriod === 0 &&
    metrics.activityCount < 3
  ) {
    out.push({
      id: "adaptation_weak_signals",
      title: "Adaptace probíhá — chybí základní signály rozjezdu v CRM",
      body: "Stav adaptace naznačuje, že člen je v náběhu, ale v období není výraznější aktivita ani schůzky. Vhodný téma pro krátký check-in (bez tlaku na „výkon“).",
    });
  }

  if (
    vm.careerTrackId === "individual_performance" &&
    metrics &&
    (metrics.meetingsThisPeriod >= 3 || metrics.unitsThisPeriod >= 1) &&
    vm.progressEvaluation === "on_track"
  ) {
    out.push({
      id: "individual_positive_proxy",
      title: "Individuální větev — v CRM jsou vidět základní výkonové signály",
      body: "Počet schůzek nebo jednotek v období naznačuje zapojení. Neinterpretujte to jako BJ/BJS z řádu — jen orientační kontext pro vedení.",
    });
  }

  return out;
}
