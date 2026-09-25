/**
 * Vérification du calendrier des passages et du moteur de signaux.
 * Lancer : npm run verify:passages
 */
import type { AppState, Magasin, Saisie } from '../src/types.ts'
import { calendrierPassages, heureFinCreneau, instantParis, joursDepuisTexte, limitePassage, rythmeCollecteur } from '../src/lib/passages.ts'
import { calculerSignaux } from '../src/lib/signaux.ts'
import { listeJours } from '../src/lib/suivi.ts'
import { aFaire, santeReseau } from '../src/lib/reseau.ts'
import { messageRappels, rappelsDuJour } from '../src/lib/rappels.ts'
import { signauxResolution } from '../src/lib/resolution.ts'
import { frequenceDepuisTexte, interpreterCSV, lireCSV, preparerImport, MODELE_CSV } from '../src/lib/importMagasins.ts'

let echecs = 0
function ok(nom: string, cond: boolean, detail = '') {
  if (!cond) echecs++
  console.log(`${cond ? '✓' : '✗'} ${nom}${detail ? ' — ' + detail : ''}`)
}
function egal<T>(nom: string, obtenu: T, attendu: T) {
  const o = JSON.stringify(obtenu)
  const a = JSON.stringify(attendu)
  ok(nom, o === a, o === a ? '' : `obtenu ${o}, attendu ${a}`)
}

console.log('— Lecture des jours —')
egal('« Mardi et vendredi matin »', joursDepuisTexte('Mardi et vendredi matin'), [2, 5])
egal('« Mercredi après-midi »', joursDepuisTexte('Mercredi après-midi'), [3])
egal('« du lundi au dimanche »', joursDepuisTexte('du lundi au dimanche'), [1, 2, 3, 4, 5, 6, 7])
egal('« du lundi au vendredi »', joursDepuisTexte('du lundi au vendredi'), [1, 2, 3, 4, 5])
egal('« tous les jours sauf dimanche »', joursDepuisTexte('tous les jours sauf dimanche'), [1, 2, 3, 4, 5, 6])
egal('« lun, mer, ven »', joursDepuisTexte('lun, mer, ven'), [1, 3, 5])
egal('« Lundis et jeudis »', joursDepuisTexte('Lundis et jeudis'), [1, 4])
egal('« le matin au marché »', joursDepuisTexte('le matin au marché'), null)
egal('vide', joursDepuisTexte(''), null)

console.log('— Rythme —')
egal('Quotidienne sans jours → lundi-samedi par défaut', rythmeCollecteur({ frequence: 'Quotidienne', jours: '' }).jours, [1, 2, 3, 4, 5, 6])
egal('Quotidienne + jours précisés → jours', rythmeCollecteur({ frequence: 'Quotidienne', jours: 'du lundi au dimanche' }).jours, [1, 2, 3, 4, 5, 6, 7])
egal('2 à 3 fois sans jours → 2 par semaine', rythmeCollecteur({ frequence: '2 à 3 fois par semaine', jours: '' }).parPeriode, 2)
egal('Hebdomadaire sans jour → 1 par semaine', rythmeCollecteur({ frequence: 'Hebdomadaire', jours: '' }).parPeriode, 1)
egal('Hebdomadaire + mercredi → jours', rythmeCollecteur({ frequence: 'Hebdomadaire', jours: 'Mercredi après-midi' }).jours, [3])
const quinz = rythmeCollecteur({ frequence: 'Autre', frequenceAutre: 'tous les 15 jours', jours: '' })
egal('Autre « tous les 15 jours » → 1 / 2 semaines', [quinz.parPeriode, quinz.periodeSemaines], [1, 2])
egal('Autre « 3 fois par semaine »', rythmeCollecteur({ frequence: 'Autre', frequenceAutre: '3 fois par semaine', jours: '' }).parPeriode, 3)
egal('rien → inconnu', rythmeCollecteur({ frequence: '', jours: '' }).source, 'inconnu')

console.log('— Créneaux et heure de Paris —')
egal('Fin de journée → 20 h', heureFinCreneau({ plage: 'Fin de journée (17 h – 20 h)' }), 20)
egal('Autre « entre 9h et 11h30 » → 11 h', heureFinCreneau({ plage: 'Autre', plageAutre: 'entre 9h et 11h30' }), 11)
egal('20 h Paris le 22/09/2026 (été) = 18 h UTC', instantParis('2026-09-22', 20).toISOString(), '2026-09-22T18:00:00.000Z')
egal('20 h Paris le 15/01/2026 (hiver) = 19 h UTC', instantParis('2026-01-15', 20).toISOString(), '2026-01-15T19:00:00.000Z')
egal('limite = fin de créneau + 24 h', limitePassage({ plage: 'Matin (7 h – 10 h)' }, '2026-09-22').toISOString(), '2026-09-23T08:00:00.000Z')

// ---------- Calendrier sur un cas réel : quotidien, bordereaux du 12 au 19 septembre ----------
function saisie(magasinId: string, jour: string, collecteur = 'Le panier du lien'): Saisie {
  return {
    id: `s-${magasinId}-${jour}`,
    magasinId,
    semaine: '2026-W38',
    jour,
    type: 'don',
    origine: 'bordereau',
    collecteur,
    pvEmballes: 100,
    kgFL: 5,
    justificatifs: [],
    horodatage: `${jour}T18:00:00.000Z`,
    margePctAppliquee: 30,
    coutKgFLApplique: 2,
  }
}
const leonBlum: Magasin = {
  id: 'lb',
  societeId: 'aejb',
  nom: 'Léon Blum',
  coutKgFL: 2,
  collecteurs: [{ nom: 'Le panier du lien', contact: '', frequence: 'Quotidienne', plage: 'Fin de journée (17 h – 20 h)', jours: '' }],
  creeLe: '2026-08-01T00:00:00.000Z',
  versionsParametres: [],
}
const bordereaux = ['2026-09-12', '2026-09-14', '2026-09-17', '2026-09-18', '2026-09-19'].map((j) => saisie('lb', j))

console.log('— Calendrier —')
// Évalué le mardi 22 septembre à 10 h Paris : le lundi 21 (fin 20 h) n'a pas 24 h → en attente ; le samedi 19 fait.
const cal = calendrierPassages(leonBlum, bordereaux, { du: '2026-09-14', au: '2026-09-27', maintenant: new Date('2026-09-22T08:00:00.000Z') })
const parDate = Object.fromEntries(cal.passages.map((p) => [p.date, p.statut]))
egal('14/09 fait', parDate['2026-09-14'], 'fait')
egal('15/09 manqué', parDate['2026-09-15'], 'manque')
egal('16/09 manqué', parDate['2026-09-16'], 'manque')
egal('19/09 fait', parDate['2026-09-19'], 'fait')
ok('20/09 (dimanche) non attendu', !('2026-09-20' in parDate))
egal('21/09 en attente (moins de 24 h après 20 h)', parDate['2026-09-21'], 'en_attente')
egal('22/09 à venir', parDate['2026-09-22'], 'a_venir')
egal('série : 0 manqué (dernier passage évalué fait)', cal.series[0].manques, 0)

// Évalué le vendredi 25 septembre à 8 h : 21, 22, 23 manqués → 3 ; 24 en attente.
const cal2 = calendrierPassages(leonBlum, bordereaux, { du: '2026-09-14', au: '2026-09-27', maintenant: new Date('2026-09-25T06:00:00.000Z') })
egal('série de 3 manqués (21, 22, 23)', cal2.series[0].dates, ['2026-09-21', '2026-09-22', '2026-09-23'])
egal('dernier bordereau 19/09', cal2.series[0].dernierFait, '2026-09-19')

// Avant le premier bordereau, rien n'est attendu : la collecte n'avait pas commencé.
const calAvant = calendrierPassages(leonBlum, bordereaux, { du: '2026-08-31', au: '2026-09-13', maintenant: new Date('2026-09-25T06:00:00.000Z') })
egal('aucun passage attendu avant le 12/09 (premier bordereau)', calAvant.passages.map((p) => p.date), ['2026-09-12'])
ok('aucun calendrier sans bordereau du tout', calendrierPassages(leonBlum, [], { du: '2026-09-14', au: '2026-09-20' }).passages.length === 0)

// Tolérance : bordereau daté du lendemain d'un jour attendu, jour non attendu lui-même.
const hebdo: Magasin = { ...leonBlum, id: 'h', collecteurs: [{ nom: 'Restos', contact: '', frequence: 'Hebdomadaire', jours: 'mercredi', plage: 'Matin (7 h – 10 h)' }] }
const cal3 = calendrierPassages(hebdo, [saisie('h', '2026-09-09', 'Restos'), saisie('h', '2026-09-17', 'Restos')], { du: '2026-09-07', au: '2026-09-20', maintenant: new Date('2026-09-25T06:00:00.000Z') })
egal('mercredi 9 fait, mercredi 16 couvert par le bordereau du jeudi 17 (décalé)', cal3.passages.map((p) => [p.statut, !!p.decale]), [['fait', false], ['fait', true]])

// Rythme au compte : 2 par semaine, 1 seul bordereau la semaine 38, semaine 39 en cours.
const compte: Magasin = { ...leonBlum, id: 'c', collecteurs: [{ nom: 'Linkee', contact: '', frequence: '2 à 3 fois par semaine', jours: '' }] }
const cal4 = calendrierPassages(compte, [saisie('c', '2026-09-16', 'Linkee')], { du: '2026-09-14', au: '2026-09-27', maintenant: new Date('2026-09-25T06:00:00.000Z') })
egal('semaine 38 : 1 fait sur 2 → manqué (1)', [cal4.passages[0].statut, cal4.passages[0].periode?.faits], ['manque', 1])
egal('semaine 39 en cours → à venir', cal4.passages[1].statut, 'a_venir')
egal('série = 1 manqué', cal4.series[0].manques, 1)

// Déclaration hebdomadaire sans jour : la semaine est couverte.
const semaineDeclaree: Saisie = { ...saisie('lb', '2026-09-15'), id: 'sem', jour: undefined, origine: undefined, semaine: '2026-W38' }
const cal5 = calendrierPassages(leonBlum, [semaineDeclaree], { du: '2026-09-14', au: '2026-09-20', maintenant: new Date('2026-09-25T06:00:00.000Z') })
ok('semaine déclarée sans jour → tous les passages « déclarés à la semaine »', cal5.passages.every((p) => p.statut === 'declare_semaine'))

console.log('— Réponses du magasin —')
const rep = (date: string, reponse: 'venu_sans_don' | 'pas_venu' | 'bordereau_a_saisir' | 'ferme', le = '2026-09-24T08:00:00.000Z') => ({ id: 'r' + date + reponse, magasinId: 'lb', collecteur: 'Le panier du lien', date, reponse, le })
const opts = { du: '2026-09-14', au: '2026-09-27', maintenant: new Date('2026-09-25T06:00:00.000Z') }
const calF = calendrierPassages(leonBlum, bordereaux, { ...opts, reponses: [rep('2026-09-21', 'ferme')] })
ok('« fermé » le 21 : plus attendu, série 22-23 = 2', !calF.passages.some((p) => p.date === '2026-09-21') && calF.series[0].manques === 2)
const calV = calendrierPassages(leonBlum, bordereaux, { ...opts, reponses: [rep('2026-09-22', 'venu_sans_don')] })
egal('« venu sans don » le 22 : fait, la série repart (23 seul)', [calV.passages.find((p) => p.date === '2026-09-22')?.statut, calV.series[0].manques], ['fait', 1])
const calP = calendrierPassages(leonBlum, bordereaux, { ...opts, reponses: [rep('2026-09-24', 'pas_venu')] })
egal('« pas venu » le 24 : manqué tout de suite, 1 confirmé, série 4', [calP.passages.find((p) => p.date === '2026-09-24')?.statut, calP.series[0].confirmes, calP.series[0].manques], ['manque', 1, 4])
const calS = calendrierPassages(leonBlum, bordereaux, { ...opts, reponses: [rep('2026-09-22', 'bordereau_a_saisir', '2026-09-24T08:00:00.000Z')] })
egal('« bordereau à saisir » (il y a 22 h) : en attente', calS.passages.find((p) => p.date === '2026-09-22')?.statut, 'en_attente')
const calS2 = calendrierPassages(leonBlum, bordereaux, { ...opts, reponses: [rep('2026-09-22', 'bordereau_a_saisir', '2026-09-21T08:00:00.000Z')] })
egal('« bordereau à saisir » (il y a 4 jours) : de nouveau manqué', calS2.passages.find((p) => p.date === '2026-09-22')?.statut, 'manque')

console.log('— Formulation des dates —')
egal('même mois', listeJours(['2026-09-21', '2026-09-22', '2026-09-23']), '21, 22 et 23 septembre')
egal('deux mois', listeJours(['2026-09-30', '2026-10-01']), '30 septembre et 1er octobre')
egal('un seul jour', listeJours(['2026-10-01']), '1er octobre')

console.log('— Signaux —')
const etat: AppState = {
  schema: 2,
  societes: [
    { id: 'aejb', raisonSociale: 'AEJB', siren: '852200534', caHT: 2_000_000, margePct: 30, successFeePct: 30, verification: { apiStatut: 'verifie' }, creeLe: '2026-08-01T00:00:00.000Z', contrat: { id: 'c', version: '1', signeLe: '2026-08-01', email: 'x', nomSignataire: 'x' } },
    { id: 'jab', raisonSociale: 'JAB', siren: '904455177', caHT: 1_677_304, margePct: 30, successFeePct: 30, verification: { apiStatut: 'verifie' }, creeLe: '2026-08-01T00:00:00.000Z' },
  ],
  magasins: [
    leonBlum,
    { ...leonBlum, id: 'orn', societeId: 'jab', nom: 'Ornano', collecteurs: [{ nom: 'Le panier du lien', contact: '', frequence: '', jours: 'du lundi au dimanche' }] },
    { ...leonBlum, id: 'neuf', societeId: 'jab', nom: 'Nouveau', collecteurs: [], creeLe: '2026-08-15T00:00:00.000Z', miseEnPlace: { faites: ['gisement'] } },
  ],
  saisies: [
    ...bordereaux,
    ...['2026-09-12', '2026-09-14', '2026-09-17', '2026-09-18', '2026-09-19'].map((j) => saisie('orn', j)),
    { ...saisie('lb', '2026-09-15'), id: 'rel', jour: undefined, origine: 'releve', releveMois: '2026-08', semaine: '2026-W36' },
  ],
  factures: [],
  clotures: [],
}
const signaux = calculerSignaux(etat, new Date('2026-09-25T06:00:00.000Z'))
for (const s of signaux) console.log(`   [${s.niveau}] ${s.titre}`)
const types = signaux.map((s) => `${s.type}:${s.magasinId ?? s.societeId}`)
ok('Léon Blum : alerte 3 passages manqués', signaux.some((s) => s.type === 'passages_manques' && s.magasinId === 'lb' && s.niveau === 'alerte'))
ok('Ornano (7 j/7) : 21→23 + dimanche 20 = 4 manqués', signaux.some((s) => s.type === 'passages_manques' && s.magasinId === 'orn' && s.detail.manques === 4))
ok('JAB : contrat non signé', types.includes('contrat_non_signe:jab'))
ok('AEJB : pas de signal contrat', !types.includes('contrat_non_signe:aejb'))
ok('Nouveau : mise en place inachevée (créé il y a 41 jours)', types.includes('mise_en_place_incomplete:neuf'))
ok('Léon Blum : relevé d’août présent, pas de retard', !types.includes('releve_en_retard:lb'))
const etatSansAout: AppState = { ...etat, saisies: etat.saisies.filter((s) => s.id !== 'rel') }
ok('collecte démarrée le 12 septembre : pas de relevé d’août attendu', !calculerSignaux(etatSansAout, new Date('2026-09-25T06:00:00.000Z')).some((s) => s.type === 'releve_en_retard'))
const signauxOct = calculerSignaux(etat, new Date('2026-10-12T06:00:00.000Z'))
ok('le 12 octobre : relevé de septembre en retard', signauxOct.some((s) => s.type === 'releve_en_retard' && s.magasinId === 'lb'))
ok('pas de signal plafond (base très en dessous)', !types.some((t) => t.startsWith('plafond')))

console.log('— Réseau —')
const sante = santeReseau(etat, new Date('2026-09-25T06:00:00.000Z'))
egal('magasins triés : les deux en alerte d’abord, le nouveau (info) en dernier', sante.magasins.map((m) => m.magasin.nom), ['Ornano', 'Léon Blum', 'Nouveau'])
const lb = sante.magasins.find((m) => m.magasin.nom === 'Léon Blum')!
egal('Léon Blum, semaine 39 (21→27) : 0 fait, 3 manqués, 1 à saisir (24), 2 à venir (25, 26)', lb.semaine, { attendus: 6, faits: 0, enAttente: 1, manques: 3, aVenir: 2 })
egal('Léon Blum : série 3 · dernier bordereau 19/09', [lb.serie?.manques, lb.dernierBordereau], [3, '2026-09-19'])
egal('totaux : 2 en collecte sur 3, 2 en alerte', [sante.totaux.enCollecte, sante.totaux.magasins, sante.totaux.enAlerte], [2, 3, 2])
const todo = aFaire(etat, new Date('2026-09-25T06:00:00.000Z')).find((x) => x.magasin.nom === 'Léon Blum')!
egal('à faire le 25/09 : passage prévu aujourd’hui, bordereau du 24 à saisir, 21-23 sans bordereau', [todo.aujourdHui.length, todo.aSaisir, todo.sansBordereau[0]?.dates], [1, ['2026-09-24'], ['2026-09-21', '2026-09-22', '2026-09-23']])

console.log('— Rappels du matin —')
const rappels = rappelsDuJour(etat, new Date('2026-09-25T03:10:00.000Z'))
egal('le 25 à 5 h : un rappel « bordereau d’hier » pour Léon Blum et Ornano, pas pour le nouveau', rappels.map((r) => [r.magasin.nom, r.rappels.map((x) => x.type)]), [['Léon Blum', ['bordereau']], ['Ornano', ['bordereau']]])
ok('clé stable du rappel', rappels[0].rappels[0].cle === 'bordereau:lb:2026-09-24:le panier du lien')
ok('texte : jeudi 24 septembre cité', rappels[0].rappels[0].texte.includes('jeudi 24 septembre'))
const etatRepondu: AppState = { ...etat, reponsesPassages: [{ id: 'x', magasinId: 'lb', collecteur: 'Le panier du lien', date: '2026-09-24', reponse: 'venu_sans_don', le: '2026-09-24T21:00:00.000Z' }] }
ok('le magasin a répondu pour hier : plus de rappel', !rappelsDuJour(etatRepondu, new Date('2026-09-25T03:10:00.000Z')).some((r) => r.magasin.nom === 'Léon Blum'))
ok('dimanche 27 (pas de passage le samedi 26 ? si : Léon Blum lundi-samedi) → rappel du samedi', rappelsDuJour(etat, new Date('2026-09-27T03:10:00.000Z')).some((r) => r.magasin.nom === 'Léon Blum'))
ok('lundi 28 : aucun passage prévu le dimanche 27 chez Léon Blum, pas de rappel', !rappelsDuJour(etat, new Date('2026-09-28T03:10:00.000Z')).some((r) => r.magasin.nom === 'Léon Blum'))
ok('message multi-rappels en puces', messageRappels([{ cle: 'a', type: 'bordereau', magasinId: 'lb', texte: 'A.' }, { cle: 'b', type: 'releve', magasinId: 'lb', texte: 'B.' }]).includes('• A.'))

console.log('— Boucle de résolution —')
const actifs = new Set(['passages_manques:lb:le panier du lien'])
const base = { id: 'd1', contenu: { signal_cle: 'passages_manques:lb:le panier du lien', association_concernee: 'Le panier du lien', propositions: [{ nom: 'Banque Alimentaire', email: 'ba@x.fr' }, { nom: 'Restos', email: 'r@x.fr' }] } }
const le25 = new Date('2026-09-25T03:10:00.000Z')
ok('sans relance envoyée : rien', signauxResolution(etat, [base], actifs, le25).length === 0)
const relance3j = { ...base, contenu: { ...base.contenu, relances: [{ le: '2026-09-22T10:00:00.000Z', a: 'asso@x.fr' }] } }
ok('relance il y a 3 jours : rien encore', signauxResolution(etat, [relance3j], actifs, le25).length === 0)
const relance8j = { ...base, contenu: { ...base.contenu, relances: [{ le: '2026-09-17T10:00:00.000Z', a: 'asso@x.fr' }] } }
const s1 = signauxResolution(etat, [relance8j], actifs, le25)
egal('relance il y a 8 jours : alerte, prochaine = remplaçante n° 1', [s1[0]?.type, s1[0]?.niveau, s1[0]?.detail.prochaine], ['relance_sans_reponse', 'alerte', 'Contacter la remplaçante n° 1 : Banque Alimentaire'])
ok('signal de passages résolu → plus de boucle', signauxResolution(etat, [relance8j], new Set(), le25).length === 0)
const repondu = { ...relance8j, contenu: { ...relance8j.contenu, reponse_association_le: '2026-09-20T10:00:00.000Z' } }
ok('association a répondu : rien', signauxResolution(etat, [repondu], actifs, le25).length === 0)
const contact8j = { ...relance8j, contenu: { ...relance8j.contenu, contacts: [{ le: '2026-09-16T10:00:00.000Z', nom: 'Banque Alimentaire', a: 'ba@x.fr' }] } }
const s2 = signauxResolution(etat, [contact8j], actifs, le25)
egal('remplaçante n° 1 sans réponse 9 jours : passer à la n° 2', [s2.length, s2[0]?.type, s2[0]?.detail.prochaine], [1, 'remplacement_sans_reponse', 'Contacter la remplaçante n° 2 : Restos'])
const retenue = { ...contact8j, contenu: { ...contact8j.contenu, retenue: { nom: 'Banque Alimentaire' } } }
ok('remplaçante retenue : boucle terminée', signauxResolution(etat, [retenue], actifs, le25).length === 0)

console.log('— Import CSV —')
egal('séparateur ; détecté, guillemets gérés', lireCSV('a;b\n"x;y";2\n').lignes, [['x;y', '2']])
egal('séparateur , détecté', lireCSV('a,b\n1,2\n').lignes, [['1', '2']])
const csv = interpreterCSV(MODELE_CSV)
egal('modèle : 2 lignes, colonnes reconnues', [csv.lignes.length, csv.colonnesInconnues.length, csv.colonnesReconnues.includes('magasin')], [2, 0, true])
const planCSV = preparerImport(csv.lignes, etat, new Date('2026-09-25T06:00:00.000Z'))
egal('modèle : 1 société nouvelle, 2 magasins à créer, 0 erreur', [planCSV.societes.length, planCSV.societes[0].nouvelle, planCSV.magasins.length, planCSV.erreurs.length], [1, true, 2, 0])
egal('CA et marge lus sur la première ligne de la société', [planCSV.societes[0].societe.caHT, planCSV.societes[0].societe.margePct, planCSV.societes[0].margeParDefaut], [12000000, 31, false])
egal('association et rythme mappés', [planCSV.magasins[0].magasin.collecteurs[0].nom, planCSV.magasins[0].magasin.collecteurs[0].frequence, planCSV.magasins[0].magasin.collecteurs[0].plage, planCSV.magasins[1].magasin.collecteurs[0].frequence], ['Banque Alimentaire de Paris', 'Quotidienne', 'Fin de journée (17 h – 20 h)', '2 à 3 fois par semaine'])
egal('fréquence libre → Autre', frequenceDepuisTexte('tous les 15 jours'), { frequence: 'Autre', frequenceAutre: 'tous les 15 jours' })
const csvExistant = interpreterCSV('societe;siren;magasin;association\nAEJB;852200534;Léon Blum;Le panier du lien\nAEJB;852200534;Bastille;\n;;Sans société;\nX;123;Mauvais siren;')
const planExistant = preparerImport(csvExistant.lignes, etat)
egal('société existante reconnue par SIREN, Léon Blum déjà présent, Bastille à créer, 2 erreurs', [planExistant.societes[0].nouvelle, planExistant.magasins[0].dejaPresent, planExistant.magasins[1].dejaPresent, planExistant.erreurs.length], [false, true, false, 2])

console.log(echecs === 0 ? '\nTout est conforme.' : `\n${echecs} écart(s).`)
process.exit(echecs === 0 ? 0 : 1)
