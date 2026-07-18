export type LinkItem = {
  id: number;
  t: string;
  u: string;
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
};

export type ApiCategory = {
  id: number;
  name: string;
  items: ApiLink[];
};

export type DataResponse = {
  categories: ApiCategory[];
};
