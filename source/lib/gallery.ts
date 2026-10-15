export type Point = { lat: number; lng: number };
export type Activity = {
  id: string; title: string; brand: string; body: string; images: string[];
  dates: string[]; purchase: string; starts: string | null; ends: string | null;
  status: "announced" | "upcoming" | "started" | "ended";
  keywords: string[]; kind: string | null;
};
export type Store = { id: string; beCode: string; name: string; address: string;
  open: boolean | null; hours: string; point: Point | null; coordinateSystem: string | null };
export type Offer = { code: string; name: string; price: string | null; image: string | null };
export type Availability = { storeId: string; status: "listed" | "not-listed" | "closed" | "unknown";
  offers: Offer[]; checkedAt: string; message: string };
export type RouteResult = { mode: "walking" | "cycling"; distance: number; duration: number;
  coordinates: [number, number][]; steps: { text: string; distance: number }[];
  startSnap: number; endSnap: number; provider: string };

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function str(value: unknown): string { return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""; }
export function officialImage(value: unknown): string | null {
  try { const u = new URL(str(value)); return u.protocol === "https:" && !u.username && !u.password &&
    ["mcd.cn", "mcdchina.net", "mcdonalds.com.cn"].some(h => u.hostname === h || u.hostname.endsWith("." + h)) ? u.href : null; } catch { return null; }
}
export function validPoint(value: unknown): value is Point {
  const p = object(value); return typeof p.lat === "number" && typeof p.lng === "number" &&
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180;
}
function hash(s: string): string { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const MERCH = ["徽章", "棒球帽", "丝巾", "帆布袋", "托特包", "公仔", "玩偶", "沙发", "钥匙扣", "马克杯", "水杯", "小卡"];
export function activityKeywords(title: string, body: string): { kind: string | null; keywords: string[] } {
  // Prefer the subject of the headline, not another accessory mentioned later.
  const primary = title.split("\n")[0];
  const lead = primary + "\n" + body.split("\n").slice(0, 2).join("\n");
  const kind = MERCH.filter(k => lead.includes(k)).sort((a,b)=>lead.indexOf(a)-lead.indexOf(b))[0] ?? null;
  if (kind) return { kind, keywords: [kind] };
  const products = [...body.matchAll(/[「【“]([^」】”]{2,22})[」】”]/g)].map(m => m[1]);
  for (const term of ["龙焰", "蓝莓爆爆珠", "韩式", "厚松饼", "PEACEMINUSONE", "G-DRAGON"]) if ((title + body).includes(term)) products.push(term);
  const brands = [...title.matchAll(/[×Xx]\s*([A-Za-z][A-Za-z0-9-]{3,})/g)].map(m => m[1]);
  return { kind, keywords: [...new Set([...products, ...brands])].slice(0, 8) };
}
function dateFromText(text: string, year: number, end = false): string | null {
  const match = end ? /(?:至|到|—|~|～)\s*(\d{1,2})月(\d{1,2})日/.exec(text) : /(\d{1,2})月(\d{1,2})日\s*(?:(\d{1,2})[:：](\d{2}))?[^\n]{0,12}(?:开售|开抢|上线|起|正式)/.exec(text);
  if (!match) return null;
  const month = Number(match[1]), day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
export function normalizeCalendar(payload: unknown, now = new Date()): Activity[] {
  const data = object(object(payload).data); const days = Array.isArray(data.dailyList) ? data.dailyList : [];
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const result = new Map<string, Activity>();
  for (const raw of days) {
    const day = object(raw); if (!Array.isArray(day.events)) continue;
    for (const entry of day.events) {
      const event = object(entry), article = object(event.articleDto);
      const brand = str(article.title) || str(event.activityTitle);
      const body = str(article.content).replace(/\r\n?/g,"\n");
      if (!/(?:联名|联动|合作|PEACEMINUSONE|G[ -]DRAGON)/i.test(brand + " " + body)) continue;
      const firstLine=body.split("\n")[0];
      const title = ((/^麦当劳\s*(?:[X×]|联动)/i.test(brand)?firstLine:brand) || firstLine || brand).replace(/^周边第.弹[—－-]+/, "");
      const id = hash(brand + "\n" + body); const date = str(day.date);
      if (result.has(id)) { const previous=result.get(id)!; if (date && !previous.dates.includes(date)) previous.dates.push(date); continue; }
      const {kind, keywords} = activityKeywords(title + "\n" + brand, body);
      const year = Number((date || today).slice(0,4)); const starts=dateFromText(body,year), ends=dateFromText(body,year,true);
      const status = ends && ends < today ? "ended" : starts && starts > today ? "upcoming" : starts ? "started" : "announced";
      const images = (Array.isArray(article.imgList) ? article.imgList : [event.activityBgImg]).map(officialImage).filter((x):x is string=>!!x);
      result.set(id, {id,title,brand,body,dates:date?[date]:[],images,kind,keywords,starts,ends,status,
        purchase: body.split("\n").find(line=>/(消费|加购|加\s*\d|元.*(?:起|得))/.test(line)) || "以活动正文为准"});
    }
  }
  return [...result.values()].sort((a,b) => Number(a.status==="ended")-Number(b.status==="ended") || Number(a.status==="upcoming")-Number(b.status==="upcoming") || (b.starts || "").localeCompare(a.starts || ""));
}
export function normalizeStores(payload: unknown): Store[] {
  const d = object(payload).data; const rows = Array.isArray(d) ? d : object(d).stores;
  if (!Array.isArray(rows)) return [];
  return rows.map(object).filter(s=>str(s.storeCode)).map(s=>{
    const p={lat:Number(s.latitude ?? s.lat),lng:Number(s.longitude ?? s.lng)};
    return {id:str(s.storeCode),beCode:str(s.beCode),name:str(s.storeName)||str(s.name),address:str(s.address),
      open:typeof s.businessStatus==="boolean"?s.businessStatus:null,
      hours:[str(s.businessStartTime),str(s.businessEndTime)].filter(Boolean).join("–"),
      point:validPoint(p)&&p.lat!==0&&p.lng!==0?p:null,coordinateSystem:str(s.coordinateSystem)||str(s.coordType)||null};
  }).slice(0,20);
}
export function matchOffers(payload: unknown, activity: Pick<Activity,"keywords"|"kind">): Offer[] {
  const data=object(object(payload).data), meals=object(data.meals); const terms=activity.keywords.map(s=>s.normalize("NFKC").toLowerCase()).filter(s=>s.length>=2);
  const offers:Offer[]=[];
  for (const [code,value] of Object.entries(meals)) {
    const m=object(value),name=str(m.name); const normalized=name.normalize("NFKC").toLowerCase();
    if (!name || !terms.some(t=>normalized.includes(t))) continue;
    if (activity.kind && !normalized.includes(activity.kind)) continue;
    if (m.soldOut===true || m.isSoldOut===true || m.available===false) continue;
    const price=str(m.currentPrice ?? m.price);
    offers.push({code,name,price:/^\d+(\.\d{1,2})?$/.test(price)?price:null,image:officialImage(m.image)});
  }
  return offers.slice(0,20);
}
