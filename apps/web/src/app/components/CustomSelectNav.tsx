"use client";

/**
 * Custom Select List Nav – přesně z template "Custom select list nav.txt".
 * Používá appearance: base-select (experimentální). S fallbackem pro nepodporující prohlížeče.
 */
export function CustomSelectNav({ className = "" }: { className?: string }) {
  return (
    <>
      <style>{`
        @import url(https://fonts.bunny.net/css?family=jura:300,500);

        .wp-custom-select-wrap {
          --transition-duration: 300ms;
          --select-width: 100px;
          --select-padding: .25rem .75rem;
          --select-text-color: light-dark(rgb(113, 113, 123),rgb(245 245 245));
          --select-bg-color: light-dark(rgb(245 245 245),dodgerblue);
          --select-bg-color-hover: light-dark(rgb(228 228 231),rgb(0 105 168));
          --select-border-color: 1px solid light-dark(rgb(212 212 216),rgb(0 105 168));
          --option-list-size: calc(var(--select-width) * 4);
          --option-list-bg-color: light-dark(rgb(226 232 240), rgb(29 41 61));
          --option-list-border: 1px solid var(--clr-lines, rgba(255 255 255 / .25));
          --option-list-padding: 1rem;
          --option-list-radius: 10px;
          --option-size: var(--select-width);
          --option-padding: 2rem;
          --option-offset: calc(var(--select-width) * 1);
          --option-bg-color: light-dark(rgb(202, 213, 226), rgb(69, 85, 108));
          --option-bg-color-hover: rgb(0 105 168 / 1);
          --option-bg-color-selected: deeppink;
          --option-border: none;
          --option-border-color: var(--clr-lines, rgba(255 255 255 / .25));
          --option-font-size: .8rem;
          --option-text-color: light-dark(rgb(10, 113, 123), rgb(255 255 255));
          --option-text-color-hover: white;
          --option-text-color-selected: white;
          --option-radius: 9in;
          --selected-element-radius: var(--option-radius);
          --selected-element-padding: var(--option-padding);
          --selected-element-bg-color: var(--option-bg-color);
          --selected-element-text-color: var(--option-text-color);
          --selected-element-border-color: var(--option-border-color);
          display: grid;
          place-content: center;
          font-family: "Jura", sans-serif;
        }
        .wp-custom-select-wrap select {
          width: var(--select-width);
          margin-inline: auto;
          background-color: var(--select-bg-color);
          color: var(--select-text-color);
          padding: var(--select-padding);
          outline: 1px dashed transparent;
          border: var(--select-border-color);
          transition:
            background-color var(--transition-duration) ease-in-out,
            outline var(--transition-duration) ease-in-out,
            scale var(--transition-duration) ease-in-out;
        }
        .wp-custom-select-wrap select:hover,
        .wp-custom-select-wrap select:focus,
        .wp-custom-select-wrap select:active {
          scale: 1.1;
        }
        .wp-custom-select-wrap select:focus-visible {
          outline: 1px dashed dodgerblue;
          outline-offset: 5px;
        }
        .wp-custom-select-wrap select option:first-of-type {
          display: none;
        }

        @supports (appearance: base-select) {
          .wp-custom-select-wrap select,
          .wp-custom-select-wrap ::picker(select) {
            appearance: base-select;
          }
          .wp-custom-select-wrap select {
            --items: 6;
            --slice-angle: calc(360deg / var(--items));
            --start-angle: calc(var(--slice-angle) / 2);
            background-color: transparent;
            border: none;
            padding: 0;
            border-radius: 9in;
          }
          .wp-custom-select-wrap select::picker-icon {
            display: none;
          }
          .wp-custom-select-wrap selectedcontent > span,
          .wp-custom-select-wrap option > span {
            display: block;
            position: absolute;
            bottom: 1em;
            left: 50%;
            translate: -50% 50%;
            transition: all var(--transition-duration) ease-in-out;
            opacity: 0;
          }
          .wp-custom-select-wrap selectedcontent > svg,
          .wp-custom-select-wrap option > svg {
            display: block;
            width: 100%;
            aspect-ratio: 1;
            transition:
              scale var(--transition-duration) ease-in-out,
              translate var(--transition-duration) ease-in-out;
          }
          .wp-custom-select-wrap button {
            width: var(--select-width);
            aspect-ratio: 1;
          }
          .wp-custom-select-wrap selectedcontent {
            display: grid;
            place-content: center;
            padding: var(--selected-element-padding);
            border: 1px solid var(--selected-element-border-color);
            border-radius: var(--selected-element-radius);
            background-color: var(--selected-element-bg-color);
            color: var(--selected-element-text-color);
            transition:
              opacity var(--transition-duration) ease-in-out,
              scale var(--transition-duration) ease-in-out;
          }
          .wp-custom-select-wrap select:open selectedcontent {
            opacity: 0;
            scale: .5;
          }
          .wp-custom-select-wrap select::picker(select) {
            pointer-events: none;
            position: relative;
            position-area: span-all;
            width: var(--option-list-size);
            aspect-ratio: 1;
            border: none;
            border-radius: var(--option-list-radius);
            opacity: 0;
            scale: 0;
            background: transparent;
            transition: all var(--transition-duration) allow-discrete;
            backdrop-filter: blur(2px);
          }
          .wp-custom-select-wrap select:open::picker(select) {
            pointer-events: auto;
            opacity: 1;
            scale: 1;
          }
          .wp-custom-select-wrap option {
            grid-area: 1/1;
            position: absolute;
            inset: 50%;
            translate: -50% -50%;
            cursor: pointer;
            width: var(--option-size);
            aspect-ratio: 1;
            padding: var(--option-padding);
            border-radius: var(--option-radius);
            border: 1px solid var(--option-border-color);
            color: var(--option-text-color);
            background-color: var(--option-bg-color);
            isolation: isolate;
            outline: 1px dashed transparent;
            transition:
              color var(--transition-duration) ease-in-out,
              opacity var(--transition-duration) ease-in-out,
              outline var(--transition-duration) ease-in-out,
              scale var(--transition-duration) ease-in-out,
              background-color var(--transition-duration) ease-in-out;
          }
          .wp-custom-select-wrap option::checkmark {
            display: none;
          }
          .wp-custom-select-wrap option:checked {
            background: var(--option-bg-color-selected);
            color: var(--option-text-color-selected);
          }
          .wp-custom-select-wrap option:first-of-type {
            display: block;
            scale: .5;
          }
          .wp-custom-select-wrap option:nth-of-type(2) {
            transform: rotate(72deg) translate(var(--option-offset)) rotate(-72deg);
          }
          .wp-custom-select-wrap option:nth-of-type(3) {
            transform: rotate(144deg) translate(var(--option-offset)) rotate(-144deg);
          }
          .wp-custom-select-wrap option:nth-of-type(4) {
            transform: rotate(216deg) translate(var(--option-offset)) rotate(-216deg);
          }
          .wp-custom-select-wrap option:nth-of-type(5) {
            transform: rotate(288deg) translate(var(--option-offset)) rotate(-288deg);
          }
          .wp-custom-select-wrap option:nth-of-type(6) {
            transform: rotate(360deg) translate(var(--option-offset)) rotate(-360deg);
          }
          .wp-custom-select-wrap option:hover,
          .wp-custom-select-wrap option:focus-visible {
            background-color: var(--option-bg-color-hover);
            color: var(--option-text-color-hover);
          }
          .wp-custom-select-wrap option:hover span,
          .wp-custom-select-wrap option:focus-visible span {
            opacity: 1;
            translate: -50% -2ex;
          }
          .wp-custom-select-wrap option:hover svg,
          .wp-custom-select-wrap option:focus-visible svg {
            scale: .5;
            translate: 0 -2ex;
          }
          .wp-custom-select-wrap option:focus-visible {
            outline: 1px dashed dodgerblue;
            outline-offset: 5px;
          }
        }
      `}</style>

      <div className={`wp-custom-select-wrap ${className}`}>
        <select defaultValue="Home">
          <span className="selected-content" aria-hidden />
          <option value="Menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6l16 0" />
                <path d="M4 12l16 0" />
                <path d="M4 12l16 0" />
                <path d="M4 18l16 0" />
              </g>
            </svg>
            <span>Menu</span>
          </option>
          <option value="Home">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M12.707 2.293l9 9c.63 .63 .184 1.707 -.707 1.707h-1v6a3 3 0 0 1 -3 3h-1v-7a3 3 0 0 0 -2.824 -2.995l-.176 -.005h-2a3 3 0 0 0 -3 3v7h-1a3 3 0 0 1 -3 -3v-6h-1c-.89 0 -1.337 -1.077 -.707 -1.707l9 -9a1 1 0 0 1 1.414 0m.293 11.707a1 1 0 0 1 1 1v7h-4v-7a1 1 0 0 1 .883 -.993l.117 -.007z" />
            </svg>
            <span>Home</span>
          </option>
          <option value="Messages">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M18 3a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-4.724l-4.762 2.857a1 1 0 0 1 -1.508 -.743l-.006 -.114v-2h-1a4 4 0 0 1 -3.995 -3.8l-.005 -.2v-8a4 4 0 0 1 4 -4zm-4 9h-6a1 1 0 0 0 0 2h6a1 1 0 0 0 0 -2m2 -4h-8a1 1 0 1 0 0 2h8a1 1 0 0 0 0 -2" />
            </svg>
            <span>Messages</span>
          </option>
          <option value="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M14.647 4.081a.724 .724 0 0 0 1.08 .448c2.439 -1.485 5.23 1.305 3.745 3.744a.724 .724 0 0 0 .447 1.08c2.775 .673 2.775 4.62 0 5.294a.724 .724 0 0 0 -.448 1.08c1.485 2.439 -1.305 5.23 -3.744 3.745a.724 .724 0 0 0 -1.08 .447c-.673 2.775 -4.62 2.775 -5.294 0a.724 .724 0 0 0 -1.08 -.448c-2.439 1.485 -5.23 -1.305 -3.745 -3.744a.724 .724 0 0 0 -.447 -1.08c-2.775 -.673 -2.775 -4.62 0 -5.294a.724 .724 0 0 0 .448 -1.08c-1.485 -2.439 1.305 -5.23 3.744 -3.745a.722 .722 0 0 0 1.08 -.447c.673 -2.775 4.62 -2.775 5.294 0zm-2.647 4.919a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
            </svg>
            <span>Settings</span>
          </option>
          <option value="Profile">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M12 2a5 5 0 1 1 -5 5l.005 -.217a5 5 0 0 1 4.995 -4.783z" />
              <path d="M14 14a5 5 0 0 1 5 5v1a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-1a5 5 0 0 1 5 -5h4z" />
            </svg>
            <span>Profile</span>
          </option>
          <option value="Social">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
              <path d="M18 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
              <path d="M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
              <path d="M8.7 10.7l6.6 -3.4" />
              <path d="M8.7 13.3l6.6 3.4" />
            </svg>
            <span>Social</span>
          </option>
        </select>
      </div>
    </>
  );
}
