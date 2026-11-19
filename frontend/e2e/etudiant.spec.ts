import { expect, test } from '@playwright/test'
import { inscrire, surveillerErreurs } from './outils.ts'

// Parcours principal d'un étudiant : inscription, bilan, défi, session, reconnexion, suppression.
test('inscription, bilan, défi tenu, déconnexion, reconnexion par code puis suppression du compte', async ({ page, context }) => {
  const erreurs = surveillerErreurs(page)

  // Inscription : code de récupération affiché une seule fois, session dans un cookie HttpOnly.
  const code = await inscrire(page)
  const session = (await context.cookies()).find((c) => c.name === 'gc_session')
  expect(session).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' })
  expect(await page.evaluate(() => document.cookie)).toBe('')
  await page.getByRole('button', { name: 'C’est noté, continuer' }).or(page.getByRole('button', { name: "C'est noté, continuer" })).click()

  // Bilan : une réponse, estimation en direct, enregistrement, résultat recalculé par l'API.
  await expect(page).toHaveURL(/\/bilan$/)
  await expect(page.getByRole('heading', { name: 'Bilan carbone' })).toBeVisible()
  const nombre = page.locator('main input[type=number]').first()
  await nombre.fill('5000')
  await expect(page.locator('[aria-live=polite] strong')).toContainText('CO2e')
  await page.getByRole('button', { name: 'Enregistrer mon bilan' }).click()
  await expect(page.getByRole('heading', { name: 'Ton bilan' })).toBeVisible()
  await expect(page.getByText(/CO2e \/ an/).first()).toBeVisible()

  // Défi : choisi dans le catalogue, puis « Tenu » avec confirmation.
  await page.getByRole('link', { name: 'Défis' }).click()
  await expect(page.getByRole('heading', { name: 'Défis de la semaine' })).toBeVisible()
  await page.getByRole('button', { name: 'Choisir ce défi' }).first().click()
  await page.getByRole('button', { name: 'Tenu', exact: true }).click()
  await page.getByRole('button', { name: /Oui, je l.ai tenu/ }).click()
  await expect(page.getByText('Validé', { exact: true })).toBeVisible()

  // La session survit au rechargement.
  await page.reload()
  await expect(page.getByText('Validé', { exact: true })).toBeVisible()

  // Déconnexion : une page protégée renvoie vers /connexion.
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.goto('/defis')
  await expect(page).toHaveURL(/\/connexion/)

  // Reconnexion avec le code : on retrouve son défi validé.
  await page.getByRole('button', { name: 'J’ai déjà un code' }).or(page.getByRole('button', { name: "J'ai déjà un code" })).click()
  await page.locator('input[name=codeRecuperation]').fill(code)
  await page.getByRole('button', { name: 'Me reconnecter' }).click()
  await expect(page).toHaveURL(/\/bilan$/)
  await page.getByRole('link', { name: 'Défis' }).click()
  await expect(page.getByText('Validé', { exact: true })).toBeVisible()

  // Suppression du compte (confirmation en deux temps) : le code ne fonctionne plus.
  await page.goto('/mon-compte')
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
  await page.getByRole('button', { name: 'Oui, supprimer définitivement' }).click()
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === 'gc_session')).toBe(false)
  const reconnexion = await page.request.post('/api/sessions', { data: { codeRecuperation: code } })
  expect(reconnexion.status()).toBe(401)

  expect(erreurs).toEqual([])
})

test('le tableau de bord public s’affiche sans compte', async ({ page }) => {
  const erreurs = surveillerErreurs(page)
  await page.goto('/tableau-de-bord')
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible()
  expect(erreurs).toEqual([])
})
