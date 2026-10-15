// Navigation uses public store information only. Never pass an account token or
// the user's precise location to a third-party map link.
type StoreAddress = { name: string; address?: string };
const clean = (value: string | undefined, max: number) =>
  (value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function storeNavigation(store: StoreAddress, city: string) {
  const name = clean(store.name, 160);
  const address = clean(store.address, 300);
  const searchCity = clean(city, 40);
  if (!name && !address) return null;
  const url = new URL("https://uri.amap.com/search");
  url.search = new URLSearchParams({
    keyword: [name, address].filter(Boolean).join(" "),
    ...(searchCity ? { city: searchCity } : {}),
    view: "list",
    src: "maimai-collab-gallery",
    callnative: "1",
  }).toString();
  return {
    url: url.toString(),
    text: [searchCity, name, address].filter(Boolean).join("\n"),
  };
}
