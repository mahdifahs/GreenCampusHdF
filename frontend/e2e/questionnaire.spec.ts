import { expect, test } from '@playwright/test'
import { connecterAdmin, inscrire, surveillerErreurs } from './outils.ts'

// Questionnaire géré depuis l'admin : question « information » ajoutée, posée à l'étudiant (hors calcul),
// statistiques visibles dans l'admin, puis désactivée (plus posée, réponses gardées).
test('questionnaire : question d’information ajoutée par l’admin, répondue par un étudiant, puis désactivée', async ({ page, browser }) => {
  const erreursAdmin = surveillerErreurs(page)
  const texte = `Comment viens-tu au campus ? (${Date.now() % 100000})`
  await connecterAdmin(page)
  await page.locator('#onglets [data-onglet]', { hasText: 'Questionnaire' }).click()
  await expect(page.getByRole('heading', { name: 'Questionnaire du bilan' })).toBeVisible()
  await page.getByRole('button', { name: 'Question d’information' }).click()
  await page.locator('#info-texte').fill(texte)
  await page.locator('#info-format').selectOption('CHOIX')
  await page.locator('#info-choix').fill('À pied\nBus\nVoiture')
  await page.getByRole('button', { name: 'Ajouter la question' }).click()
  const ligne = page.locator('#contenu tr', { hasText: texte })
  await expect(ligne).toContainText('À pied · Bus · Voiture')
  await expect(ligne).toContainText('Aucune réponse pour le moment.')

  const etudiant = await browser.newPage()
  const erreurs = surveillerErreurs(etudiant)
  await inscrire(etudiant)
  await etudiant.getByRole('button', { name: 'C’est noté, continuer' }).or(etudiant.getByRole('button', { name: "C'est noté, continuer" })).click()
  await expect(etudiant.getByRole('heading', { name: 'Questions de l’équipe' })).toBeVisible()
  await etudiant.getByLabel(texte).selectOption('Bus')
  await etudiant.getByRole('button', { name: 'Enregistrer mon bilan' }).click()
  await expect(etudiant.getByRole('heading', { name: 'Ton bilan' })).toBeVisible()
  // Reprise du bilan : la réponse est retrouvée.
  await etudiant.getByRole('button', { name: 'Reprendre et compléter mes réponses' }).click()
  await expect(etudiant.getByLabel(texte)).toHaveValue('Bus')
  expect(erreurs).toEqual([])

  await page.reload()
  await expect(ligne).toContainText('1 répondant(s) · À pied : 0 · Bus : 1 · Voiture : 0')
  await expect(ligne.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  await ligne.getByRole('button', { name: 'Désactiver' }).click()
  await page.locator('dialog.dialogue button', { hasText: 'Désactiver' }).click()
  await expect(ligne).toContainText('désactivée')

  await etudiant.reload()
  await expect(etudiant.getByRole('heading', { name: 'Bilan carbone' }).or(etudiant.getByRole('heading', { name: 'Ton bilan' }))).toBeVisible()
  await etudiant.getByRole('button', { name: 'Reprendre et compléter mes réponses' }).click()
  await expect(etudiant.getByLabel(texte)).toHaveCount(0)
  await etudiant.close()
  expect(erreursAdmin).toEqual([])
})
