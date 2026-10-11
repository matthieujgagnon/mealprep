// The server's own words (error messages, emails) in French and English.
// The app sends "X-Lang: fr|en" with every request; emails use the
// account's saved language.
export const LANGS = ["fr", "en"];

const MESSAGES = {
  en: {
    generic: "Something went wrong - please try again.",
    notLoggedIn: "Not logged in",
    sessionExpired: "Session expired - please log in again",
    notAuthorized: "Not authorized.",
    adminOnly: "Only an admin can do this.",
    cronSecretMissing: "CRON_SECRET is not set on the server.",
    emailPasswordRequired: "Email and password are required.",
    passwordTooShort: "The password must be at least 8 characters.",
    emailTaken: "An account with that email already exists.",
    inviteRequired: "Signing up needs an invite code. Ask the person who invited you for one.",
    inviteUnknown: "That invite code doesn't exist. Check it and try again.",
    inviteUsed: "That invite code has already been used. Ask for a new one.",
    inviteExpired: "That invite code has expired. Ask for a new one.",
    inviteOff: "That invite code has been switched off. Ask for a new one.",
    inviteNoteTooLong: "The note can be at most 80 characters.",
    inviteBadUses: "A code can be used 1 to 100 times.",
    inviteBadExpiry: "A code can last 1 to 365 days, or never expire.",
    aiLimitBad: "The daily limit must be a whole number from 0 to 1000.",
    wrongLogin: "Incorrect email or password.",
    emailRequired: "Email is required.",
    resetSent: "If that email has an account, we've sent a link to reset the password.",
    tokenPasswordRequired: "The reset link and a new password are required.",
    resetInvalid: "This reset link is invalid or has expired. Request a new one.",
    passwordUpdated: "Password updated - you can now log in.",
    badLocale: "The language must be fr or en.",
    badWeekendDays: "The weekend must be a list of days from 0 (Monday) to 6 (Sunday), and its switches must be true or false.",
    required: "Missing: {fields}.",
    mustBeArray: "{field} must be a list.",
    mustBeOneOf: "{field} must be one of: {options}.",
    notFound: {
      recipe: "Recipe not found.",
      deal: "Deal not found.",
      section: "Section not found.",
      item: "Item not found.",
      items: "No matching items.",
      photo: "Photo not found.",
      plannerEntry: "Planner entry not found.",
      flyerImage: "No stored flyer image for this source.",
      invite: "Invite code not found.",
    },
    sectionExists: "A section named \"{name}\" already exists.",
    storeExists: "A store named \"{name}\" already exists.",
    categoryExists: "A category named \"{name}\" already exists.",
    nameEmpty: "The name can't be empty.",
    locationInvalid: "That shelf doesn't exist. Pick a built-in one or one of your own sections.",
    imageUrlInvalid: "The photo must be an uploaded photo or a web link.",
    consumeAction: "The action must be 'consumed' or 'wasted'.",
    takeOutAmounts: "Each item to take out needs its id and an amount above 0, or \"all\".",
    onlyNoteEditable: "Only a blank or written card can be edited this way.",
    fileRequired: "Choose a file.",
    fileType: "The file must be a PDF, JPG, PNG or WebP.",
    photoType: "Only JPEG, PNG, WebP or GIF photos can be added.",
    photoEmpty: "The photo was empty.",
    receiptUnreadable: "Couldn't read any items from this receipt.",
    receiptFailed: "Failed to process the receipt.",
    flyerUnreadable: "Couldn't find any deals in this file.",
    flyerFailed: "Failed to process the flyer.",
    geminiKey: "The server is missing a valid GEMINI_API_KEY. Ask the app owner to configure it.",
    geminiRate: "Rate limited by the Gemini API - try again shortly.",
    geminiError: "Gemini API error: {detail}",
    aiLimit: "You've reached today's limit of {limit} file readings (flyers and receipts). Try again tomorrow.",
    aiPaused: "Reading flyers and receipts is paused for now. Try again later.",
    postalCode: "That doesn't look like a Canadian postal code (e.g. H2T 2S3).",
    flippUnreachable: "Couldn't reach Flipp: {detail}",
    flipp: {
      timeout: "Flipp took too long to answer",
      unreachable: "couldn't connect to Flipp",
      status: "Flipp answered {status} for {path}",
      unreadable: "Flipp's answer wasn't readable - it may have changed",
    },
    scrape: {
      timeout: "This site took too long to respond (over 15 s). Try again, or add it by hand.",
      unreachable: "Couldn't reach this link ({detail}).",
      status: "The site answered with an error (status {status}).",
      noData: "Couldn't find a recipe on this page. Try adding it by hand.",
      invalidUrl: "That doesn't look like a valid link.",
      httpOnly: "Only http and https links can be imported.",
      blocked: "This link can't be imported.",
      unresolved: "Couldn't find this link's address.",
    },
    email: {
      resetSubject: "Reset your password",
      resetBody1: "Someone (hopefully you) asked to reset the password for this account.",
      resetLink: "Click here to set a new password",
      resetBody2: "This link works once and expires in an hour.",
      resetBody3: "If you didn't ask for this, you can safely ignore this email — your password won't change.",
      missingKey: "The server is missing a valid RESEND_API_KEY. Ask the app owner to configure it.",
    },
  },
  fr: {
    generic: "Une erreur s'est produite — veuillez réessayer.",
    notLoggedIn: "Vous n'êtes pas connecté.",
    sessionExpired: "Session expirée — veuillez vous reconnecter.",
    notAuthorized: "Non autorisé.",
    adminOnly: "Seul un admin peut faire ça.",
    cronSecretMissing: "CRON_SECRET n'est pas défini sur le serveur.",
    emailPasswordRequired: "Le courriel et le mot de passe sont requis.",
    passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères.",
    emailTaken: "Un compte existe déjà avec ce courriel.",
    inviteRequired: "Pour créer un compte, il faut un code d'invitation. Demandez-en un à la personne qui vous a envoyé l'invitation.",
    inviteUnknown: "Ce code d'invitation n'existe pas. Vérifiez-le et réessayez.",
    inviteUsed: "Ce code d'invitation a déjà été utilisé. Demandez-en un nouveau.",
    inviteExpired: "Ce code d'invitation a expiré. Demandez-en un nouveau.",
    inviteOff: "Ce code d'invitation a été désactivé. Demandez-en un nouveau.",
    inviteNoteTooLong: "La note peut contenir 80 caractères au maximum.",
    inviteBadUses: "Un code peut servir de 1 à 100 fois.",
    inviteBadExpiry: "Un code peut durer de 1 à 365 jours, ou ne jamais expirer.",
    aiLimitBad: "La limite quotidienne doit être un nombre entier de 0 à 1000.",
    wrongLogin: "Courriel ou mot de passe incorrect.",
    emailRequired: "Le courriel est requis.",
    resetSent: "Si ce courriel a un compte, nous avons envoyé un lien pour réinitialiser le mot de passe.",
    tokenPasswordRequired: "Le lien de réinitialisation et un nouveau mot de passe sont requis.",
    resetInvalid: "Ce lien de réinitialisation est invalide ou expiré. Demandez-en un nouveau.",
    passwordUpdated: "Mot de passe mis à jour — vous pouvez maintenant vous connecter.",
    badLocale: "La langue doit être fr ou en.",
    badWeekendDays: "La fin de semaine doit être une liste de jours de 0 (lundi) à 6 (dimanche), et ses interrupteurs doivent être vrai ou faux.",
    required: "Champs manquants : {fields}.",
    mustBeArray: "{field} doit être une liste.",
    mustBeOneOf: "{field} doit être l'un de : {options}.",
    notFound: {
      recipe: "Recette introuvable.",
      deal: "Aubaine introuvable.",
      section: "Section introuvable.",
      item: "Article introuvable.",
      items: "Aucun article correspondant.",
      photo: "Photo introuvable.",
      plannerEntry: "Repas introuvable dans le planificateur.",
      flyerImage: "Aucune image de circulaire enregistrée pour cette source.",
      invite: "Code d'invitation introuvable.",
    },
    sectionExists: "Une section nommée « {name} » existe déjà.",
    storeExists: "Un magasin nommé « {name} » existe déjà.",
    categoryExists: "Une catégorie nommée « {name} » existe déjà.",
    nameEmpty: "Le nom ne peut pas être vide.",
    locationInvalid: "Cette tablette n'existe pas. Choisissez une tablette de base ou une de vos sections.",
    imageUrlInvalid: "La photo doit être une photo téléversée ou un lien Web.",
    consumeAction: "L'action doit être « consumed » ou « wasted ».",
    takeOutAmounts: "Chaque article à retirer doit avoir son identifiant et une quantité plus grande que 0, ou « all ».",
    onlyNoteEditable: "Seule une carte vide ou écrite peut être modifiée ainsi.",
    fileRequired: "Choisissez un fichier.",
    fileType: "Le fichier doit être un PDF, JPG, PNG ou WebP.",
    photoType: "Seules les photos JPEG, PNG, WebP ou GIF peuvent être ajoutées.",
    photoEmpty: "La photo était vide.",
    receiptUnreadable: "Impossible de lire des articles sur ce reçu.",
    receiptFailed: "Le traitement du reçu a échoué.",
    flyerUnreadable: "Aucune aubaine trouvée dans ce fichier.",
    flyerFailed: "Le traitement de la circulaire a échoué.",
    geminiKey: "Il manque une clé GEMINI_API_KEY valide sur le serveur. Demandez au propriétaire de l'application de la configurer.",
    geminiRate: "Trop de requêtes à l'API Gemini — réessayez sous peu.",
    geminiError: "Erreur de l'API Gemini : {detail}",
    aiLimit: "Vous avez atteint la limite quotidienne de {limit} lectures de fichiers (circulaires et reçus). Réessayez demain.",
    aiPaused: "La lecture des circulaires et des reçus est suspendue pour le moment. Réessayez plus tard.",
    postalCode: "Ce n'est pas un code postal canadien (ex. H2T 2S3).",
    flippUnreachable: "Impossible de joindre Flipp : {detail}",
    flipp: {
      timeout: "Flipp a mis trop de temps à répondre",
      unreachable: "impossible de se connecter à Flipp",
      status: "Flipp a répondu {status} pour {path}",
      unreadable: "La réponse de Flipp était illisible - elle a peut-être changé",
    },
    scrape: {
      timeout: "Ce site a mis trop de temps à répondre (plus de 15 s). Réessayez, ou ajoutez la recette à la main.",
      unreachable: "Impossible de joindre ce lien ({detail}).",
      status: "Le site a répondu par une erreur (code {status}).",
      noData: "Aucune recette trouvée sur cette page. Essayez de l'ajouter à la main.",
      invalidUrl: "Ce lien ne semble pas valide.",
      httpOnly: "Seuls les liens http et https peuvent être importés.",
      blocked: "Ce lien ne peut pas être importé.",
      unresolved: "Impossible de trouver l'adresse de ce lien.",
    },
    email: {
      resetSubject: "Réinitialisez votre mot de passe",
      resetBody1: "Quelqu'un (vous, espérons-le) a demandé à réinitialiser le mot de passe de ce compte.",
      resetLink: "Cliquez ici pour choisir un nouveau mot de passe",
      resetBody2: "Ce lien ne fonctionne qu'une fois et expire dans une heure.",
      resetBody3: "Si vous n'avez rien demandé, vous pouvez ignorer ce courriel — votre mot de passe ne changera pas.",
      missingKey: "Il manque une clé RESEND_API_KEY valide sur le serveur. Demandez au propriétaire de l'application de la configurer.",
    },
  },
};

export function normalizeLang(value) {
  const base = String(value || "").slice(0, 2).toLowerCase();
  return LANGS.includes(base) ? base : null;
}

// The reader's language for this request: what the app says it shows,
// else the browser's first choice, else French.
export function langOf(req) {
  const fromHeader = normalizeLang(req?.get?.("x-lang") ?? req?.headers?.["x-lang"]);
  if (fromHeader) return fromHeader;
  const accept = req?.get?.("accept-language") ?? req?.headers?.["accept-language"];
  for (const part of String(accept || "").split(",")) {
    const lang = normalizeLang(part.trim());
    if (lang) return lang;
  }
  return "fr";
}

function lookup(lang, key) {
  let node = MESSAGES[lang];
  for (const part of key.split(".")) node = node?.[part];
  return typeof node === "string" ? node : null;
}

// msg("fr", "sectionExists", { name }) or msg(req, ...)
export function msg(langOrReq, key, vars) {
  const lang = typeof langOrReq === "string" ? normalizeLang(langOrReq) || "fr" : langOf(langOrReq);
  const text = lookup(lang, key) ?? lookup("en", key) ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] == null ? m : String(vars[name])));
}

// res.status(400).json(fail(req, "required", { fields: "week" }))
export function fail(req, key, vars, extra) {
  return { error: msg(req, key, vars), code: key, ...extra };
}

export const __messages = MESSAGES;
