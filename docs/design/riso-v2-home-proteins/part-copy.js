// Shared language + copy for the Riso v2 screens. Copy is taken from the app's i18n files (en.js, fr.js).
const D = {
  en: {
    app: { account: 'Account', help: 'Help', logOut: 'Log out' },
    nav: { label: 'Main', home: 'Home', recipes: 'Recipes', planner: 'Planner', makeable: 'Makeable', grocery: 'Grocery', flyers: 'Flyers', inventory: 'Inventory' },
    lang: { label: 'Language', fr: 'FR', en: 'EN', langFr: 'Français', langEn: 'English' },
    auth: {
      eyebrow: 'MEAL PREP', title: 'The Matt Mo Cookbook', modeLabel: 'Log in or sign up', logIn: 'Log in', signUp: 'Sign up',
      name: 'Name', namePlaceholder: 'e.g. Matt', email: 'Email', password: 'Password', passwordHint: 'At least 8 characters.',
      createAccount: 'Create account', forgot: 'Forgot password?', sendReset: 'Send reset link', backToLogIn: '← Back to log in',
      forgotSent: "If that email has an account, we've sent a link to reset the password — check your inbox.",
      newPassword: 'New password', confirmPassword: 'Confirm new password', setPassword: 'Set new password', goToLogIn: 'Go to log in',
      mismatch: "Passwords don't match.", updated: 'Password updated — you can log in now.', working: '…',
    },
  },
  fr: {
    app: { account: 'Compte', help: 'Aide', logOut: 'Se déconnecter' },
    nav: { label: 'Principal', home: 'Accueil', recipes: 'Recettes', planner: 'Planificateur', makeable: 'Faisable', grocery: 'Épicerie', flyers: 'Circulaires', inventory: 'Inventaire' },
    lang: { label: 'Langue', fr: 'FR', en: 'EN', langFr: 'Français', langEn: 'English' },
    auth: {
      eyebrow: 'PLANIFICATION DES REPAS', title: 'Le livre de recettes de Matt Mo', modeLabel: "Se connecter ou s'inscrire", logIn: 'Se connecter', signUp: "S'inscrire",
      name: 'Nom', namePlaceholder: 'ex. Matt', email: 'Courriel', password: 'Mot de passe', passwordHint: 'Au moins 8 caractères.',
      createAccount: 'Créer un compte', forgot: 'Mot de passe oublié?', sendReset: 'Envoyer le lien', backToLogIn: '← Retour à la connexion',
      forgotSent: 'Si ce courriel a un compte, nous avons envoyé un lien pour réinitialiser le mot de passe — vérifiez votre boîte de réception.',
      newPassword: 'Nouveau mot de passe', confirmPassword: 'Confirmer le nouveau mot de passe', setPassword: 'Enregistrer le mot de passe', goToLogIn: 'Aller à la connexion',
      mismatch: 'Les mots de passe ne correspondent pas.', updated: 'Mot de passe mis à jour — vous pouvez maintenant vous connecter.', working: '…',
    },
  },
};
const KEY = 'mm-lang';
const subs = new Set();
let lang = 'en';
try { const s = localStorage.getItem(KEY); if (s === 'fr' || s === 'en') lang = s; } catch (e) {}
export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch (e) {}
  subs.forEach((f) => f());
}
export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function t(path, vars) {
  let v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), D[lang]);
  if (v == null) v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), D.en);
  if (typeof v !== 'string') return path;
  return vars ? v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')) : v;
}
export function addCopy(extra) {
  for (const l of Object.keys(extra)) for (const k of Object.keys(extra[l])) D[l][k] = Object.assign(D[l][k] || {}, extra[l][k]);
}

addCopy({
  en: { home: {
    gMorning: 'Good morning', gAfternoon: 'Good afternoon', gEvening: 'Good evening',
    tonight: 'Tonight · Supper', tonightMorning: 'This morning · Breakfast', tonightMidday: 'Today · Lunch', markedBlankMorning: 'Marked as no breakfast planned this morning.', markedBlankMidday: 'Marked as no lunch planned today.', nothingMorning: 'Nothing planned for this morning yet.', nothingMidday: 'Nothing planned for lunch yet.', notFromRecipe: 'Not from a recipe', nothingToPrep: 'Nothing to prep',
    eatingOutBlurb: 'Eating out, so there is no shopping list or cooking steps.', noteBlurb: 'Planned as a free-text meal, so there is no shopping list or cooking steps.',
    restPlanned: 'The rest of the week is planned.', stillOne: '{days} is still open.', stillMany: '{days} are still open.',
    pickRecipe: 'Pick a recipe instead', changeInPlanner: 'Change in planner', startCooking: 'Start cooking', swap: 'Swap', eatingOut: 'Eating out',
    markedBlank: 'Marked as no meal planned tonight.', nothingTonight: 'Nothing planned for tonight yet.', addRecipe: 'Add a recipe', nothingToBuy: 'nothing to buy!',
    haveAll: 'You have all {count} ingredients.', haveSome: 'You have {have} of {total} ingredients.',
    groceryList: 'Grocery list', leftOne: 'thing left to grab', leftMany: 'things left to grab', inCart: '{checked} of {total} in the cart', onSale: ' · {count} on sale', openList: 'Open list →',
    weekSupper: "This week's suppers", nextSupper: "Next week's suppers", weekMeals: "This week's meals", nextMeals: "Next week's meals",
    plannedOf: '{planned} of {total} planned', thisWeek: 'This week', nextWeek: 'Next week', suppersOnly: 'Suppers only', allMeals: 'All meals', plan: '+ plan', today: 'TODAY',
    useItUp: 'Use it up', inventoryLink: 'Inventory →', dayOne: '{count} day', dayMany: '{count} days', todayBang: 'today!', tomorrowBang: 'tomorrow!',
    usesTwoOne: '{count} recipe uses two or more of these.', usesTwoMany: '{count} recipes use two or more of these.', cookWithThese: 'Cook with these →',
    makeableNow: 'Makeable now', allLink: 'All →', readyNow: 'ready to cook now', nearlyOne: '{count} is one or two items away', nearlyMany: '{count} are one or two items away',
    proteins: 'Proteins on sale', flyersLink: 'Flyers →', bestDeal: 'Best deal', seeDeal: 'See the deal', more: ' · +{count} more',
    stockUp: 'Stock up', buy: 'Buy', cantTell: "Can't tell yet", offReg: '{n}% off the regular price', underQc: "{n}% under Quebec's average",
    days: ['MON','TUE','WED','THU','FRI','SAT','SUN'], meals: ['B','L','S'], ea: 'ea'
  } },
  fr: { home: {
    gMorning: 'Bonjour', gAfternoon: 'Bon après-midi', gEvening: 'Bonsoir',
    tonight: 'Ce soir · Souper', tonightMorning: 'Ce matin · Déjeuner', tonightMidday: 'Ce midi · Dîner', markedBlankMorning: 'Marqué comme sans déjeuner prévu ce matin.', markedBlankMidday: 'Marqué comme sans dîner prévu ce midi.', nothingMorning: 'Rien de prévu pour ce matin.', nothingMidday: 'Rien de prévu pour le dîner.', notFromRecipe: 'Pas une recette', nothingToPrep: 'Rien à préparer',
    eatingOutBlurb: "Souper au restaurant : pas de liste d'épicerie ni d'étapes de cuisson.", noteBlurb: "Prévu comme repas écrit à la main : pas de liste d'épicerie ni d'étapes de cuisson.",
    restPlanned: 'Le reste de la semaine est planifié.', stillOne: '{days} est encore libre.', stillMany: '{days} sont encore libres.',
    pickRecipe: 'Choisir une recette', changeInPlanner: 'Modifier dans le planificateur', startCooking: 'Commencer à cuisiner', swap: 'Changer', eatingOut: 'Au restaurant',
    markedBlank: 'Marqué comme sans repas prévu ce soir.', nothingTonight: 'Rien de prévu pour ce soir.', addRecipe: 'Ajouter une recette', nothingToBuy: 'rien à acheter!',
    haveAll: 'Vous avez les {count} ingrédients.', haveSome: 'Vous avez {have} ingrédients sur {total}.',
    groceryList: "Liste d'épicerie", leftOne: 'article à prendre', leftMany: 'articles à prendre', inCart: '{checked} sur {total} dans le panier', onSale: ' · {count} en rabais', openList: 'Ouvrir la liste →',
    weekSupper: 'Les soupers de la semaine', nextSupper: 'Les soupers de la semaine prochaine', weekMeals: 'Les repas de la semaine', nextMeals: 'Les repas de la semaine prochaine',
    plannedOf: '{planned} sur {total} planifiés', thisWeek: 'Cette semaine', nextWeek: 'Semaine prochaine', suppersOnly: 'Soupers seulement', allMeals: 'Tous les repas', plan: '+ planifier', today: "AUJOURD'HUI",
    useItUp: 'À utiliser', inventoryLink: 'Inventaire →', dayOne: '{count} jour', dayMany: '{count} jours', todayBang: "aujourd'hui!", tomorrowBang: 'demain!',
    usesTwoOne: '{count} recette en utilise deux ou plus.', usesTwoMany: '{count} recettes en utilisent deux ou plus.', cookWithThese: 'Cuisiner avec ceux-ci →',
    makeableNow: 'Faisable maintenant', allLink: 'Tout →', readyNow: 'prêtes à cuisiner', nearlyOne: '{count} à un ou deux articles près', nearlyMany: '{count} à un ou deux articles près',
    proteins: 'Protéines en rabais', flyersLink: 'Circulaires →', bestDeal: 'Meilleure aubaine', seeDeal: "Voir l'aubaine", more: ' · +{count} autres',
    stockUp: 'Faire des réserves', buy: 'Acheter', cantTell: 'Difficile à dire', offReg: '{n} % de rabais sur le prix courant', underQc: "{n} % sous la moyenne du Québec",
    days: ['LUN','MAR','MER','JEU','VEN','SAM','DIM'], meals: ['DÉ','DÎ','S'], ea: 'ch.'
  } }
});

addCopy({
  en: { recipes: {
    eyebrow: '{count} RECIPES · {makeable} MAKEABLE NOW · {expiring} USE EXPIRING ITEMS', titleStart: 'Your', titleAccent: 'recipes.', newRecipe: '+ New recipe',
    search: 'SEARCH', import: 'IMPORT', importRecipe: 'Import recipe', placeholder: 'Search by name, tag or ingredient', placeholderPhone: 'Search by name, tag or ingredient, or paste a recipe link to import it',
    pasteChip: 'PASTE A LINK TO IMPORT', linkFound: 'Link found. Importing fills in the title, photos, ingredients and steps. It lands in Imported.', howItWorks: 'How it works', gotIt: 'Got it',
    hintDesk: "Type to search your recipes, or paste a link from any recipe site to import it. Cookbook is the recipes you cook again and again; Imported is everything you saved from a link. Use the chips for a meal type, or for Makeable now, Uses expiring and Meals, and the menus for protein, time and sort. The yellow chip is total prep and cook time; the pink and green chips flag expiring ingredients and sales. The bar shows how many ingredients are already in your Inventory. Cards with a shadow need nothing from the store.",
    hintPhone: "Type to search your recipes, or paste a link from any recipe site to import it. The yellow chip is total prep and cook time; the pink chip flags expiring ingredients. The bar shows how many ingredients are already in your Inventory. Cards with a shadow need nothing from the store. Cookbook is the recipes you cook again and again, grouped by meal type; Imported is everything you saved from a link. Tap a section's title to fold it.",
    hintP1: 'Search your recipes, or paste a link from any recipe site to import it.', hintP2: 'Yellow chip: total prep and cook time. Pink chip: uses expiring ingredients.', hintP3: 'The bar shows how many ingredients are in your Inventory. A card with a shadow needs nothing from the store.', hintP4: 'Cookbook: recipes you cook again and again. Imported: everything you saved from a link.', meal: 'MEAL',
    cookbook: 'Cookbook', imported: 'Imported', protein: 'PROTEIN', time: 'TIME', sort: 'SORT', anyProtein: 'Any protein',
    timeAny: 'Any time', timeQuick: 'Under 30 min', timeHour: 'Under 1 hour', timeLong: 'Over 1 hour',
    sRecent: 'Recently added', sFewest: 'Fewest missing', sQuickest: 'Quickest',
    all: 'All', makeable: 'Makeable now', expiring: 'Uses expiring', meals: 'Meals',
    breakfast: 'Breakfast', lunch: 'Lunch', supper: 'Supper', snack: 'Snack / Any', pantry: 'Pantry / Prep',
    countOne: '1 RECIPE', countMany: '{count} RECIPES', matchOne: '1 RECIPE MATCHES', matchMany: '{count} RECIPES MATCH', clear: 'Clear filters',
    addTime: 'add time', usesExpiring: 'uses expiring', similar: 'Similar', plan: '+ Plan', toPlanner: 'Search in the planner', simCaps: 'SIMILAR TO', shares: 'shares {n}', clearSim: 'Clear', onSale: 'on sale', allOnHand: 'all {count} on hand · nothing to buy!', someOnHand: '{have} of {total} on hand · {buy} to buy',
    emptyFilters: 'No recipes match these filters.', emptyNoMatch: 'No recipes match. Paste a link above to import one.',
    chicken: 'Chicken', beef: 'Beef', pork: 'Pork', fish: 'Fish', seafood: 'Seafood', turkey: 'Turkey', lamb: 'Lamb', tofu: 'Tofu'
  } },
  fr: { recipes: {
    eyebrow: '{count} RECETTES · {makeable} FAISABLES MAINTENANT · {expiring} UTILISENT CE QUI EXPIRE', titleStart: 'Vos', titleAccent: 'recettes.', newRecipe: '+ Nouvelle recette',
    search: 'RECHERCHE', import: 'IMPORTER', importRecipe: 'Importer la recette', placeholder: 'Cherchez par nom, étiquette ou ingrédient', placeholderPhone: "Cherchez par nom, étiquette ou ingrédient, ou collez le lien d'une recette pour l'importer",
    pasteChip: 'COLLEZ UN LIEN POUR IMPORTER', linkFound: "Lien trouvé. L'importation remplit le titre, les photos, les ingrédients et les étapes. La recette arrive dans Importées.", howItWorks: 'Comment ça marche', gotIt: "J'ai compris",
    hintDesk: "Tapez pour chercher vos recettes, ou collez le lien d'une recette de n'importe quel site pour l'importer. « Livre de recettes » regroupe les recettes que vous refaites souvent; « Importées », tout ce que vous avez enregistré à partir d'un lien. Utilisez les pastilles pour un type de repas, ou pour Faisables maintenant, Utilise ce qui expire et Repas, et les menus pour la protéine, le temps et le tri. La pastille jaune donne le temps total de préparation et de cuisson. La barre montre combien d'ingrédients sont déjà dans votre inventaire. Les cartes avec une ombre ne demandent rien à l'épicerie.",
    hintPhone: "Tapez pour chercher vos recettes, ou collez le lien d'une recette de n'importe quel site pour l'importer. La pastille jaune donne le temps total de préparation et de cuisson; la rose signale des ingrédients qui expirent. La barre montre combien d'ingrédients sont déjà dans votre inventaire. Les cartes avec une ombre ne demandent rien à l'épicerie. « Livre de recettes » regroupe les recettes que vous refaites souvent, par type de repas; « Importées », tout ce que vous avez enregistré à partir d'un lien. Touchez le titre d'une section pour la replier.",
    hintP1: "Cherchez dans vos recettes, ou collez le lien d'une recette de n'importe quel site pour l'importer.", hintP2: 'Pastille jaune : temps total de préparation et de cuisson. Pastille rose : utilise des ingrédients qui expirent.', hintP3: "La barre montre combien d'ingrédients sont dans votre inventaire. Une carte avec une ombre ne demande rien à l'épicerie.", hintP4: "Livre de recettes : les recettes que vous refaites souvent. Importées : tout ce que vous avez enregistré à partir d'un lien.", meal: 'REPAS',
    cookbook: 'Livre de recettes', imported: 'Importées', protein: 'PROTÉINE', time: 'TEMPS', sort: 'TRI', anyProtein: 'Toutes les protéines',
    timeAny: "N'importe quand", timeQuick: 'Moins de 30 min', timeHour: "Moins d'1 heure", timeLong: "Plus d'1 heure",
    sRecent: 'Ajout récent', sFewest: 'Moins de manquants', sQuickest: 'Plus rapides',
    all: 'Toutes', makeable: 'Faisables maintenant', expiring: 'Utilise ce qui expire', meals: 'Repas',
    breakfast: 'Déjeuner', lunch: 'Dîner', supper: 'Souper', snack: 'Collation', pantry: 'Garde-manger',
    countOne: '1 RECETTE', countMany: '{count} RECETTES', matchOne: '1 RECETTE CORRESPOND', matchMany: '{count} RECETTES CORRESPONDENT', clear: 'Effacer les filtres',
    addTime: 'ajouter le temps', usesExpiring: 'utilise ce qui expire', similar: 'Similaires', plan: '+ Planifier', toPlanner: 'Chercher dans le planificateur', simCaps: 'RECETTES SIMILAIRES À', shares: 'partage {n}', clearSim: 'Effacer', onSale: 'en rabais', allOnHand: 'les {count} sous la main · rien à acheter!', someOnHand: '{have} sur {total} sous la main · {buy} à acheter',
    emptyFilters: 'Aucune recette ne correspond à ces filtres.', emptyNoMatch: 'Aucune recette ne correspond. Collez un lien ci-dessus pour en importer une.',
    chicken: 'Poulet', beef: 'Bœuf', pork: 'Porc', fish: 'Poisson', seafood: 'Fruits de mer', turkey: 'Dinde', lamb: 'Agneau', tofu: 'Tofu'
  } }
});

addCopy({
  en: { planner: {
    title: 'The week', titleAccent: 'ahead.', thisWeekBadge: 'this week', thisWeek: 'This week', copyLast: "Copy last week's plan", prevWeek: 'Previous week', nextWeek: 'Next week',
    fillOne: 'Fill {count} empty slot', fillMany: 'Fill {count} empty slots', allFilled: 'All slots filled ✓', howItWorks: 'How it works', gotIt: 'Got it',
    hint: "Drag a recipe from the panel onto a slot, or drag a day's meals to another day to move them. Click an empty slot to write on it (like \"Hockey pool\"); click a blank card again to clear it. The grocery list builds itself from what's planned. The round button on a card marks it as leftovers, then as \"I already have everything\" (blue outline); either way, nothing from that meal goes on the grocery list.",
    h1: 'Drag a recipe from the panel onto a slot, or press + to drop it in the next empty slot.', h2: "Drag a day's meals to another day to move them.", h3: 'Click an empty slot to write on it (like "Hockey pool"). Click a blank card again to clear it.', h4: 'The round button on a card marks it as leftovers, then as "I already have everything" (blue outline). Neither goes on the grocery list.', h5: "The grocery list builds itself from what's planned.", m1: 'Tap a day to add a recipe, write a note, or leave the slot empty.', m2: 'Tap a planned card to open it, mark it as leftovers or already have, or remove it.', m3: 'The week pill opens a calendar; the yellow tag scrolls to the other days.', m4: "The grocery list builds itself from what's planned. Leftovers and already-have cards stay off it.", addToCaps: 'ADD TO', modeRecipe: 'Recipe', modeNote: 'Note', modeBlank: 'Empty card', noteTypePh: 'Write anything, e.g. Eating out', saveNote: 'Save note', q1: 'Eating out', q2: 'Leftovers', q3: 'Takeout', q4: 'Skipping', blankTitle: 'No meal planned', blankText: 'Marks this slot as planned with nothing on it (eating out, skipping). It stays as a blank card until you clear it.', blankBtn: 'Mark as no meal planned',
    breakfast: 'Breakfast', lunch: 'Lunch', supper: 'Supper', leftover: 'leftover', pastFridge: '⚠ past fridge life',
    legendHave: 'You already have everything', legendLeftover: 'From an earlier meal', legendWrite: 'Click an empty slot to write on it', toWeekend: 'scroll for the weekend →', backToWeekdays: '← back to the weekdays',
    stateHave: 'Already have everything (off the grocery list) - click to clear', stateLeft: 'Leftovers - click to mark as already have it', stateNone: 'Click to mark as leftovers',
    addCell: '+ add', makeList: 'Make the grocery list · {count}', today: 'TODAY', goThisWeek: 'Go to this week', legendPlanned: 'MEALS PLANNED', legendToday: 'TODAY',
    sheetOpen: 'Open the recipe', sheetRemove: 'Remove from the plan', sheetNote: '✎ Add a note instead', sheetMarkLeft: 'Mark as leftovers', sheetMarkHave: 'Mark as already have it', sheetClear: 'Clear the mark',
    stPlanned: 'Planned', stLeft: 'Leftovers', stHave: 'Already have it',
    addRecipes: 'Add recipes', addTo: 'Add to {slot}', hintNone: 'Drag a recipe onto the board, or tap + to drop it in the next empty slot.', hintTarget: 'Tap + on a recipe to put it in {slot}, or drag it anywhere.', hintSheet: 'Tap + on a recipe, or type a note below.',
    notePh: '…or type a note, e.g. Eating out ↵', tabSuggested: 'Suggested', tabAround: 'Plan around', tabAll: 'All', expiring: 'EXPIRING', inKitchen: 'IN YOUR KITCHEN', yourPicks: 'YOUR PICKS',
    gUse: "USES WHAT'S EXPIRING", gEasy: 'MOSTLY ON HAND', pickAbove: 'PICK INGREDIENTS ABOVE', matches: 'MATCHES · {count}', allRecipes: 'ALL RECIPES · {count}', search: 'Search your recipes',
    nothingToBuy: 'nothing to buy!', haveMeta: '{buy} to buy · {have} of {total} on hand',
    days: ['MON','TUE','WED','THU','FRI','SAT','SUN'], dowLetters: ['M','T','W','T','F','S','S'], months: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
    monthsLong: ['january','february','march','april','may','june','july','august','september','october','november','december']
  } },
  fr: { planner: {
    title: 'La semaine', titleAccent: 'à venir.', thisWeekBadge: 'cette semaine', thisWeek: 'Cette semaine', copyLast: 'Copier le plan de la semaine dernière', prevWeek: 'Semaine précédente', nextWeek: 'Semaine suivante',
    fillOne: 'Remplir {count} case vide', fillMany: 'Remplir {count} cases vides', allFilled: 'Toutes les cases sont remplies ✓', howItWorks: 'Comment ça marche', gotIt: "J'ai compris",
    hint: "Glissez une recette du panneau vers une case, ou glissez les repas d'un jour à l'autre pour les déplacer. Cliquez sur une case vide pour y écrire (comme « Pool de hockey »); cliquez de nouveau sur une carte vide pour l'effacer. La liste d'épicerie se fait toute seule à partir de ce qui est planifié. Le bouton rond sur une carte la marque comme des restes, puis comme « j'ai déjà tout » (contour bleu); dans les deux cas, rien de ce repas ne va sur la liste d'épicerie.",
    h1: 'Glissez une recette du panneau vers une case, ou touchez + pour la mettre dans la prochaine case vide.', h2: "Glissez les repas d'un jour à l'autre pour les déplacer.", h3: 'Cliquez sur une case vide pour y écrire (comme « Pool de hockey »). Cliquez de nouveau sur une carte vide pour l\'effacer.', h4: 'Le bouton rond sur une carte la marque comme des restes, puis comme « j\'ai déjà tout » (contour bleu). Ni l\'un ni l\'autre ne va sur la liste d\'épicerie.', h5: "La liste d'épicerie se fait toute seule à partir de ce qui est planifié.", m1: 'Touchez une case pour ajouter une recette, écrire une note ou la laisser vide.', m2: 'Touchez une carte pour l\'ouvrir, la marquer comme restes ou déjà en main, ou la retirer.', m3: 'La pastille de la semaine ouvre un calendrier; l\'étiquette jaune fait défiler vers les autres jours.', m4: "La liste d'épicerie se fait toute seule à partir de ce qui est planifié. Les restes et les cartes déjà en main n'y vont pas.", addToCaps: 'AJOUTER À', modeRecipe: 'Recette', modeNote: 'Note', modeBlank: 'Carte vide', noteTypePh: 'Écrivez ce que vous voulez, ex. Resto', saveNote: 'Enregistrer la note', q1: 'Au resto', q2: 'Restes', q3: 'Commande', q4: 'Pas de repas', blankTitle: 'Aucun repas prévu', blankText: 'Marque cette case comme prévue sans repas (resto, repas sauté). Elle reste une carte vide jusqu\'à ce que vous l\'effaciez.', blankBtn: 'Marquer comme aucun repas prévu',
    breakfast: 'Déjeuner', lunch: 'Dîner', supper: 'Souper', leftover: 'restes', pastFridge: '⚠ conservation dépassée',
    legendHave: 'Vous avez déjà tout', legendLeftover: "D'un repas précédent", legendWrite: 'Cliquez sur une case vide pour y écrire', toWeekend: 'défiler vers la fin de semaine →', backToWeekdays: '← retour à la semaine',
    stateHave: "J'ai déjà tout (hors de la liste d'épicerie) - cliquez pour retirer", stateLeft: 'Restes - cliquez pour marquer comme déjà en main', stateNone: 'Cliquez pour marquer comme restes',
    addCell: '+ ajouter', makeList: "Créer la liste d'épicerie · {count}", today: "AUJ.", goThisWeek: 'Aller à cette semaine', legendPlanned: 'REPAS PRÉVUS', legendToday: "AUJOURD'HUI",
    sheetOpen: 'Ouvrir la recette', sheetRemove: 'Retirer du plan', sheetNote: '✎ Ajouter une note à la place', sheetMarkLeft: 'Marquer comme restes', sheetMarkHave: 'Marquer comme déjà en main', sheetClear: 'Retirer la marque',
    stPlanned: 'Prévu', stLeft: 'Restes', stHave: 'Déjà en main',
    addRecipes: 'Ajouter des recettes', addTo: 'Ajouter à {slot}', hintNone: 'Glissez une recette sur le tableau, ou touchez + pour la mettre dans la prochaine case vide.', hintTarget: "Touchez + sur une recette pour la mettre dans {slot}, ou glissez-la n'importe où.", hintSheet: 'Touchez + sur une recette, ou écrivez une note ci-dessous.',
    notePh: '…ou écrivez une note, ex. Resto ↵', tabSuggested: 'Suggestions', tabAround: 'Par ingrédient', tabAll: 'Toutes', expiring: 'À UTILISER BIENTÔT', inKitchen: 'DANS VOTRE CUISINE', yourPicks: 'VOS CHOIX',
    gUse: 'UTILISE CE QUI EXPIRE', gEasy: 'PRESQUE TOUT EN MAIN', pickAbove: 'CHOISISSEZ DES INGRÉDIENTS CI-DESSUS', matches: 'RÉSULTATS · {count}', allRecipes: 'TOUTES LES RECETTES · {count}', search: 'Chercher dans vos recettes',
    nothingToBuy: 'rien à acheter!', haveMeta: '{buy} à acheter · {have} sur {total} sous la main',
    days: ['LUN','MAR','MER','JEU','VEN','SAM','DIM'], dowLetters: ['L','M','M','J','V','S','D'], months: ['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'],
    monthsLong: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  } }
});
