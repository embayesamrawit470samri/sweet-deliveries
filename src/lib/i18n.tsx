import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Lang = 'en' | 'am' | 'ti';

const dict: Record<string, Record<Lang, string>> = {
  Dashboard:      { en: 'Dashboard',     am: 'ዳሽቦርድ',      ti: 'ዳሽቦርድ' },
  Categories:     { en: 'Categories',    am: 'ምድቦች',       ti: 'ምድቦች' },
  Services:       { en: 'Services',      am: 'አገልግሎቶች',    ti: 'ኣገልግሎታት' },
  Deliveries:     { en: 'Deliveries',    am: 'ማቅረቦች',      ti: 'ምቕራባት' },
  'My Deliveries':{ en: 'My Deliveries', am: 'የእኔ ማቅረቦች',  ti: 'ናተይ ምቕራባት' },
  Orders:         { en: 'Orders',        am: 'ትዕዛዞች',      ti: 'ትእዛዛት' },
  Cashier:        { en: 'Cashier',       am: 'ካሸር',        ti: 'ካሸር' },
  Reports:        { en: 'Reports',       am: 'ሪፖርቶች',      ti: 'ሪፖርታት' },
  Users:          { en: 'Users',         am: 'ተጠቃሚዎች',    ti: 'ተጠቀምቲ' },
  'Sign Out':     { en: 'Sign Out',      am: 'ውጣ',         ti: 'ውጻእ' },
  Language:       { en: 'Language',      am: 'ቋንቋ',        ti: 'ቋንቋ' },
};

interface I18n { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; }
const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'en');
  useEffect(() => { localStorage.setItem('lang', lang); }, [lang]);
  const t = (k: string) => dict[k]?.[lang] ?? k;
  return <Ctx.Provider value={{ lang, setLang: setLangState, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
