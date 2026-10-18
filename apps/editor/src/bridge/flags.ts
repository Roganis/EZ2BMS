// The browser build's switches (?modes, ?skin, ?game ...), read once at start.
// Tests and a developer give them in the address. The hosted preview's page
// never receives a query string (its host passes only a bare #anchor), so its
// opening card adds the ones the visitor chose before the app starts.

const added: string[] = [];

/** Switch these on for the start that follows (the hosted preview's card). */
export function addPageFlags(...names: string[]): void {
  added.push(...names);
}

/** The address's query, plus any switches added before the app started. */
export function pageFlags(): URLSearchParams {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  for (const n of added) if (!q.has(n)) q.append(n, '');
  return q;
}
