# Match test — fixture 1234567 (SYNTHÉTIQUE)

Payloads au **format exact API-Football v3** (structure documentée des endpoints
`/fixtures`, `/fixtures/events`, `/fixtures/lineups`, `/fixtures/statistics`)
mais au **contenu inventé** : PSG 3-1 OM fictif, conçu pour couvrir tous les cas
du scénariste (but avec passeur, penalty, but refusé VAR, cartons jaunes/rouge,
remplacements, temps additionnel).

⚠️ À remplacer par de vrais enregistrements dès que la clé API-Football existe
(convention CLAUDE.md : fixtures = payloads réels). En attendant, ce fichier
permet de développer normalisation + moteur sans clé.

Cas couverts par events.json :
- 12' but PSG (Ramos, passe Doué) — `Goal / Normal Goal`
- 23' carton jaune OM (Kondogbia)
- 38' but OM (Greenwood, passe Aubameyang)
- 45+1' carton jaune PSG (Vitinha)
- 58' remplacement OM (Rongier → Nadir)
- 61' but PSG (Barcola) **refusé** par
- 63' VAR `Goal cancelled` (hors-jeu)
- 66' double remplacement PSG
- 74' but PSG sur **penalty** (Ramos) — `Goal / Penalty`
- 82' carton rouge OM (Balerdi)
- 88' but PSG (Doué, passe Barcola)
