/**
 * Utasítás nélküli válasz: a felhasználó négy mintalevele, magyarul és
 * angolul, betű szerint. A modell csak azt dönti el, milyen nyelven és
 * hangnemben írtak, és kit szólítsunk meg — a szöveget nem írja át.
 * Az elköszönést és az aláírást a `withSignature` teszi a végére.
 */
export type TemplateLanguage = "hu" | "en";
export type TemplateVersion = 1 | 2 | 3 | 4;

const LETTERS: Record<TemplateLanguage, Record<TemplateVersion, string>> = {
  hu: {
    1: `Kedves {name}!

Köszönöm szépen a visszajelzését!

Sajnálom, hogy jelenleg nincs nyitott pozíciójuk, ugyanakkor örülnék, ha a jövőben egy számomra megfelelő lehetőség esetén felvennék velem a kapcsolatot.

Köszönöm még egyszer a válaszát, és remélem, hogy a jövőben lesz lehetőségünk együtt dolgozni!`,
    2: `Kedves {name}!

Köszönöm szépen a visszajelzésedet!

Sajnálom, hogy jelenleg nincs nyitott pozíciótok, ugyanakkor örülnék, ha a jövőben egy számomra megfelelő lehetőség esetén felvennétek velem a kapcsolatot.

Köszönöm még egyszer a válaszodat, és remélem, hogy a jövőben lesz lehetőségünk együtt dolgozni!`,
    3: `Kedves {name}!

Köszönöm szépen a visszajelzését!

Sajnálom, hogy jelenleg nincs nyitott pozíciójuk, de a jövőben is figyelemmel fogom kísérni a karrieroldalukat az új lehetőségek miatt. Ugyanakkor nagyon örülnék, ha egy számomra megfelelő pozíció megnyílásakor Önök is felvennék velem a kapcsolatot.

Mellékelten küldök egy rövid dokumentumot is, amelyben részletesebben bemutatom a szakmai hátteremet, valamint néhány korábbi projektemet és azok legfontosabb eredményeit.

Köszönöm még egyszer a válaszát, és remélem, hogy a jövőben lesz lehetőségünk együtt dolgozni!`,
    4: `Kedves {name}!

Köszönöm szépen a visszajelzésedet!

Sajnálom, hogy jelenleg nincs nyitott pozíciótok, de a jövőben is figyelemmel fogom kísérni a karrieroldalatokat az új lehetőségek miatt. Ugyanakkor nagyon örülnék, ha egy számomra megfelelő pozíció megnyílásakor ti is felvennétek velem a kapcsolatot.

Mellékelten küldök egy rövid dokumentumot is, amelyben részletesebben bemutatom a szakmai hátteremet, valamint néhány korábbi projektemet és azok legfontosabb eredményeit.

Köszönöm még egyszer a válaszodat, és remélem, hogy a jövőben lesz lehetőségünk együtt dolgozni!`,
  },
  en: {
    1: `Dear {name},

Thank you very much for your response.

I'm sorry to hear that you don't currently have any open positions. However, I would appreciate it if you could reach out to me in the future should a suitable opportunity arise.

Thank you again for your reply. I hope we will have the opportunity to work together in the future.`,
    2: `Hi {name},

Thank you very much for getting back to me!

I'm sorry to hear that you don't currently have any open positions, but I would appreciate it if you kept me in mind and reached out in the future should a suitable opportunity come up.

Thanks again for your reply, and I hope we'll have the chance to work together in the future!`,
    3: `Dear {name},

Thank you very much for your response.

I'm sorry to hear that you don't currently have any open positions, but I will continue to keep an eye on your careers page for future opportunities. In the meantime, I would greatly appreciate it if you could also reach out to me should a suitable position become available.

I've also attached a short document outlining my professional background and highlighting some of my previous projects and their key achievements.

Thank you again for your response. I hope we will have the opportunity to work together in the future!`,
    4: `Hi {name},

Thank you very much for getting back to me!

I'm sorry to hear that you don't currently have any open positions, but I'll keep an eye on your careers page for future opportunities. I'd also really appreciate it if you kept me in mind and reached out if a suitable position becomes available.

I've also attached a short document outlining my professional background and highlighting some of my previous projects and their key achievements.

Thanks again for your reply, and I hope we'll have the chance to work together in the future!`,
  },
};

/**
 * Döntési szabályok: magázó → 1/3, tegező → 2/4; ha megy csatolmány, a
 * karrieroldalas-csatolmányos 3/4, különben a rövid 1/2 (csatolmány nélkül
 * nem állítjuk, hogy csatoltunk).
 */
export function templateVersion(
  informal: boolean,
  withAttachment: boolean,
): TemplateVersion {
  if (withAttachment) return informal ? 4 : 3;
  return informal ? 2 : 1;
}

/** A kiválasztott mintalevél, a megszólításba írt névvel; név nélkül a cég csapata. */
export function renderTemplate(options: {
  language: TemplateLanguage;
  informal: boolean;
  withAttachment: boolean;
  name: string | null;
  company: string;
}): string {
  const name =
    options.name?.trim() ||
    (options.language === "hu"
      ? `${options.company} Csapat`
      : `${options.company} Team`);
  const version = templateVersion(options.informal, options.withAttachment);
  return LETTERS[options.language][version].replace("{name}", name);
}
