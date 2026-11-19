// Verrou anti force brute indépendant de l'IP : au-delà de `seuil` échecs sur une fenêtre glissante,
// l'action est verrouillée pendant `dureeVerrouMs`. Complète la limitation par IP, qu'un attaquant
// disposant de nombreuses adresses pourrait contourner (OWASP A07).
export class VerrouEchecs {
  private echecs: number[] = [];
  private verrouJusqua = 0;

  constructor(
    private readonly seuil: number,
    private readonly fenetreMs: number,
    private readonly dureeVerrouMs: number,
  ) {}

  private purger(maintenant: number) {
    this.echecs = this.echecs.filter((t) => maintenant - t < this.fenetreMs);
  }

  estVerrouille(maintenant = Date.now()): boolean {
    return maintenant < this.verrouJusqua;
  }

  // Minutes restantes avant la fin du verrou (arrondi au supérieur).
  minutesRestantes(maintenant = Date.now()): number {
    return Math.max(0, Math.ceil((this.verrouJusqua - maintenant) / 60_000));
  }

  // Aucun échec dans la fenêtre et pas de verrou en cours : l'entrée peut être oubliée sans effet.
  estInactif(maintenant = Date.now()): boolean {
    this.purger(maintenant);
    return this.echecs.length === 0 && !this.estVerrouille(maintenant);
  }

  // Enregistre un échec et renvoie le nombre d'échecs récents.
  echec(maintenant = Date.now()): number {
    this.purger(maintenant);
    this.echecs.push(maintenant);
    if (this.echecs.length >= this.seuil) {
      this.verrouJusqua = maintenant + this.dureeVerrouMs;
      this.echecs = [];
    }
    return this.echecs.length;
  }
}
