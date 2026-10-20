/**
 * Names of the owners that reference a file, for refusals and details. Pure and import-free so the node tests can load
 * it; the titles come from the caller (the media tools get them through their injected `ownerLabels`).
 */

/** Name of each owner: a quiz by its title (its id when unknown), other kinds by kind and id. */
export function referenceNames(references: readonly { ownerKind: string; ownerId: string }[], titles: ReadonlyMap<string, string>): string[] {
  return references.map((r) => (r.ownerKind === 'quiz' ? `quiz „${titles.get(r.ownerId) ?? r.ownerId}”` : `${r.ownerKind} ${r.ownerId}`))
}
