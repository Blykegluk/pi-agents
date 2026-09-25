/**
 * Import de magasins en nombre depuis un fichier CSV (réseau de plusieurs dizaines de
 * points de vente). Une ligne = un magasin ; la société est reconnue par son SIREN (ou sa
 * raison sociale) et créée si besoin. Module pur : lecture, contrôle, préparation ; la
 * vérification des SIREN au registre et l'enregistrement se font dans le composant.
 */
import type { Collecteur, Magasin, Societe, AppState } from '../types.ts'
import { SUCCESS_FEE_PCT } from './calc.ts'
import { normaliserSiren, sirenValide } from './entreprise.ts'
import { FREQUENCES, PLAGES } from './annuaire.ts'
import { PROFILS_PRESETS } from './bordereau.ts'
import { uid } from './storage.ts'

/** Colonnes reconnues (en-têtes normalisés : minuscules, sans accents, espaces → _). */
export const COLONNES = ['societe', 'siren', 'ca_ht', 'marge_pct', 'magasin', 'enseigne', 'adresse', 'association', 'contact', 'telephone', 'email', 'frequence', 'plage', 'jours', 'cout_kg_fl'] as const
export type Colonne = (typeof COLONNES)[number]

const ALIAS: Record<string, Colonne> = {
  societe: 'societe', raison_sociale: 'societe', raisonsociale: 'societe', entreprise: 'societe',
  siren: 'siren', siret: 'siren',
  ca_ht: 'ca_ht', ca: 'ca_ht', chiffre_d_affaires: 'ca_ht', chiffre_daffaires: 'ca_ht', ca_annuel: 'ca_ht',
  marge_pct: 'marge_pct', marge: 'marge_pct', marge_brute: 'marge_pct', taux_de_marge: 'marge_pct',
  magasin: 'magasin', nom: 'magasin', point_de_vente: 'magasin', nom_du_magasin: 'magasin',
  enseigne: 'enseigne',
  adresse: 'adresse', adresse_du_magasin: 'adresse',
  association: 'association', collecteur: 'association', asso: 'association',
  contact: 'contact', referent: 'contact',
  telephone: 'telephone', tel: 'telephone',
  email: 'email', mail: 'email', courriel: 'email', email_association: 'email',
  frequence: 'frequence', rythme: 'frequence',
  plage: 'plage', creneau: 'plage', horaire: 'plage',
  jours: 'jours', jours_de_passage: 'jours',
  cout_kg_fl: 'cout_kg_fl', cout_kg: 'cout_kg_fl', cout_fl: 'cout_kg_fl',
}

export const MODELE_CSV =
  'societe;siren;ca_ht;marge_pct;magasin;enseigne;adresse;association;contact;telephone;email;frequence;plage;jours;cout_kg_fl\n' +
  'Bio Réseau SAS;123456789;12000000;31;Paris 11 Léon Blum;Naturalia;12 rue Léon Blum, 75011 Paris;Banque Alimentaire de Paris;Mme Durand;01 23 45 67 89;ramasse@ba-paris.org;Quotidienne;Fin de journée;lundi au samedi;2.2\n' +
  'Bio Réseau SAS;123456789;;;Paris 18 Ornano;Naturalia;40 boulevard Ornano, 75018 Paris;Le panier du lien;M. Martin;;contact@panierdulien.org;2 à 3 fois par semaine;Matin;mardi, jeudi, samedi;\n'

function normaliserEntete(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Lit un CSV (séparateur ; , ou tabulation détecté, guillemets gérés). */
export function lireCSV(texte: string): { entetes: string[]; lignes: string[][] } {
  const propre = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const premiere = propre.split('\n').find((l) => l.trim()) ?? ''
  const sep = [';', ',', '\t'].map((s) => [s, (premiere.match(new RegExp(s === '\t' ? '\t' : `\\${s}`, 'g')) ?? []).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let entreGuillemets = false
  for (let i = 0; i < propre.length; i++) {
    const c = propre[i]
    if (entreGuillemets) {
      if (c === '"' && propre[i + 1] === '"') {
        champ += '"'
        i++
      } else if (c === '"') entreGuillemets = false
      else champ += c
    } else if (c === '"') entreGuillemets = true
    else if (c === sep) {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n') {
      ligne.push(champ)
      if (ligne.some((x) => x.trim())) lignes.push(ligne)
      ligne = []
      champ = ''
    } else champ += c
  }
  ligne.push(champ)
  if (ligne.some((x) => x.trim())) lignes.push(ligne)
  const [entetes = [], ...corps] = lignes
  return { entetes: entetes.map((h) => h.trim()), lignes: corps.map((l) => l.map((x) => x.trim())) }
}

export interface LigneImport {
  numero: number
  valeurs: Partial<Record<Colonne, string>>
}

/** Associe chaque colonne du fichier à une colonne connue ; les colonnes inconnues sont ignorées et signalées. */
export function interpreterCSV(texte: string): { lignes: LigneImport[]; colonnesInconnues: string[]; colonnesReconnues: Colonne[] } {
  const { entetes, lignes } = lireCSV(texte)
  const correspondance = entetes.map((h) => ALIAS[normaliserEntete(h)] ?? null)
  const colonnesInconnues = entetes.filter((_, i) => !correspondance[i])
  const colonnesReconnues = correspondance.filter((c): c is Colonne => !!c)
  return {
    colonnesInconnues,
    colonnesReconnues,
    lignes: lignes.map((l, i) => {
      const valeurs: Partial<Record<Colonne, string>> = {}
      l.forEach((v, j) => {
        const col = correspondance[j]
        if (col && v !== '') valeurs[col] = v
      })
      return { numero: i + 2, valeurs }
    }),
  }
}

function nombre(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v.replace(/\s/g, '').replace('€', '').replace('%', '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function sansAccents(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** « quotidienne », « 2 à 3 fois », « hebdo », « tous les 15 jours »… → une option de FREQUENCES. */
export function frequenceDepuisTexte(v: string | undefined): Pick<Collecteur, 'frequence' | 'frequenceAutre'> {
  if (!v) return {}
  const n = sansAccents(v)
  if (/quotid|tous les jours|chaque jour/.test(n)) return { frequence: FREQUENCES[0] }
  if (/2 ?a ?3|deux a trois|plusieurs fois/.test(n)) return { frequence: FREQUENCES[1] }
  if (/hebdo|1 fois par semaine|une fois par semaine|chaque semaine/.test(n)) return { frequence: FREQUENCES[2] }
  return { frequence: 'Autre', frequenceAutre: v }
}

export function plageDepuisTexte(v: string | undefined): Pick<Collecteur, 'plage' | 'plageAutre'> {
  if (!v) return {}
  const n = sansAccents(v)
  if (/matin/.test(n)) return { plage: PLAGES[0] }
  if (/midi/.test(n)) return { plage: PLAGES[1] }
  if (/fin de journee|soir|apres[- ]midi/.test(n)) return { plage: PLAGES[2] }
  return { plage: 'Autre', plageAutre: v }
}

export interface SocieteAImporter {
  societe: Societe
  nouvelle: boolean
  /** Marge absente du fichier : valeur par défaut, à vérifier. */
  margeParDefaut: boolean
}

export interface MagasinAImporter {
  ligne: number
  magasin: Magasin
  societe: SocieteAImporter
  /** Un magasin de même nom existe déjà pour cette société. */
  dejaPresent: boolean
  avertissements: string[]
}

export interface PlanImport {
  societes: SocieteAImporter[]
  magasins: MagasinAImporter[]
  erreurs: { ligne: number; message: string }[]
}

export const MARGE_PAR_DEFAUT = 30
export const COUT_KG_FL_PAR_DEFAUT = 2.2

/** Prépare ce que l'import va créer, ligne par ligne, sans rien enregistrer. */
export function preparerImport(lignes: LigneImport[], etat: AppState, maintenant = new Date()): PlanImport {
  const societes = new Map<string, SocieteAImporter>()
  const magasins: MagasinAImporter[] = []
  const erreurs: PlanImport['erreurs'] = []
  const iso = maintenant.toISOString()

  for (const l of lignes) {
    const v = l.valeurs
    const nomMagasin = v.magasin?.trim()
    if (!nomMagasin) {
      erreurs.push({ ligne: l.numero, message: 'nom du magasin manquant' })
      continue
    }
    const sirenBrut = v.siren?.trim() ?? ''
    const siren = sirenBrut ? normaliserSiren(sirenBrut) : ''
    if (sirenBrut && !sirenValide(sirenBrut)) {
      erreurs.push({ ligne: l.numero, message: `SIREN invalide : ${sirenBrut}` })
      continue
    }
    const raison = v.societe?.trim() ?? ''
    if (!siren && !raison) {
      erreurs.push({ ligne: l.numero, message: 'société manquante (SIREN ou raison sociale)' })
      continue
    }
    const cleSociete = siren || `nom:${sansAccents(raison)}`
    let soc = societes.get(cleSociete)
    if (!soc) {
      const existante =
        etat.societes.find((s) => siren && s.siren === siren) ??
        etat.societes.find((s) => raison && sansAccents(s.raisonSociale) === sansAccents(raison))
      if (existante) {
        soc = { societe: existante, nouvelle: false, margeParDefaut: false }
      } else {
        const marge = nombre(v.marge_pct)
        soc = {
          nouvelle: true,
          margeParDefaut: marge === undefined,
          societe: {
            id: uid(),
            raisonSociale: raison || `Société ${siren}`,
            siren,
            caHT: nombre(v.ca_ht) ?? 0,
            margePct: marge ?? MARGE_PAR_DEFAUT,
            successFeePct: SUCCESS_FEE_PCT,
            verification: { apiStatut: 'non_verifie' },
            creeLe: iso,
          },
        }
      }
      societes.set(cleSociete, soc)
    }
    const avertissements: string[] = []
    const dejaPresent = etat.magasins.some((m) => m.societeId === soc!.societe.id && sansAccents(m.nom) === sansAccents(nomMagasin))
    const collecteurs: Collecteur[] = []
    if (v.association?.trim()) {
      collecteurs.push({
        nom: v.association.trim(),
        contact: v.contact?.trim() ?? '',
        telephone: v.telephone?.trim() || undefined,
        email: v.email?.trim() || undefined,
        ...frequenceDepuisTexte(v.frequence),
        ...plageDepuisTexte(v.plage),
        jours: v.jours?.trim() ?? '',
        eligibilite: 'inconnue',
      })
      if (!v.frequence && !v.jours) avertissements.push('rythme de passage non renseigné : la surveillance ne pourra pas suivre les passages')
    } else {
      avertissements.push('aucune association : le magasin démarre sans collecte')
    }
    const coutKgFL = nombre(v.cout_kg_fl) ?? COUT_KG_FL_PAR_DEFAUT
    const profil = { colis: true, categories: PROFILS_PRESETS.tout_scanne.categories.map((c) => ({ ...c })) }
    magasins.push({
      ligne: l.numero,
      societe: soc,
      dejaPresent,
      avertissements,
      magasin: {
        id: uid(),
        societeId: soc.societe.id,
        nom: nomMagasin,
        enseigne: v.enseigne?.trim() || undefined,
        adresse: v.adresse?.trim() || undefined,
        coutKgFL,
        frequenceSaisie: 'hebdomadaire',
        modeFL: 'inclus',
        profilBordereau: profil,
        collecteurs,
        creeLe: iso,
        versionsParametres: [{ version: 1, date: iso, margePct: soc.societe.margePct, coutKgFL }],
      },
    })
  }
  return { societes: [...societes.values()], magasins, erreurs }
}
