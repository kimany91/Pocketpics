/**
 * Résultat d'une pub récompensée :
 *  - `rewarded` : regardée jusqu'au bout, la récompense est due ;
 *  - `skipped` : fermée avant la fin, pas de récompense ;
 *  - `unavailable` : aucune pub à montrer (pas de réseau, pas de pub en stock, refus du consentement).
 */
export type AdResult = 'rewarded' | 'skipped' | 'unavailable';
