export const helpWidgetEvent = 'tng:show-help-widget';
export const helpWidgetKey = (userId?: string) => `tng-help-widget:${userId || 'guest'}`;

export function restoreHelpWidget(userId?: string) {
    try { localStorage.removeItem(helpWidgetKey(userId)); } catch { /* Storage may be unavailable. */ }
    window.dispatchEvent(new Event(helpWidgetEvent));
}
