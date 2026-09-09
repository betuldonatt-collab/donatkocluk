// Radix Dialog/Sheet render into a portal attached directly to
// document.body, so they fall OUTSIDE the <fieldset disabled> wrapper
// around each panel's <main> -- native fieldset disabling only cascades
// through the real DOM tree, and a portal is structurally not a
// descendant of anything in the page. This covers that gap with a plain
// global CSS rule instead, scoped to existing only while impersonating
// (the style tag itself is conditionally rendered, not the selector).
export function ImpersonationLockStyles() {
  return (
    <style>{`
      [role="dialog"] button,
      [role="dialog"] input,
      [role="dialog"] select,
      [role="dialog"] textarea,
      [role="alertdialog"] button,
      [role="alertdialog"] input,
      [role="alertdialog"] select,
      [role="alertdialog"] textarea {
        pointer-events: none !important;
        opacity: 0.5 !important;
        cursor: not-allowed !important;
      }
    `}</style>
  );
}
