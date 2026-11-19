import { expect, test } from '@playwright/test'
import { URL_ADMIN, connecterAdmin, inscrire } from './outils.ts'

// Mode maintenance : basculé depuis /admin/, le site étudiant affiche sa page dédiée puis revient tout
// seul. Toujours remis en ligne à la fin, même si le test échoue (les autres parcours en dépendent).
test.afterEach(async ({ browser }) => {
  const page = await browser.newPage()
  await connecterAdmin(page)
  await page.request.put(`${URL_ADMIN.replace('/admin/', '')}/api/admin/maintenance`, {
    data: { actif: false },
    headers: { origin: new URL(URL_ADMIN).origin },
  })
  await page.close()
})

test('maintenance activée depuis l’admin : page dédiée côté étudiant, puis retour automatique', async ({ page, browser }) => {
  // Un étudiant connecté, sur ses défis.
  const etudiant = await browser.newPage()
  await inscrire(etudiant)
  await etudiant.goto('/tableau-de-bord')
  await expect(etudiant.locator('main h1')).toBeVisible()

  // L'admin passe en maintenance (fenêtre de confirmation de l'interface, pas celle du navigateur).
  await connecterAdmin(page)
  await page.getByRole('button', { name: 'Passer en maintenance' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Passer en maintenance' }).click()
  await expect(page.getByText('Site en maintenance', { exact: false }).first()).toBeVisible()

  // Côté étudiant, la prochaine requête bascule sur la page de maintenance.
  await etudiant.reload()
  await expect(etudiant.getByRole('heading', { name: 'Site en maintenance' })).toBeVisible()

  // Remise en ligne : la page étudiante revérifie toute seule (toutes les 30 s) et recharge.
  await page.getByRole('button', { name: 'Remettre le site en ligne' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Remettre en ligne' }).click()
  await expect(page.getByText('Site en ligne.', { exact: true })).toBeVisible()
  await expect(etudiant.getByRole('heading', { name: 'Site en maintenance' })).toHaveCount(0, { timeout: 45_000 })
  await expect(etudiant.locator('main h1')).toBeVisible()
  await etudiant.close()
})
