"use client";

/**
 * NFR-006 / WCAG 2.1 SC 2.4.1 (Bypass Blocks): the first focusable element
 * on every page, letting keyboard and screen-reader users jump past the
 * header/navigation straight to the page content (every page's main
 * landmark carries id="main"). Visually hidden until it receives focus.
 *
 * Focus is moved explicitly because some browsers (notably Safari) scroll
 * to an in-page anchor without moving keyboard focus there.
 */
export function SkipLink() {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("main");
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
    target.scrollIntoView();
  }

  return (
    <a href="#main" className="skip-link" onClick={handleClick}>
      Skip to main content
    </a>
  );
}
