"use client";

import type { ComponentProps } from "react";
import { CurrentTimeLine } from "@/app/portal/calendar/CurrentTimeLine";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

export function CalendarCurrentTimeLine(
  props: Omit<ComponentProps<typeof CurrentTimeLine>, "showBadge"> & {
    deviceClass: DeviceClass;
  },
) {
  const { deviceClass, ...rest } = props;
  return <CurrentTimeLine {...rest} showBadge={deviceClass !== "phone"} />;
}
