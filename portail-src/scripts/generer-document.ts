/**
 * Génère un document Mana hors navigateur, à partir d'un état exporté (JSON) :
 *   npx tsx scripts/generer-document.ts recu <etat.json> <raisonSociale> <exercice> [association] [dossierSortie]
 *   npx tsx scripts/generer-document.ts etat-annuel <etat.json> <raisonSociale> <exercice> [dossierSortie]
 * Sert au support (reproduire un document d'un client) et aux tests ; le même code que le site.
 */
import fs from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import type { AppState } from '../src/types'
import { aggParSociete } from '../src/lib/selectors'
import { pdfEtatAnnuel, pdfRecuFiscal } from '../src/lib/pdf'

const [, , quoi, fichier, raison, exerciceTexte, ...reste] = process.argv
if (!quoi || !fichier || !raison || !exerciceTexte) {
  console.error('Usage : generer-document.ts recu|etat-annuel <etat.json> <raisonSociale> <exercice> [association] [dossier]')
  process.exit(1)
}
const dossier = (quoi === 'recu' ? reste[1] : reste[0]) ?? '.'
fs.mkdirSync(dossier, { recursive: true })
// jsPDF « save » écrit un fichier au lieu de déclencher un téléchargement.
// jsPDF copie ses méthodes (jsPDF.API) sur chaque instance à la construction : on remplace à la source.
const sauver = function (this: jsPDF, nom: string) {
  const cible = path.join(dossier, nom)
  fs.writeFileSync(cible, Buffer.from(this.output('arraybuffer')))
  console.log('écrit :', cible)
  return this
}
;(jsPDF as unknown as { API: { save: unknown } }).API.save = sauver
;(jsPDF.prototype as unknown as { save: unknown }).save = sauver

const etat = JSON.parse(fs.readFileSync(fichier, 'utf8')) as AppState
const exercice = Number(exerciceTexte)
const agg = aggParSociete(etat, exercice).find((a) => a.societe.raisonSociale.toLowerCase() === raison.toLowerCase())
if (!agg) {
  console.error(`Société introuvable : ${raison}. Disponibles : ${etat.societes.map((s) => s.raisonSociale).join(', ')}`)
  process.exit(1)
}
console.log(`${agg.societe.raisonSociale} · ${agg.saisies.length} saisies · base ${agg.baseBrute.toFixed(2)} € · semaines sans relevé : ${agg.semainesSansReleve.length}`)
if (quoi === 'recu') await pdfRecuFiscal(agg, exercice, reste[0] || undefined)
else await pdfEtatAnnuel(agg, exercice)
