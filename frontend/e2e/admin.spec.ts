import { expect, test } from '@playwright/test'
import { ADMIN, URL_ADMIN, connecterAdmin, surveillerErreurs } from './outils.ts'

const ONGLETS_SUPER = ['Vue d’ensemble', 'Évènements', 'Message du site', 'Jour J', 'Vêtements', 'Participants', 'Journal', 'Sécurité', 'Comptes admin']

test('super-admin : chaque onglet s’affiche sans erreur, l’onglet survit au rechargement', async ({ page }) => {
  const erreurs = surveillerErreurs(page)
  await connecterAdmin(page)
  await expect(page.locator('#onglets button')).toHaveText(ONGLETS_SUPER)
  for (const titre of ONGLETS_SUPER) {
    await page.locator('#onglets button', { hasText: titre }).click()
    await expect(page.locator('#onglets button.actif')).toHaveText(titre)
    await expect(page.locator('#contenu h2, #contenu h3').first()).toBeVisible()
  }
  await page.reload()
  await expect(page.locator('#onglets button.actif')).toHaveText('Comptes admin')
  expect(erreurs).toEqual([])
})

test('bénévole créé par le super-admin : connexion avec le mot de passe généré, Jour J et Vêtements seulement', async ({ page, browser }) => {
  await connecterAdmin(page)
  await page.locator('#onglets button', { hasText: 'Comptes admin' }).click()
  const prenom = `Benevole${Date.now() % 100000}`
  const formulaire = page.locator('#contenu form').filter({ has: page.locator('input[name=prenom]') })
  await formulaire.locator('input[name=prenom]').fill(prenom)
  await formulaire.locator('select[name=role]').selectOption('BENEVOLE')
  await formulaire.locator('button').click()
  // Mot de passe généré par l'API, affiché une seule fois.
  const motDePasse = (await page.locator('#contenu .mot-de-passe, #contenu code').first().textContent())!.trim()
  expect(motDePasse.length).toBeGreaterThanOrEqual(12)

  const benevole = await browser.newPage()
  const erreurs = surveillerErreurs(benevole)
  await connecterAdmin(benevole, prenom, motDePasse)
  await expect(benevole.locator('#onglets button')).toHaveText(['Jour J', 'Vêtements'])
  // Le serveur refuse aussi le reste, quoi qu'affiche l'interface.
  const refus = await benevole.request.get(`${URL_ADMIN.replace('/admin/', '')}/api/admin/stats`)
  expect(refus.status()).toBe(403)
  expect(erreurs).toEqual([])
  await benevole.close()
})

test('déconnexion admin : un cookie recopié avant ne vaut plus rien', async ({ page, context }) => {
  await connecterAdmin(page)
  const copie = (await context.cookies()).find((c) => c.name === 'gc_admin')!
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.locator('input[name=motDePasse]')).toBeVisible()
  await context.addCookies([copie])
  await page.reload()
  await expect(page.locator('input[name=motDePasse]')).toBeVisible()
  await expect(page.locator('#onglets')).toHaveCount(0)
  expect(ADMIN.prenom).toBeTruthy()
})
