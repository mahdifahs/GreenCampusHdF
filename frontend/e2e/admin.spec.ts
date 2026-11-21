import { expect, test } from '@playwright/test'
import { ADMIN, URL_ADMIN, connecterAdmin, surveillerErreurs } from './outils.ts'

const ONGLETS_SUPER = ['Vue d’ensemble', 'Évènements', 'Message du site', 'Questionnaire', 'Jour J', 'Vêtements', 'Participants', 'Journal', 'Sécurité', 'Comptes admin']

test('super-admin : chaque onglet s’affiche sans erreur, l’onglet survit au rechargement', async ({ page }) => {
  const erreurs = surveillerErreurs(page)
  await connecterAdmin(page)
  await expect(page.locator('#onglets [data-onglet]')).toHaveText(ONGLETS_SUPER)
  for (const titre of ONGLETS_SUPER) {
    await page.locator('#onglets [data-onglet]', { hasText: titre }).click()
    await expect(page.locator('#onglets [aria-current=page]')).toHaveText(titre)
    await expect(page.locator('#contenu h2, #contenu h3').first()).toBeVisible()
  }
  await page.reload()
  await expect(page.locator('#onglets [aria-current=page]')).toHaveText('Comptes admin')
  expect(erreurs).toEqual([])
})

test('navigation sur PC : tous les onglets visibles sans défilement, page courante marquée', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await connecterAdmin(page)
  await expect(page.locator('#onglets .menu-bouton')).toBeHidden()
  const nav = page.locator('#onglets')
  expect(await nav.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true)
  for (const titre of ONGLETS_SUPER) await expect(page.locator('#onglets [data-onglet]', { hasText: titre })).toBeInViewport()
  await page.locator('#onglets [data-onglet]', { hasText: 'Comptes admin' }).click()
  // L'onglet ouvert reste visible et garde le focus clavier.
  await expect(page.locator('#onglets [aria-current=page]')).toHaveText('Comptes admin')
  await expect(page.locator('#onglets [aria-current=page]')).toBeInViewport()
  await expect(page.locator('#onglets [aria-current=page]')).toBeFocused()
})

test('navigation sur téléphone : bouton Menu avec la page courante, liste accessible, Échap', async ({ page }) => {
  const erreurs = surveillerErreurs(page)
  await page.setViewportSize({ width: 390, height: 800 })
  await connecterAdmin(page)
  const menu = page.locator('#onglets .menu-bouton')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('Vue d’ensemble')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#onglets [data-onglet]').first()).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#onglets [data-onglet]')).toHaveText(ONGLETS_SUPER)
  await expect(page.locator('#onglets [aria-current=page]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(menu).toBeFocused()
  await expect(page.locator('#onglets [data-onglet]').first()).toBeHidden()

  await menu.click()
  await page.locator('#onglets [data-onglet]', { hasText: 'Questionnaire' }).click()
  await expect(page.getByRole('heading', { name: 'Questionnaire du bilan' })).toBeVisible()
  await expect(page.locator('#onglets .menu-bouton')).toContainText('Questionnaire')
  await expect(page.locator('#onglets .menu-bouton')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#onglets .menu-bouton')).toBeFocused()

  // Un clic à côté de la liste la referme.
  await page.locator('#onglets .menu-bouton').click()
  await page.locator('header strong').first().click()
  await expect(page.locator('#onglets .menu-bouton')).toHaveAttribute('aria-expanded', 'false')
  expect(erreurs).toEqual([])
})

test('bénévole créé par le super-admin : connexion avec le mot de passe généré, Jour J et Vêtements seulement', async ({ page, browser }) => {
  await connecterAdmin(page)
  await page.locator('#onglets [data-onglet]', { hasText: 'Comptes admin' }).click()
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
  await expect(benevole.locator('#onglets [data-onglet]')).toHaveText(['Jour J', 'Vêtements'])
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
