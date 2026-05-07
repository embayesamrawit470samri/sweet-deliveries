// Gregorian <-> Ethiopian (JDN-based)
const ETH_EPOCH = 1723856; // JDN of 1 Meskerem 1 EE

function gregorianToJDN(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export function toEthiopian(date: Date): { year: number; month: number; day: number } {
  const jdn = gregorianToJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const r = (jdn - ETH_EPOCH) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - ETH_EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

const MONTHS_EN = ['Meskerem','Tikimt','Hidar','Tahsas','Tir','Yekatit','Megabit','Miazia','Ginbot','Sene','Hamle','Nehase','Pagume'];
const MONTHS_AM = ['መስከረም','ጥቅምት','ኅዳር','ታኅሣሥ','ጥር','የካቲት','መጋቢት','ሚያዝያ','ግንቦት','ሰኔ','ሐምሌ','ነሐሴ','ጳጉሜ'];

export function formatEthiopian(input: Date | string | null | undefined, lang: 'en' | 'am' | 'ti' = 'en', withTime = false): string {
  if (!input) return '';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(date.getTime())) return '';
  const { year, month, day } = toEthiopian(date);
  const months = lang === 'en' ? MONTHS_EN : MONTHS_AM;
  const base = `${day} ${months[month - 1]} ${year}`;
  if (!withTime) return base;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${base} ${hh}:${mm}`;
}
