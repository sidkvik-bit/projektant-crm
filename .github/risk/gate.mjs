// Rozhodnutí, jestli PR smí projít: zelená a oranžová vždy, červená jen se schválením vlastníka
// na aktuálním commitu (po dalším pushi se musí schválit znovu — schvaluje se to, co jde do develop).

export const REPO_OWNER = "sidkvik-bit";

/**
 * @param {{ level: string, author: string, headSha: string,
 *           reviews: { user: { login: string }, state: string, commit_id: string }[] }} input
 *   reviews v pořadí, jak je vrací GitHub API (od nejstarší)
 * @returns {{ pass: boolean, why: string }}
 */
export function gateDecision({ level, author, headSha, reviews }) {
  if (level !== "red") return { pass: true, why: "Zelená/oranžová změna — schválení není potřeba." };
  if (author === REPO_OWNER) return { pass: true, why: "PR od vlastníka repa." };

  const ownerReviews = reviews.filter((r) => r.user?.login === REPO_OWNER && r.state !== "COMMENTED");
  const latest = ownerReviews.at(-1);
  if (latest?.state === "APPROVED" && latest.commit_id === headSha) {
    return { pass: true, why: "Honza schválil aktuální verzi." };
  }
  return {
    pass: false,
    why: latest?.state === "APPROVED"
      ? "Honza schválil starší verzi — po posledním pushi musí schválit znovu."
      : "Červená změna čeká na schválení od Honzy.",
  };
}
