// La session est posée dans un cookie HttpOnly (gc_session pour un participant, gc_admin pour
// l'administration) : les tests le lisent dans la réponse et le renvoient en Bearer, accepté aussi.
type Reponse = { cookies: { name: string; value: string }[]; json: () => any };

export function jetonDe(res: Reponse, nom: 'gc_session' | 'gc_admin' = 'gc_session'): string {
  const cookie = res.cookies.find((c) => c.name === nom);
  if (!cookie?.value) throw new Error(`Pas de cookie ${nom} dans la réponse.`);
  return cookie.value;
}

// Corps JSON de la réponse, complété du jeton de session (pour les tests qui lisaient `token`).
export const avecJeton = (res: Reponse) => ({ ...res.json(), token: jetonDe(res) });
