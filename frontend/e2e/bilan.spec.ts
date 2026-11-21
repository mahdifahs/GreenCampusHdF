import { expect, test } from '@playwright/test'
import { inscrire, surveillerErreurs } from './outils.ts'

const champ = (dottedName: string) => `[id="${dottedName}"]`
const BUS = 'transport . transports commun . bus . heures par semaine'
const ROUGE = 'alimentation . plats . viande rouge . nombre'
const VEGETARIEN = 'alimentation . plats . végétarien . nombre'

// Bornes du questionnaire : une valeur hors bornes ou plus de 14 repas par semaine bloquent l'enregistrement.
test('bilan : bornes des réponses et total des repas plafonné à 14', async ({ page }) => {
  const erreurs = surveillerErreurs(page)
  await inscrire(page)
  await page.getByRole('button', { name: 'C’est noté, continuer' }).or(page.getByRole('button', { name: "C'est noté, continuer" })).click()
  await expect(page.getByRole('heading', { name: 'Bilan carbone' })).toBeVisible()
  const enregistrer = page.getByRole('button', { name: 'Enregistrer mon bilan' })

  await page.locator(champ('transport . transports commun . bus . présent')).selectOption('oui')
  const bus = page.locator(champ(BUS))
  await bus.fill('50')
  await expect(page.getByText('Entre 0 et 40 h/semaine.')).toBeVisible()
  await expect(bus).toHaveAttribute('aria-invalid', 'true')
  await expect(enregistrer).toBeDisabled()
  await bus.fill('40')
  await expect(page.getByText('Entre 0 et 40 h/semaine.')).toBeHidden()
  await expect(enregistrer).toBeEnabled()

  await page.locator(champ(ROUGE)).fill('10')
  await page.locator(champ(VEGETARIEN)).fill('6')
  await expect(page.getByText(/Repas renseignés : 16 \/ 14/)).toBeVisible()
  await expect(enregistrer).toBeDisabled()
  await page.locator(champ(VEGETARIEN)).fill('4')
  await expect(page.getByText(/Repas renseignés : 14 \/ 14/)).toBeVisible()

  await enregistrer.click()
  await expect(page.getByRole('heading', { name: 'Ton bilan' })).toBeVisible()
  expect(erreurs).toEqual([])
})
