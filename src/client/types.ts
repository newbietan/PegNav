export type LinkItem = {
  id: number;
  t: string;
  u: string;
  /** 已持久化的 favicon 源地址（外链或 data URI） */
  favicon?: string | null;
};

export type Section = {
  id: number;
  cat: string;
  items: LinkItem[];
};

export type ApiLink = {
  id: number;
  title: string;
  url: string;
  favicon_url?: string | null;
};

export type ApiCategory = {
  id: number;
  name: string;
  items: ApiLink[];
};

export type DataResponse = {
  categories: ApiCategory[];
};
