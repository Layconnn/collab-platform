// Shared classes for everything that floats above a page (dashboard redesign
// PRD, FR-4 and NFR-2): menus and popovers in glass, dialogs on a solid
// surface over a soft scrim, all opening with a short pop.

// Menus, popovers and the notifications panel, over page content.
export const floatPanelClasses = "canopy-panel glass-float canopy-pop rounded-xl border text-text-primary outline-none";

// Solid floating panels: menus over the forest sidebar (account, workspace
// switcher), where glass would lose contrast, and the command palette, which
// sits on a scrim that would turn glass grey.
export const solidPanelClasses = "canopy-panel canopy-pop rounded-xl border border-border bg-surface text-text-primary shadow-float outline-none";

// One row in a menu or popover.
export const menuItemClasses = "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary";

// The full-screen layer behind a dialog or the palette.
export const scrimClasses = "canopy-scrim canopy-fade fixed inset-0";

// A dialog panel: solid surface, large radius, floating shadow. A bottom sheet
// on phones where the dialog allows it.
export const dialogPanelClasses = "canopy-panel canopy-pop rounded-t-2xl border border-border bg-surface text-text-primary shadow-float outline-none sm:rounded-2xl";

// Dialog headings use the serif title, like page titles.
export const dialogTitleClasses = "font-serif text-[1.625rem] leading-tight tracking-[-0.01em] text-text-primary";

// The mono label above a dialog title, like the page eyebrow.
export const overlayLabelClasses = "font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted";
