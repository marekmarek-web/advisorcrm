"use client";

import { CalendarSettingsModal, type CalendarSettingsModalProps } from "@/app/components/calendar/CalendarSettingsModal";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

export type CalendarSettingsWizardProps = Omit<CalendarSettingsModalProps, "layout" | "stepper"> & {
  deviceClass?: DeviceClass;
};

/** Mobile: fullscreen + 4-step wizard. Tablet/desktop: centered modal (single scroll). */
export function CalendarSettingsWizard({ deviceClass = "phone", ...rest }: CalendarSettingsWizardProps) {
  const large = deviceClass === "tablet" || deviceClass === "desktop";
  return (
    <CalendarSettingsModal {...rest} layout={large ? "center" : "fullscreen"} stepper={!large} />
  );
}
