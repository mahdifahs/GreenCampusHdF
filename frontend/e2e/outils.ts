import { expect, type Page } from '@playwright/test'

// Aides communes aux parcours. L'administration est servie par l'API elle-même (port 4100), le site
// étudiant par `vite preview` (baseURL).
export const URL_ADMIN = `http://127.0.0.1:${4100}/admin/`
export const ADMIN = { prenom: process.env.E2E_ADMIN_PRENOM!, motDePasse: process.env.E2E_ADMIN_MOT_DE_PASSE! }
export const CODE = /^\S{4}-\S{4}-\S{4}-\S{4}$/

// Erreurs JavaScript de la page (exceptions et console.error), hors réponses HTTP en erreur
// attendues (401 d'une session expirée, 503 de la maintenance) que le navigateur signale aussi.
export function surveillerErreurs(page: Page) {
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(`exception : ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text())
  })
  return erreurs
}

// Crée un compte étudiant depuis /connexion et renvoie son code de récupération (affiché une fois).
export async function inscrire(page: Page, annee = 'L2') {
  await page.goto('/connexion')
  await page.locator('#filiereId').selectOption({ index: 1 })
  await page.locator('#annee').selectOption(annee)
  await page.locator('input[name=consentement]').check()
  await page.locator('form button[type=submit]').click()
  const code = (await page.locator('p').filter({ hasText: CODE }).first().textContent())!.trim()
  expect(code).toMatch(CODE)
  return code
}

export async function connecterAdmin(page: Page, prenom = ADMIN.prenom, motDePasse = ADMIN.motDePasse) {
  await page.goto(URL_ADMIN)
  await page.locator('input[name=nom]').fill(prenom)
  await page.locator('input[name=motDePasse]').fill(motDePasse)
  await page.locator('form button').click()
  await expect(page.locator('#onglets')).toBeVisible()
}
