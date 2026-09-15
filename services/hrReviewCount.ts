/** Count review items, grouping profile fields into one submission. Null means unknown. */
export function hrReviewCount(registrations: readonly unknown[], documents: readonly unknown[], submissionIds: readonly unknown[], loading = false, failed = false): number | null {
    if (loading || failed) return null;
    return registrations.length + documents.length + new Set(submissionIds).size;
}
