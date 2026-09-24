import { useState } from 'react'

/**
 * Zone de réponse d'un fil de discussion : un vrai bloc de saisie multiligne,
 * pas un champ d'une ligne. Utilisée côté client (Aide) et côté Mana (Admin).
 * Entrée = retour à la ligne, Ctrl/⌘ + Entrée = envoyer.
 */
export function Composer({
  placeholder,
  onEnvoyer,
}: {
  placeholder: string
  onEnvoyer: (texte: string) => void | Promise<void>
}) {
  const [texte, setTexte] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const pret = texte.trim().length > 0 && !envoiEnCours

  async function envoyer() {
    if (!pret) return
    setEnvoiEnCours(true)
    try {
      await onEnvoyer(texte.trim())
      setTexte('')
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <div className="composer">
      <textarea
        rows={3}
        placeholder={placeholder}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void envoyer()
          }
        }}
      />
      <div className="composer-actions">
        <span className="muted">Ctrl + Entrée pour envoyer</span>
        <button className="btn btn-primary btn-sm" onClick={envoyer} disabled={!pret} style={{ opacity: pret ? 1 : 0.5 }}>
          Envoyer
        </button>
      </div>
    </div>
  )
}
