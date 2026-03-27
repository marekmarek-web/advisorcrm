"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { createActionButtonSurfaceClassName } from "@/lib/ui/create-action-button-styles";

export {
  createActionButtonSurfaceClassName,
  portalPrimaryButtonClassName,
  portalPrimaryIconButtonClassName,
  portalPrimaryGradientBaseClassName,
} from "@/lib/ui/create-action-button-styles";

type CommonProps = {
  children: ReactNode;
  icon?: LucideIcon | null;
  /** Přimíchá se k ikoně (např. rotace při otevřeném menu). */
  iconClassName?: string;
  isLoading?: boolean;
  className?: string;
};

type ButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children"> & {
    href?: undefined;
  };

type LinkProps = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children"> & {
    href: string;
    /** Plná navigace (např. OAuth `/api/.../connect`) – použije `<a>` místo Next `Link`. */
    nativeAnchor?: boolean;
  };

export type CreateActionButtonProps = ButtonProps | LinkProps;

function ShimmerLayer() {
  return (
    <div
      className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-aidv-create-shimmer dark:via-slate-900/[0.07] dark:from-transparent dark:to-transparent"
      aria-hidden
    />
  );
}

function InnerContent({
  icon: Icon,
  iconClassName,
  isLoading,
  children,
}: {
  icon: LucideIcon | null;
  iconClassName?: string;
  isLoading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative z-10 flex items-center gap-2.5">
      {isLoading ? (
        <div
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-slate-300/80 dark:border-t-[color:var(--aidv-create-on-dark-text)]"
          aria-hidden
        />
      ) : (
        Icon && (
          <Icon
            size={18}
            strokeWidth={2.5}
            className={clsx(
              "shrink-0 transition-transform duration-300 group-hover:scale-110 group-active:scale-95",
              iconClassName,
            )}
            aria-hidden
          />
        )
      )}
      <span className="mt-[1px]">{children}</span>
    </div>
  );
}

/**
 * Kanonické primární tlačítko „vytvořit nové“ (UX UI/button.txt).
 * S `href` renderuje Next.js Link se stejným vzhledem.
 */
export function CreateActionButton(props: CreateActionButtonProps) {
  const surface = clsx(createActionButtonSurfaceClassName, props.className);
  const icon = props.icon !== undefined ? props.icon : Plus;
  const busy = Boolean(props.isLoading);

  if ("href" in props && props.href) {
    const linkProps = props as LinkProps;
    const {
      href,
      children,
      icon: _i,
      iconClassName,
      isLoading: _loading,
      className: _c,
      nativeAnchor,
      ...linkForward
    } = linkProps;
    const linkClass = clsx(surface, busy && "pointer-events-none opacity-70");
    const inner = (
      <>
        <ShimmerLayer />
        <InnerContent
          icon={icon}
          iconClassName={iconClassName}
          isLoading={busy}
          children={children}
        />
      </>
    );
    if (nativeAnchor) {
      return (
        <a href={href} className={linkClass} aria-busy={busy || undefined}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={linkClass} aria-busy={busy || undefined} {...linkForward}>
        {inner}
      </Link>
    );
  }

  const {
    children,
    icon: _iconBtn,
    iconClassName,
    isLoading = false,
    className: _c,
    type,
    disabled,
    ...btnForward
  } = props as ButtonProps;

  return (
    <button
      type={type ?? "button"}
      disabled={busy || Boolean(disabled)}
      className={surface}
      {...btnForward}
    >
      <ShimmerLayer />
      <InnerContent
        icon={icon}
        iconClassName={iconClassName}
        isLoading={busy}
        children={children}
      />
    </button>
  );
}
