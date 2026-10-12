// Warm only the page code; requests and approval permissions stay live.
let page: Promise<typeof import('../pages/ApprovalCenter')> | undefined;
export function preloadApprovalPage() {
  if (!page) {
    page = import('../pages/ApprovalCenter').catch(error => {
      page = undefined;
      throw error;
    });
  }
  return page;
}
export function warmApprovalPage() {
  void preloadApprovalPage().catch(() => { /* Navigation can retry a failed preload. */ });
}
