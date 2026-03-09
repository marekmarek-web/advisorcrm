"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

interface AccordionProps {
  children: React.ReactNode;
  className?: string;
}

export function Accordion({ children, className = "" }: AccordionProps) {
  return (
    <section
      className={`faq-container ${className}`}
      aria-label="Frequently Asked Questions"
    >
      {children}
    </section>
  );
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
}: AccordionItemProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const isClosingRef = useRef(false);
  const isExpandingRef = useRef(false);

  const onAnimationFinish = useCallback((open: boolean) => {
    const el = detailsRef.current;
    if (!el) return;
    el.open = open;
    animationRef.current = null;
    isClosingRef.current = false;
    isExpandingRef.current = false;
    el.style.height = "";
    el.style.overflow = "";
  }, []);

  const expand = useCallback(() => {
    const el = detailsRef.current;
    const summary = el?.querySelector("summary");
    const content = contentRef.current;
    if (!el || !summary || !content) return;

    isExpandingRef.current = true;
    el.style.height = `${el.offsetHeight}px`;
    el.open = true;

    window.requestAnimationFrame(() => {
      const startHeight = `${el.offsetHeight}px`;
      const endHeight = `${summary.offsetHeight + content.offsetHeight}px`;
      if (animationRef.current) animationRef.current.cancel();
      animationRef.current = el.animate(
        { height: [startHeight, endHeight] },
        { duration: 350, easing: "ease-out" },
      );
      animationRef.current.onfinish = () => onAnimationFinish(true);
      animationRef.current.oncancel = () => { isExpandingRef.current = false; };
    });
  }, [onAnimationFinish]);

  const shrink = useCallback(() => {
    const el = detailsRef.current;
    const summary = el?.querySelector("summary");
    if (!el || !summary) return;

    isClosingRef.current = true;
    const startHeight = `${el.offsetHeight}px`;
    const endHeight = `${summary.offsetHeight}px`;
    if (animationRef.current) animationRef.current.cancel();
    el.style.overflow = "hidden";
    animationRef.current = el.animate(
      { height: [startHeight, endHeight] },
      { duration: 400, easing: "ease-out" },
    );
    animationRef.current.onfinish = () => onAnimationFinish(false);
    animationRef.current.oncancel = () => { isClosingRef.current = false; };
  }, [onAnimationFinish]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = detailsRef.current;
      if (!el) return;
      if (isClosingRef.current || !el.open) {
        expand();
      } else if (isExpandingRef.current || el.open) {
        shrink();
      }
    },
    [expand, shrink],
  );

  useEffect(() => {
    if (defaultOpen && detailsRef.current) {
      detailsRef.current.open = true;
    }
  }, [defaultOpen]);

  return (
    <details ref={detailsRef} open={defaultOpen}>
      <summary onClick={handleClick}>
        <span className="faq-title">{title}</span>
        {/* Plus Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="icon icon-tabler icon-tabler-circle-plus expand-icon"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="#303651"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <path d="M9 12l6 0" />
          <path d="M12 9l0 6" />
        </svg>
        {/* Minus Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="icon icon-tabler icon-tabler-circle-minus expand-icon"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="#303651"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "none" }}
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          <path d="M9 12l6 0" />
        </svg>
      </summary>
      <div ref={contentRef} className="faq-content">
        {children}
      </div>
    </details>
  );
}
