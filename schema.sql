-- 分类表
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- 标签(网站)表
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- 初始示例数据，可自行删改
INSERT INTO categories (name, sort_order) VALUES ('开发工具', 1);
INSERT INTO categories (name, sort_order) VALUES ('设计参考', 2);
INSERT INTO categories (name, sort_order) VALUES ('日常常用', 3);

INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'GitHub', 'github.com', 1);
INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'MDN Web Docs', 'developer.mozilla.org', 2);
INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'Cloudflare', 'dash.cloudflare.com', 3);
INSERT INTO links (category_id, title, url, sort_order) VALUES (1, 'Stack Overflow', 'stackoverflow.com', 4);

INSERT INTO links (category_id, title, url, sort_order) VALUES (2, 'Dribbble', 'dribbble.com', 1);
INSERT INTO links (category_id, title, url, sort_order) VALUES (2, 'Figma', 'figma.com', 2);

INSERT INTO links (category_id, title, url, sort_order) VALUES (3, 'Gmail', 'mail.google.com', 1);
INSERT INTO links (category_id, title, url, sort_order) VALUES (3, 'Notion', 'notion.so', 2);
INSERT INTO links (category_id, title, url, sort_order) VALUES (3, 'B 站', 'bilibili.com', 3);
